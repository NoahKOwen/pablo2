import type { PrismaClient } from "../db/client";
import { type Activity, type InsertActivity } from "@shared/schema";
import { convertPrismaActivity } from "./types";

export function createActivityMethods(prisma: PrismaClient) {
  return {
    async createActivity(activity: InsertActivity): Promise<Activity> {
      const data: any = {
        userId: activity.userId,
        type: activity.type,
        description: activity.description,
      };

      if (activity.metadata !== undefined && activity.metadata !== null) {
        data.metadata = activity.metadata;
      }

      const newActivity = await prisma.activity.create({ data });
      return convertPrismaActivity(newActivity);
    },

    async getActivities(
      userId: string,
      limit: number = 10
    ): Promise<Activity[]> {
      const activities = await prisma.activity.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return activities.map(convertPrismaActivity);
    },
  };
}
