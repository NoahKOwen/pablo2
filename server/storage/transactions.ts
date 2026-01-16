// server/storage/transactions.ts
import type { PrismaClient } from "../db/client";
import { Prisma } from "../db/client";
import { type Transaction, type InsertTransaction } from "@shared/schema";
import { convertPrismaTransaction } from "./types";

export function createTransactionMethods(prisma: PrismaClient) {
  return {
    /**
     * Get transactions for a specific user, optionally filtered by type.
     */
    async getTransactionsByUser(
      userId: string,
      type?: Transaction["type"],
    ): Promise<Transaction[]> {
      const where: any = { userId };

      if (type) {
        where.type = type;
      }

      const transactions = await prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 1000,
      });

      return transactions.map(convertPrismaTransaction);
    },

    /**
     * Get a transaction by its ID.
     */
    async getTransactionById(id: string): Promise<Transaction | undefined> {
      const transaction = await prisma.transaction.findUnique({
        where: { id },
      });

      return transaction ? convertPrismaTransaction(transaction) : undefined;
    },

    /**
     * Create a new transaction from an InsertTransaction DTO.
     */
    async createTransaction(
      transaction: InsertTransaction,
    ): Promise<Transaction> {
      const data: any = {
        userId: transaction.userId,
        type: transaction.type,
        amount: new Prisma.Decimal(transaction.amount),
        status: transaction.status ?? "pending",
      };

      if (
        transaction.usdtAmount !== undefined &&
        transaction.usdtAmount !== null
      ) {
        data.usdtAmount = new Prisma.Decimal(transaction.usdtAmount);
      }

      if (transaction.source !== undefined && transaction.source !== null) {
        data.source = transaction.source;
      }

      if (
        transaction.walletAddress !== undefined &&
        transaction.walletAddress !== null
      ) {
        data.walletAddress = transaction.walletAddress;
      }

      if (
        transaction.transactionHash !== undefined &&
        transaction.transactionHash !== null
      ) {
        data.transactionHash = transaction.transactionHash;
      }

      if (
        transaction.proofImageUrl !== undefined &&
        transaction.proofImageUrl !== null
      ) {
        data.proofImageUrl = transaction.proofImageUrl;
      }

      if (
        transaction.adminNotes !== undefined &&
        transaction.adminNotes !== null
      ) {
        data.adminNotes = transaction.adminNotes;
      }

      if (transaction.fee !== undefined && transaction.fee !== null) {
        data.fee = new Prisma.Decimal(transaction.fee);
      }

      if (transaction.netAmount !== undefined && transaction.netAmount !== null) {
        data.netAmount = new Prisma.Decimal(transaction.netAmount);
      }

      if (
        transaction.approvedBy !== undefined &&
        transaction.approvedBy !== null
      ) {
        data.approvedBy = transaction.approvedBy;
      }

      if (
        transaction.approvedAt !== undefined &&
        transaction.approvedAt !== null
      ) {
        data.approvedAt = transaction.approvedAt;
      }

      if (transaction.verified !== undefined) {
        data.verified = transaction.verified;
      }

      if (transaction.confirmations !== undefined) {
        data.confirmations = transaction.confirmations;
      }

      if (
        transaction.verificationData !== undefined &&
        transaction.verificationData !== null
      ) {
        data.verificationData = transaction.verificationData;
      }

      const newTransaction = await prisma.transaction.create({ data });
      return convertPrismaTransaction(newTransaction);
    },

    /**
     * Update selected fields on a transaction.
     */
    async updateTransaction(
      id: string,
      updates: Partial<Transaction>,
    ): Promise<Transaction> {
      const data: any = {};

      if (updates.amount !== undefined && updates.amount !== null) {
        data.amount = new Prisma.Decimal(updates.amount);
      }

      if (updates.usdtAmount !== undefined && updates.usdtAmount !== null) {
        data.usdtAmount = new Prisma.Decimal(updates.usdtAmount);
      }

      if (updates.status !== undefined) {
        data.status = updates.status;
      }

      if (
        updates.adminNotes !== undefined &&
        updates.adminNotes !== null
      ) {
        data.adminNotes = updates.adminNotes;
      }

      if (updates.fee !== undefined && updates.fee !== null) {
        data.fee = new Prisma.Decimal(updates.fee);
      }

      if (updates.netAmount !== undefined && updates.netAmount !== null) {
        data.netAmount = new Prisma.Decimal(updates.netAmount);
      }

      if (
        updates.approvedBy !== undefined &&
        updates.approvedBy !== null
      ) {
        data.approvedBy = updates.approvedBy;
      }

      if (
        updates.approvedAt !== undefined &&
        updates.approvedAt !== null
      ) {
        data.approvedAt = updates.approvedAt;
      }

      if (updates.verified !== undefined) {
        data.verified = updates.verified;
      }

      if (updates.confirmations !== undefined) {
        data.confirmations = updates.confirmations;
      }

      if (
        updates.verificationData !== undefined &&
        updates.verificationData !== null
      ) {
        data.verificationData = updates.verificationData;
      }

      const transaction = await prisma.transaction.update({
        where: { id },
        data,
      });

      return convertPrismaTransaction(transaction);
    },

    /**
     * Get all transactions, optionally filtered by type.
     */
    async getAllTransactions(
      type?: Transaction["type"],
    ): Promise<Transaction[]> {
      const where: any = {};

      if (type) {
        where.type = type;
      }

      const transactions = await prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 1000,
      });

      return transactions.map(convertPrismaTransaction);
    },

    /**
     * Get all pending transactions of a specific type.
     */
    async getPendingTransactions(
      type: Transaction["type"],
    ): Promise<Transaction[]> {
      const transactions = await prisma.transaction.findMany({
        where: {
          type,
          status: "pending",
        },
        orderBy: { createdAt: "desc" },
      });

      return transactions.map(convertPrismaTransaction);
    },
  };
}
