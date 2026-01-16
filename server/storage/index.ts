import { prisma } from "../db/client";
import { IStorage } from "./interface";

import { createUserMethods } from "./users";
import { createBalanceMethods } from "./balances";
import { createStakeMethods } from "./stakes";
import { createMiningMethods } from "./mining";
import { createReferralMethods } from "./referrals";
import { createTransactionMethods } from "./transactions";
import { createTaskMethods } from "./tasks";
import { createNotificationMethods } from "./notifications";
import { createLeaderboardMethods } from "./leaderboard";
import { createActivityMethods } from "./activities";

export class DatabaseStorage implements IStorage {
  private userMethods: ReturnType<typeof createUserMethods>;
  private balanceMethods: ReturnType<typeof createBalanceMethods>;
  private stakeMethods: ReturnType<typeof createStakeMethods>;
  private miningMethods: ReturnType<typeof createMiningMethods>;
  private referralMethods: ReturnType<typeof createReferralMethods>;
  private transactionMethods: ReturnType<typeof createTransactionMethods>;
  private taskMethods: ReturnType<typeof createTaskMethods>;
  private notificationMethods: ReturnType<typeof createNotificationMethods>;
  private leaderboardMethods: ReturnType<typeof createLeaderboardMethods>;
  private activityMethods: ReturnType<typeof createActivityMethods>;

  constructor() {
    // “leaf” modules first
    this.balanceMethods = createBalanceMethods(prisma);
    this.transactionMethods = createTransactionMethods(prisma);
    this.notificationMethods = createNotificationMethods(prisma);
    this.leaderboardMethods = createLeaderboardMethods(prisma);
    this.activityMethods = createActivityMethods(prisma);

    // modules that need storage (cross-module)
    this.userMethods = createUserMethods(prisma, this);
    this.stakeMethods = createStakeMethods(prisma, this);
    this.miningMethods = createMiningMethods(prisma, this);
    this.referralMethods = createReferralMethods(prisma, this);
    this.taskMethods = createTaskMethods(prisma, this);
  }

  getUser = (id: string) => this.userMethods.getUser(id);
  upsertUser = (user: any, referralCode?: string) =>
    this.userMethods.upsertUser(user, referralCode);
  updateUser = (userId: string, updates: any) =>
    this.userMethods.updateUser(userId, updates);
  getAllUsers = () => this.userMethods.getAllUsers();

  getBalance = (userId: string) => this.balanceMethods.getBalance(userId);
  createBalance = (balance: any) => this.balanceMethods.createBalance(balance);
  updateBalance = (userId: string, updates: any) =>
    this.balanceMethods.updateBalance(userId, updates);
  adjustStakingBalance = (data: any) =>
    this.balanceMethods.adjustStakingBalance(data);

  getStakes = (userId: string) => this.stakeMethods.getStakes(userId);
  getStakeById = (id: string) => this.stakeMethods.getStakeById(id);
  createStake = (stake: any) => this.stakeMethods.createStake(stake);
  updateStake = (id: string, updates: any) =>
    this.stakeMethods.updateStake(id, updates);
  atomicWithdrawStake = (id: string, totalProfit: string) =>
    this.stakeMethods.atomicWithdrawStake(id, totalProfit);
  getAllActiveStakes = () => this.stakeMethods.getAllActiveStakes();
  processStakingRewards = () => this.stakeMethods.processStakingRewards();

  getCurrentMiningSession = (userId: string) =>
    this.miningMethods.getCurrentMiningSession(userId);
  getMiningHistory = (userId: string) =>
    this.miningMethods.getMiningHistory(userId);
  createMiningSession = (session: any) =>
    this.miningMethods.createMiningSession(session);
  updateMiningSession = (id: string, updates: any) =>
    this.miningMethods.updateMiningSession(id, updates);
  processMiningRewards = () => this.miningMethods.processMiningRewards();

  getReferralsByReferrer = (referrerId: string) =>
    this.referralMethods.getReferralsByReferrer(referrerId);
  createReferral = (referral: any) => this.referralMethods.createReferral(referral);
  updateReferral = (id: string, updates: any) =>
    this.referralMethods.updateReferral(id, updates);
  distributeReferralCommissions = (userId: string, amount: number) =>
    this.referralMethods.distributeReferralCommissions(userId, amount);
  getReferrerChain = (userId: string, maxLevels: number) =>
    this.referralMethods.getReferrerChain(userId, maxLevels);

  getTransactionsByUser = (userId: string, type?: string) =>
    this.transactionMethods.getTransactionsByUser(userId, type);
  getTransactionById = (id: string) => this.transactionMethods.getTransactionById(id);
  createTransaction = (transaction: any) =>
    this.transactionMethods.createTransaction(transaction);
  updateTransaction = (id: string, updates: any) =>
    this.transactionMethods.updateTransaction(id, updates);
  getAllTransactions = (type?: string) => this.transactionMethods.getAllTransactions(type);
  getPendingTransactions = (type: string) => this.transactionMethods.getPendingTransactions(type);

  getAllTasks = () => this.taskMethods.getAllTasks();
  getUserTasks = (userId: string) => this.taskMethods.getUserTasks(userId);
  createUserTask = (userTask: any) => this.taskMethods.createUserTask(userTask);
  updateUserTask = (id: string, updates: any) =>
    this.taskMethods.updateUserTask(id, updates);
  completeTaskWithRewards = (userId: string, taskId: string) =>
    this.taskMethods.completeTaskWithRewards(userId, taskId);

  getAllAchievements = () => this.taskMethods.getAllAchievements();
  getUserAchievements = (userId: string) => this.taskMethods.getUserAchievements(userId);
  createUserAchievement = (userAchievement: any) =>
    this.taskMethods.createUserAchievement(userAchievement);
  checkAndUnlockAchievements = async (userId: string): Promise<void> => {
    await this.taskMethods.checkAndUnlockAchievements(userId);
  };
  getAchievementsWithUnlockCount = () => this.taskMethods.getAchievementsWithUnlockCount();

  createNotification = (notification: any) =>
    this.notificationMethods.createNotification(notification);
  getNotifications = (userId: string, limit?: number) =>
    this.notificationMethods.getNotifications(userId, limit);
  getUnreadNotificationCount = (userId: string) =>
    this.notificationMethods.getUnreadNotificationCount(userId);
  markNotificationAsRead = (id: string) => this.notificationMethods.markNotificationAsRead(id);
  markAllNotificationsAsRead = (userId: string) =>
    this.notificationMethods.markAllNotificationsAsRead(userId);

  getNotificationsPendingPush = (limit: number) =>
    this.notificationMethods.getNotificationsPendingPush(limit);
  updateNotificationDelivery = (id: string, updates: any) =>
    this.notificationMethods.updateNotificationDelivery(id, updates);

  getPushSubscription = (userId: string, endpoint: string) =>
    this.notificationMethods.getPushSubscription(userId, endpoint);
  createPushSubscription = (data: any) =>
    this.notificationMethods.createPushSubscription(data);
  deletePushSubscription = (userId: string, endpoint: string) =>
    this.notificationMethods.deletePushSubscription(userId, endpoint);
  getUserPushSubscriptions = (userId: string) =>
    this.notificationMethods.getUserPushSubscriptions(userId);
  disablePushSubscription = (endpoint: string) =>
    this.notificationMethods.disablePushSubscription(endpoint);

  getXPLeaderboard = (currentUserId: string, period: string, category: string, isAdmin: boolean) =>
    this.leaderboardMethods.getXPLeaderboard(currentUserId, period, category, isAdmin);

  createActivity = (activity: any) => this.activityMethods.createActivity(activity);
  getActivities = (userId: string, limit?: number) => this.activityMethods.getActivities(userId, limit);

  /**
   * Raw SQL (unsafe). Kept for drop-in compatibility.
   * Prefer using Prisma client methods where possible.
   */
  async raw(query: string, params: any[] = []): Promise<any[]> {
    return await prisma.$queryRawUnsafe(query, ...params);
  }

  /**
   * Optional alias if you want to migrate callsites later.
   */
  rawUnsafe = (query: string, params: any[] = []) => this.raw(query, params);
}

export const storage = new DatabaseStorage();

export type { IStorage } from "./interface";
export { generateAnonymizedHandle } from "./types";
export { DEFAULT_MINING_BASE_REWARD, XP_TO_XNRT_RATE } from "./constants";
