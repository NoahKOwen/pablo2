import { Router } from "express";
import { storage } from "../../storage";
import { requireAuth, requireAdmin, validateCSRF } from "../../auth/middleware";
import { prisma, Prisma } from "../../db/client";

const router = Router();

type WithdrawalBalanceKey =
  | "xnrtBalance"
  | "stakingBalance"
  | "miningBalance"
  | "referralBalance";

function sourceBalanceKey(source: string | null | undefined): WithdrawalBalanceKey | null {
  switch (source) {
    case "main":
      return "xnrtBalance";
    case "staking":
      // Legacy pending withdrawals may still reference staking. New requests
      // are blocked from using this source by /api/transactions/withdrawal.
      return "stakingBalance";
    case "mining":
      return "miningBalance";
    case "referral":
      return "referralBalance";
    default:
      return null;
  }
}

router.get("/pending", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const pendingWithdrawals = await storage.getPendingTransactions("withdrawal");
    res.json(pendingWithdrawals);
  } catch (error) {
    console.error("Error fetching pending withdrawals:", error);
    res.status(500).json({ message: "Failed to fetch pending withdrawals" });
  }
});

router.post("/:id/approve", requireAuth, requireAdmin, validateCSRF, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"withdrawal:" + id}))`;

      const withdrawal = await tx.transaction.findUnique({ where: { id } });
      if (!withdrawal || withdrawal.type !== "withdrawal") {
        throw new Error("WITHDRAWAL_NOT_FOUND");
      }
      if (withdrawal.status !== "pending") {
        throw new Error("WITHDRAWAL_ALREADY_PROCESSED");
      }

      const withdrawAmount = Number(withdrawal.amount);
      if (!Number.isFinite(withdrawAmount) || withdrawAmount <= 0) {
        throw new Error("INVALID_WITHDRAWAL_AMOUNT");
      }

      const balanceKey = sourceBalanceKey(withdrawal.source);
      if (!balanceKey) {
        throw new Error("INVALID_WITHDRAWAL_SOURCE");
      }

      // Backward compatibility: requests created before R1 did not reserve
      // funds. Reserve them now, atomically, before approving.
      if (!withdrawal.fundsReserved) {
        const amountDec = new Prisma.Decimal(withdrawal.amount);
        const reserve = await tx.balance.updateMany({
          where: {
            userId: withdrawal.userId,
            [balanceKey]: { gte: amountDec },
          },
          data: {
            [balanceKey]: { decrement: amountDec },
          },
        });

        if (reserve.count !== 1) {
          throw new Error("INSUFFICIENT_BALANCE");
        }
      }

      const approved = await tx.transaction.update({
        where: { id },
        data: {
          status: "approved",
          approvedBy: req.authUser!.id,
          approvedAt: new Date(),
          fundsReserved: false,
        },
      });

      await tx.activity.create({
        data: {
          userId: withdrawal.userId,
          type: "withdrawal_approved",
          description: `Withdrawal of ${withdrawAmount.toLocaleString()} XNRT approved`,
        },
      });

      return approved;
    });

    res.json({ message: "Withdrawal approved successfully", transaction: result });
  } catch (error: any) {
    if (error?.message === "WITHDRAWAL_NOT_FOUND") {
      return res.status(404).json({ message: "Withdrawal not found" });
    }
    if (error?.message === "WITHDRAWAL_ALREADY_PROCESSED") {
      return res.status(409).json({ message: "Withdrawal already processed" });
    }
    if (error?.message === "INVALID_WITHDRAWAL_AMOUNT") {
      return res.status(400).json({ message: "Invalid withdrawal amount" });
    }
    if (error?.message === "INVALID_WITHDRAWAL_SOURCE") {
      return res.status(400).json({ message: "Invalid withdrawal source" });
    }
    if (error?.message === "INSUFFICIENT_BALANCE") {
      return res.status(400).json({
        message: "Insufficient balance to approve legacy unreserved withdrawal",
      });
    }
    console.error("Error approving withdrawal:", error);
    res.status(500).json({ message: "Failed to approve withdrawal" });
  }
});

router.post("/:id/reject", requireAuth, requireAdmin, validateCSRF, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"withdrawal:" + id}))`;

      const withdrawal = await tx.transaction.findUnique({ where: { id } });
      if (!withdrawal || withdrawal.type !== "withdrawal") {
        throw new Error("WITHDRAWAL_NOT_FOUND");
      }
      if (withdrawal.status !== "pending") {
        throw new Error("WITHDRAWAL_ALREADY_PROCESSED");
      }

      const withdrawAmount = Number(withdrawal.amount);
      const balanceKey = sourceBalanceKey(withdrawal.source);
      if (!balanceKey) {
        throw new Error("INVALID_WITHDRAWAL_SOURCE");
      }

      // Only R1 requests have a reservation to refund. Legacy requests had
      // never removed funds from the user's available balance.
      if (withdrawal.fundsReserved) {
        await tx.balance.upsert({
          where: { userId: withdrawal.userId },
          create: {
            userId: withdrawal.userId,
            [balanceKey]: new Prisma.Decimal(withdrawal.amount),
          },
          update: {
            [balanceKey]: { increment: new Prisma.Decimal(withdrawal.amount) },
          },
        });
      }

      const rejected = await tx.transaction.update({
        where: { id },
        data: {
          status: "rejected",
          approvedBy: req.authUser!.id,
          approvedAt: new Date(),
          fundsReserved: false,
        },
      });

      await tx.activity.create({
        data: {
          userId: withdrawal.userId,
          type: "withdrawal_rejected",
          description: `Withdrawal of ${withdrawAmount.toLocaleString()} XNRT rejected`,
        },
      });

      return rejected;
    });

    res.json({ message: "Withdrawal rejected", transaction: result });
  } catch (error: any) {
    if (error?.message === "WITHDRAWAL_NOT_FOUND") {
      return res.status(404).json({ message: "Withdrawal not found" });
    }
    if (error?.message === "WITHDRAWAL_ALREADY_PROCESSED") {
      return res.status(409).json({ message: "Withdrawal already processed" });
    }
    if (error?.message === "INVALID_WITHDRAWAL_SOURCE") {
      return res.status(400).json({ message: "Invalid withdrawal source" });
    }
    console.error("Error rejecting withdrawal:", error);
    res.status(500).json({ message: "Failed to reject withdrawal" });
  }
});

export default router;
