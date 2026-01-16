import type { PrismaClient } from "../db/client";
import {
  type Notification,
  type InsertNotification,
  type PushSubscription,
  type InsertPushSubscription,
} from "@shared/schema";
import { convertPrismaNotification, convertPrismaPushSubscription } from "./types";

export function createNotificationMethods(prisma: PrismaClient) {
  return {
    async createNotification(
      notification: InsertNotification
    ): Promise<Notification> {
      const data: any = {
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        read: notification.read || false,
      };

      if (notification.metadata !== undefined && notification.metadata !== null) {
        data.metadata =
          typeof notification.metadata === "string"
            ? notification.metadata
            : JSON.stringify(notification.metadata);
      }

      const newNotification = await prisma.notification.create({ data });
      return convertPrismaNotification(newNotification);
    },

    async getNotifications(
      userId: string,
      limit: number = 20
    ): Promise<Notification[]> {
      const notifications = await prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return notifications.map(convertPrismaNotification);
    },

    async getUnreadNotificationCount(userId: string): Promise<number> {
      return await prisma.notification.count({
        where: {
          userId,
          read: false,
        },
      });
    },

    async markNotificationAsRead(id: string): Promise<Notification> {
      const notification = await prisma.notification.update({
        where: { id },
        data: { read: true },
      });
      return convertPrismaNotification(notification);
    },

    async markAllNotificationsAsRead(userId: string): Promise<void> {
      await prisma.notification.updateMany({
        where: {
          userId,
          read: false,
        },
        data: { read: true },
      });
    },

    async getNotificationsPendingPush(
      limit: number = 50
    ): Promise<Notification[]> {
      const notifications = await prisma.notification.findMany({
        where: {
          pendingPush: true,
          deliveryAttempts: {
            lt: 5,
          },
        },
        orderBy: { createdAt: "asc" },
        take: limit,
      });
      return notifications.map(convertPrismaNotification);
    },

    async updateNotificationDelivery(
      id: string,
      updates: {
        deliveredAt?: Date;
        deliveryAttempts?: number;
        lastAttemptAt?: Date;
        pendingPush?: boolean;
        pushError?: string;
      }
    ): Promise<Notification> {
      const data: any = {};
      if (updates.deliveredAt !== undefined)
        data.deliveredAt = updates.deliveredAt;
      if (updates.deliveryAttempts !== undefined)
        data.deliveryAttempts = updates.deliveryAttempts;
      if (updates.lastAttemptAt !== undefined)
        data.lastAttemptAt = updates.lastAttemptAt;
      if (updates.pendingPush !== undefined)
        data.pendingPush = updates.pendingPush;
      if (updates.pushError !== undefined) data.pushError = updates.pushError;

      const notification = await prisma.notification.update({
        where: { id },
        data,
      });
      return convertPrismaNotification(notification);
    },

    async getPushSubscription(
      userId: string,
      endpoint: string
    ): Promise<PushSubscription | null> {
      try {
        const subscription = await prisma.pushSubscription.findFirst({
          where: { userId, endpoint },
        });
        return subscription ? convertPrismaPushSubscription(subscription) : null;
      } catch (error) {
        console.error("Error getting push subscription:", error);
        return null;
      }
    },

    async createPushSubscription(
      data: InsertPushSubscription
    ): Promise<PushSubscription> {
      try {
        const subscription = await prisma.pushSubscription.upsert({
          where: {
            userId_endpoint: {
              userId: data.userId,
              endpoint: data.endpoint,
            },
          },
          update: {
            p256dh: data.p256dh,
            auth: data.auth,
            expirationTime: data.expirationTime || null,
            enabled: true,
            updatedAt: new Date(),
          },
          create: {
            userId: data.userId,
            endpoint: data.endpoint,
            p256dh: data.p256dh,
            auth: data.auth,
            expirationTime: data.expirationTime || null,
            enabled: true,
          },
        });
        return convertPrismaPushSubscription(subscription);
      } catch (error) {
        console.error("Error creating push subscription:", error);
        throw new Error("Failed to create push subscription");
      }
    },

    async deletePushSubscription(
      userId: string,
      endpoint: string
    ): Promise<void> {
      try {
        await prisma.pushSubscription.deleteMany({
          where: { userId, endpoint },
        });
      } catch (error) {
        console.error("Error deleting push subscription:", error);
        throw new Error("Failed to delete push subscription");
      }
    },

    async getUserPushSubscriptions(
      userId: string
    ): Promise<PushSubscription[]> {
      try {
        const subscriptions = await prisma.pushSubscription.findMany({
          where: { userId, enabled: true },
          orderBy: { createdAt: "desc" },
        });
        return subscriptions.map(convertPrismaPushSubscription);
      } catch (error) {
        console.error("Error getting user push subscriptions:", error);
        return [];
      }
    },

    async disablePushSubscription(endpoint: string): Promise<void> {
      try {
        await prisma.pushSubscription.updateMany({
          where: { endpoint },
          data: { enabled: false, updatedAt: new Date() },
        });
      } catch (error) {
        console.error("Error disabling push subscription:", error);
      }
    },
  };
}
