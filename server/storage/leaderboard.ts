import type { PrismaClient } from "../db/client";
import { generateAnonymizedHandle } from "./types";

export function createLeaderboardMethods(prisma: PrismaClient) {
  return {
    async getXPLeaderboard(
      currentUserId: string,
      period: string,
      category: string,
      isAdmin: boolean = false
    ): Promise<{ leaderboard: any[]; userPosition: any | null }> {
      const now = new Date();
      let startDate: Date | null = null;

      switch (period) {
        case "daily":
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case "weekly": {
          const dayOfWeek = now.getDay();
          startDate = new Date(
            now.getTime() - dayOfWeek * 24 * 60 * 60 * 1000
          );
          startDate.setHours(0, 0, 0, 0);
          break;
        }
        case "monthly":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "all-time":
        default:
          startDate = null;
          break;
      }

      if (category === "overall") {
        const users = await prisma.user.findMany({
          select: {
            id: true,
            username: true,
            email: true,
            xp: true,
          },
          orderBy: { xp: "desc" },
          take: 100,
        });

        const leaderboard = users.slice(0, 10).map((user: any, index: number) => {
          const baseData = {
            xp: user.xp,
            categoryXp: user.xp,
            rank: index + 1,
          };

          if (isAdmin) {
            return {
              ...baseData,
              userId: user.id,
              username: user.username,
              email: user.email,
              displayName: user.username || user.email,
            };
          }

          return {
            ...baseData,
            displayName: generateAnonymizedHandle(user.id),
          };
        });

        const currentUserRank = users.findIndex((u: any) => u.id === currentUserId);
        let userPosition: any = null;

        if (currentUserRank !== -1 && currentUserRank > 9) {
          const currentUser = users[currentUserRank];
          const baseData = {
            xp: currentUser.xp,
            categoryXp: currentUser.xp,
            rank: currentUserRank + 1,
          };

          if (isAdmin) {
            userPosition = {
              ...baseData,
              userId: currentUser.id,
              username: currentUser.username,
              email: currentUser.email,
              displayName: currentUser.username || currentUser.email,
            };
          } else {
            userPosition = {
              ...baseData,
              displayName: "You",
            };
          }
        }

        return { leaderboard, userPosition };
      }

      const typeFilter =
        category === "mining"
          ? "mining"
          : category === "staking"
          ? "stak"
          : "referral";

      const users = await prisma.user.findMany({
        select: {
          id: true,
          username: true,
          email: true,
          xp: true,
        },
        orderBy: { xp: "desc" },
        take: 100,
      });

      const userXPData = await Promise.all(
        users.map(async (user: any) => {
          const whereClause: any = {
            userId: user.id,
            type: { contains: typeFilter },
          };

          if (startDate) {
            whereClause.createdAt = { gte: startDate };
          }

          const activities = await prisma.activity.findMany({
            where: whereClause,
          });

          let categoryXp = 0;

          for (const activity of activities) {
            const desc = activity.description || "";

            if (category === "mining") {
              const xpMatch = desc.match(/(\d+)\s*XP/i);
              if (xpMatch) {
                categoryXp += parseInt(xpMatch[1], 10);
              }
            } else {
              const xnrtMatch = desc.match(/([\d.]+)\s*XNRT/i);
              if (xnrtMatch) {
                categoryXp += parseFloat(xnrtMatch[1]);
              }
            }
          }

          return {
            userId: user.id,
            username: user.username,
            email: user.email,
            xp: user.xp,
            categoryXp,
          };
        })
      );

      userXPData.sort((a: any, b: any) => b.categoryXp - a.categoryXp);

      const leaderboard = userXPData.slice(0, 10).map((user: any, index: number) => {
        const baseData = {
          xp: user.xp,
          categoryXp: user.categoryXp,
          rank: index + 1,
        };

        if (isAdmin) {
          return {
            ...baseData,
            userId: user.userId,
            username: user.username,
            email: user.email,
            displayName: user.username || user.email,
          };
        }

        return {
          ...baseData,
          displayName: generateAnonymizedHandle(user.userId),
        };
      });

      const currentUserRank = userXPData.findIndex(
        (u: any) => u.userId === currentUserId
      );
      let userPosition: any = null;

      if (currentUserRank !== -1 && currentUserRank > 9) {
        const currentUser = userXPData[currentUserRank];
        const baseData = {
          xp: currentUser.xp,
          categoryXp: currentUser.categoryXp,
          rank: currentUserRank + 1,
        };

        if (isAdmin) {
          userPosition = {
            ...baseData,
            userId: currentUser.userId,
            username: currentUser.username,
            email: currentUser.email,
            displayName: currentUser.username || currentUser.email,
          };
        } else {
          userPosition = {
            ...baseData,
            displayName: "You",
          };
        }
      }

      return { leaderboard, userPosition };
    },
  };
}
