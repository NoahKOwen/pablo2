// server/routes/notifications.ts
import { Router } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin, validateCSRF } from "../auth/middleware";
import { sendPushNotification } from "../notifications";
import { prisma, VAPID_PUBLIC_KEY, pushSubscriptionLimiter } from "./shared";
import { withRetry } from "../lib/prisma-retry";

// Simple in-memory cache for unread counts to reduce frequent DB hits from polling.
// Keyed by userId -> { count: number, expiresAt: number }
const unreadCountCache = new Map<string, { count: number; expiresAt: number }>();
// Increase TTL to reduce frequent DB hits from aggressive polling.
// Consider tuning via env var later if necessary.
const UNREAD_COUNT_TTL_MS = 15 * 1000; // 15 seconds

const router = Router();

/**
 * Get recent notifications for the authenticated user.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;

    const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const limit = Number.isNaN(rawLimit)
      ? 20
      : Math.min(Math.max(rawLimit, 1), 100); // clamp between 1 and 100

    const notifications = await withRetry(() => storage.getNotifications(userId, limit));
    res.json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
});

/**
 * Get unread notification count for the authenticated user.
 */
router.get("/unread-count", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const now = Date.now();
    const cached = unreadCountCache.get(userId);
    if (cached && cached.expiresAt > now) {
      return res.json({ count: cached.count, cached: true });
    }

    const count = await withRetry(() => storage.getUnreadNotificationCount(userId));
    // store in cache
    unreadCountCache.set(userId, { count, expiresAt: now + UNREAD_COUNT_TTL_MS });
    res.json({ count });
  } catch (error) {
    console.error("Error fetching unread notification count:", error);
    res.status(500).json({ message: "Failed to fetch unread count" });
  }
});

/**
 * Mark a single notification as read.
 * Important: uses CSRF protection because it mutates state.
 */
router.patch("/:id/read", requireAuth, validateCSRF, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.authUser!.id;

    const notification = await prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    const updatedNotification = await storage.markNotificationAsRead(id);
    // invalidate unread-count cache for this user
    try { unreadCountCache.delete(userId); } catch (e) {}
    res.json(updatedNotification);
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ message: "Failed to mark notification as read" });
  }
});

/**
 * Mark all notifications for the current user as read.
 * Important: uses CSRF protection because it mutates state.
 */
router.post("/mark-all-read", requireAuth, validateCSRF, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    await storage.markAllNotificationsAsRead(userId);
    // invalidate unread-count cache for this user
    try { unreadCountCache.delete(userId); } catch (e) {}
    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({ message: "Failed to mark all notifications as read" });
  }
});

export default router;

// ---- Push notifications router ----

export const pushRouter = Router();

/**
 * Public VAPID key for Web Push subscription.
 */
pushRouter.get("/vapid-public-key", async (_req, res) => {
  try {
    res.json({ publicKey: VAPID_PUBLIC_KEY });
  } catch (error) {
    console.error("Error getting VAPID public key:", error);
    res.status(500).json({ message: "Failed to get VAPID public key" });
  }
});

/**
 * Subscribe current user to web push notifications.
 */
pushRouter.post(
  "/subscribe",
  requireAuth,
  pushSubscriptionLimiter,
  validateCSRF,
  async (req, res) => {
    try {
      const userId = req.authUser!.id;
      const { endpoint, keys, expirationTime } = req.body;

      if (!endpoint || typeof endpoint !== "string") {
        return res.status(400).json({ message: "Invalid endpoint" });
      }
      if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") {
        return res.status(400).json({ message: "Invalid subscription keys" });
      }
      if (!endpoint.startsWith("https://")) {
        return res.status(400).json({ message: "Endpoint must be HTTPS URL" });
      }

      const base64Regex = /^[A-Za-z0-9+/=_-]+$/;
      if (!base64Regex.test(keys.p256dh) || !base64Regex.test(keys.auth)) {
        return res.status(400).json({ message: "Keys must be valid base64 strings" });
      }

      const subscription = await storage.createPushSubscription({
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        expirationTime: expirationTime || null,
      });

      res.json(subscription);
    } catch (error) {
      console.error("Error creating push subscription:", error);
      res.status(500).json({ message: "Failed to create push subscription" });
    }
  }
);

/**
 * Unsubscribe current user from a given endpoint.
 */
pushRouter.delete(
  "/unsubscribe",
  requireAuth,
  pushSubscriptionLimiter,
  validateCSRF,
  async (req, res) => {
    try {
      const userId = req.authUser!.id;
      const { endpoint } = req.body;

      if (!endpoint || typeof endpoint !== "string") {
        return res.status(400).json({ message: "Invalid endpoint" });
      }

      await storage.deletePushSubscription(userId, endpoint);
      res.json({ message: "Successfully unsubscribed from push notifications" });
    } catch (error) {
      console.error("Error deleting push subscription:", error);
      res.status(500).json({ message: "Failed to delete push subscription" });
    }
  }
);

/**
 * List current user's push subscriptions.
 */
pushRouter.get("/subscriptions", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const subscriptions = await storage.getUserPushSubscriptions(userId);
    res.json(subscriptions);
  } catch (error) {
    console.error("Error getting push subscriptions:", error);
    res.status(500).json({ message: "Failed to get push subscriptions" });
  }
});

/**
 * Admin endpoint to send a test push notification to a specific user.
 */
pushRouter.post("/test", requireAuth, requireAdmin, validateCSRF, async (req, res) => {
  try {
    const { userId, title, body } = req.body;

    if (!userId || !title || !body) {
      return res.status(400).json({ message: "userId, title, and body are required" });
    }

    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    await sendPushNotification(userId, { title, body });
    res.json({ message: "Test push notification sent successfully" });
  } catch (error) {
    console.error("Error sending test push notification:", error);
    res.status(500).json({ message: "Failed to send test push notification" });
  }
});
