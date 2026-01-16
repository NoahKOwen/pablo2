// server/notifications.ts
import { storage } from "./storage";
import webpush from "web-push";

function extractVapidKey(raw: string | undefined, field: "publicKey" | "privateKey"): string {
  if (!raw) return "";

  // Try to parse as JSON: { "publicKey": "...", "privateKey": "..." }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed[field] === "string") {
      return parsed[field];
    }
  } catch {
    // Not JSON, fall through
  }

  // Assume it's already the raw key string
  return raw.trim();
}

const VAPID_PUBLIC_KEY = extractVapidKey(process.env.VAPID_PUBLIC_KEY, "publicKey");
const VAPID_PRIVATE_KEY = extractVapidKey(process.env.VAPID_PRIVATE_KEY, "privateKey");
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@xnrt.org";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn("[webpush] VAPID keys missing – push notifications will not work correctly");
}

const ENABLE_PUSH_NOTIFICATIONS = process.env.ENABLE_PUSH_NOTIFICATIONS !== "false";

export async function sendPushNotification(
  userId: string,
  payload: { title: string; body: string; icon?: string; badge?: string; data?: any }
): Promise<boolean> {
  if (!ENABLE_PUSH_NOTIFICATIONS) {
    console.log(`Push notifications disabled`);
    return false;
  }

  try {
    const subscriptions = await storage.getUserPushSubscriptions(userId);

    if (subscriptions.length === 0) {
      console.log(`No push subscriptions found for user ${userId}`);
      return false;
    }

    const pushPayload = JSON.stringify({
      ...payload,
      icon: payload.icon || "/icon-192.png",
      badge: payload.badge || "/icon-192.png",
    });

    let successCount = 0;
    const sendPromises = subscriptions.map(async (subscription) => {
      try {
        const pushSubscription = {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        };

        await webpush.sendNotification(pushSubscription, pushPayload);
        console.log(`Push notification sent successfully to ${subscription.endpoint}`);
        successCount++;
      } catch (error: any) {
        console.error(`Error sending push notification to ${subscription.endpoint}:`, error);

        if (error.statusCode === 404 || error.statusCode === 410) {
          console.log(`Subscription expired/gone, disabling: ${subscription.endpoint}`);
          await storage.disablePushSubscription(subscription.endpoint);
        }
      }
    });

    await Promise.allSettled(sendPromises);
    return successCount > 0;
  } catch (error) {
    console.error("Error in sendPushNotification:", error);
    return false;
  }
}

export async function notifyUser(
  userId: string,
  notification: {
    type: string;
    title: string;
    message: string;
    metadata?: any;
    url?: string;
  }
) {
  try {
    const createdNotification = await storage.createNotification({
      userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      metadata: notification.metadata,
    });

    // Safely normalize metadata for spreading into data
    const meta =
      notification.metadata && typeof notification.metadata === "object"
        ? notification.metadata
        : notification.metadata !== undefined
          ? { metadata: notification.metadata }
          : {};

    const pushPayload = {
      title: notification.title,
      body: notification.message,
      data: {
        url: notification.url || "/",
        type: notification.type,
        id: createdNotification.id,
        ...meta,
      },
    };

    try {
      const pushSuccess = await sendPushNotification(userId, pushPayload);

      const currentAttempts = createdNotification.deliveryAttempts || 0;

      if (pushSuccess) {
        await storage.updateNotificationDelivery(createdNotification.id, {
          deliveredAt: new Date(),
          deliveryAttempts: currentAttempts + 1,
          lastAttemptAt: new Date(),
          pendingPush: false,
        });
      } else if (ENABLE_PUSH_NOTIFICATIONS) {
        await storage.updateNotificationDelivery(createdNotification.id, {
          deliveryAttempts: currentAttempts + 1,
          lastAttemptAt: new Date(),
          pendingPush: true,
          pushError: "No active subscriptions or push failed",
        });
      }
    } catch (pushError: any) {
      console.error("Error sending push notification (non-blocking):", pushError);
      if (ENABLE_PUSH_NOTIFICATIONS) {
        const currentAttempts = createdNotification.deliveryAttempts || 0;
        await storage.updateNotificationDelivery(createdNotification.id, {
          deliveryAttempts: currentAttempts + 1,
          lastAttemptAt: new Date(),
          pendingPush: true,
          pushError: pushError.message || "Unknown push error",
        });
      }
    }

    return createdNotification;
  } catch (error: any) {
    console.error("Error in notifyUser:", error);
    throw error;
  }
}
