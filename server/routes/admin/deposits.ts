// server/routes/admin/deposits.ts
import { Router } from "express";
import { storage } from "../../storage";
import { requireAuth, requireAdmin, validateCSRF } from "../../auth/middleware";
import { prisma } from "../shared";
import { notifyUser } from "../../notifications";
import { verifyBscUsdtDeposit } from "../../services/verifyBscUsdt";
import { Prisma } from "../../db/client";

const router = Router();

// Prisma typings are currently broken in the repo (PrismaClient/Prisma export errors),
// which causes $transaction callback types to collapse to `never`.
// Using an escape hatch here keeps this file type-safe enough to compile.
const prismaAny = prisma as any;

// Use Prisma.Decimal instead of @prisma/client/runtime/library
const DecimalCtor = (Prisma as any).Decimal as new (value: any) => any;

const toFloat = (v: any): number => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v);
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "object" && typeof v.toString === "function") {
    return parseFloat(v.toString());
  }
  return Number(v);
};

router.get("/pending", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const pendingDeposits = await storage.getPendingTransactions("deposit");
    res.json(pendingDeposits);
  } catch (error) {
    console.error("Error fetching pending deposits:", error);
    res.status(500).json({ message: "Failed to fetch pending deposits" });
  }
});

router.post(
  "/:id/verify",
  requireAuth,
  requireAdmin,
  validateCSRF,
  async (req, res) => {
    try {
      const { id } = req.params;
      const deposit = await storage.getTransactionById(id);

      if (!deposit || deposit.type !== "deposit") {
        return res.status(404).json({ message: "Deposit not found" });
      }
      if (!deposit.transactionHash) {
        return res.status(400).json({ message: "No transaction hash provided" });
      }

      const result = await verifyBscUsdtDeposit({
        txHash: deposit.transactionHash,
        expectedTo: deposit.walletAddress || process.env.XNRT_WALLET!,
        minAmount: deposit.usdtAmount ? toFloat(deposit.usdtAmount) : undefined,
        requiredConf: parseInt(process.env.BSC_CONFIRMATIONS ?? "12", 10),
      });

      await prismaAny.transaction.update({
        where: { id },
        data: {
          verified: !!result.verified,
          confirmations: result.confirmations ?? 0,
          verificationData: {
            verifiedAt: new Date().toISOString(),
            reason: result.reason || null,
            amountOnChain: result.amountOnChain ?? null,
          },
        },
      });

      res.json(result);
    } catch (error) {
      console.error("Error verifying deposit:", error);
      res.status(500).json({ message: "Failed to verify deposit" });
    }
  },
);

router.post(
  "/:id/approve",
  requireAuth,
  requireAdmin,
  validateCSRF,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { notes, force } = (req.body ?? {}) as {
        notes?: string;
        force?: boolean;
      };

      const deposit = await storage.getTransactionById(id);

      if (!deposit || deposit.type !== "deposit") {
        return res.status(404).json({ message: "Deposit not found" });
      }

      if (deposit.status === "approved" || deposit.status === "rejected") {
        return res.status(400).json({ message: "Deposit already processed" });
      }

      const override = !deposit.verified || !!force;

      await prismaAny.$transaction(async (tx: any) => {
        const amountDec = new DecimalCtor(deposit.amount);

        await tx.balance.upsert({
          where: { userId: deposit.userId },
          create: {
            userId: deposit.userId,
            xnrtBalance: amountDec,
            totalEarned: amountDec,
          },
          update: {
            xnrtBalance: { increment: amountDec },
            totalEarned: { increment: amountDec },
          },
        });

        await tx.transaction.update({
          where: { id },
          data: {
            status: "approved",
            adminNotes: notes ?? deposit.adminNotes,
            approvedBy: req.authUser!.id,
            approvedAt: new Date(),
            verificationData: deposit.verificationData ?? undefined,
          },
        });

        if (override) {
          await tx.activity.create({
            data: {
              userId: req.authUser!.id,
              type: "ADMIN_DEPOSIT_OVERRIDE",
              description: `Force-approved deposit ${id} for user ${deposit.userId} (scanner: ${
                deposit.verified ? "verified" : "failed/unverified"
              })`,
            },
          });
        }
      });

      await storage.distributeReferralCommissions(deposit.userId, toFloat(deposit.amount));

      await storage.createActivity({
        userId: deposit.userId,
        type: "deposit_approved",
        description: `Deposit of ${toFloat(deposit.amount).toLocaleString()} XNRT approved`,
      });

      void notifyUser(deposit.userId, {
        type: "deposit_approved",
        title: "💰 Deposit Approved!",
        message: `Your deposit of ${toFloat(deposit.amount).toLocaleString()} XNRT has been approved and credited to your account`,
        url: "/wallet",
        metadata: { amount: deposit.amount, transactionId: id },
      }).catch((err) => {
        console.error("Error sending deposit notification (non-blocking):", err);
      });

      res.json({ ok: true, override });
    } catch (error) {
      console.error("Error approving deposit:", error);
      return res.status(500).json({ message: "Failed to approve deposit" });
    }
  },
);

router.post(
  "/:id/reject",
  requireAuth,
  requireAdmin,
  validateCSRF,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { notes } = (req.body ?? {}) as { notes?: string };

      const deposit = await storage.getTransactionById(id);

      if (!deposit || deposit.type !== "deposit") {
        return res.status(404).json({ message: "Deposit not found" });
      }

      if (deposit.status === "approved" || deposit.status === "rejected") {
        return res.status(400).json({ message: "Deposit already processed" });
      }

      await storage.updateTransaction(id, {
        status: "rejected",
        adminNotes: notes ?? deposit.adminNotes,
      });

      await storage.createActivity({
        userId: deposit.userId,
        type: "deposit_rejected",
        description: `Deposit of ${toFloat(deposit.amount).toLocaleString()} XNRT rejected${notes ? ` - ${notes}` : ""}`,
      });

      res.json({ message: "Deposit rejected" });
    } catch (error) {
      console.error("Error rejecting deposit:", error);
      res.status(500).json({ message: "Failed to reject deposit" });
    }
  },
);

router.post(
  "/bulk-approve",
  requireAuth,
  requireAdmin,
  validateCSRF,
  async (req, res) => {
    try {
      const { depositIds, notes } = (req.body ?? {}) as {
        depositIds?: string[];
        notes?: string;
      };

      if (!depositIds || !Array.isArray(depositIds) || depositIds.length === 0) {
        return res.status(400).json({ message: "Invalid deposit IDs" });
      }

      const successful: string[] = [];
      const failed: Array<{ id: string; error: string }> = [];
      const errors: string[] = [];

      for (const id of depositIds) {
        try {
          const deposit = await storage.getTransactionById(id);

          if (!deposit || deposit.type !== "deposit") {
            throw new Error(`Deposit ${id} not found`);
          }
          if (deposit.status === "approved" || deposit.status === "rejected") {
            throw new Error(`Deposit ${id} already processed`);
          }

          const override = !deposit.verified;

          await prismaAny.$transaction(async (tx: any) => {
            const amountDec = new DecimalCtor(deposit.amount);

            await tx.balance.upsert({
              where: { userId: deposit.userId },
              create: {
                userId: deposit.userId,
                xnrtBalance: amountDec,
                totalEarned: amountDec,
              },
              update: {
                xnrtBalance: { increment: amountDec },
                totalEarned: { increment: amountDec },
              },
            });

            await tx.transaction.update({
              where: { id },
              data: {
                status: "approved",
                adminNotes: notes ?? deposit.adminNotes,
                approvedBy: req.authUser!.id,
                approvedAt: new Date(),
              },
            });

            if (override) {
              await tx.activity.create({
                data: {
                  userId: req.authUser!.id,
                  type: "ADMIN_DEPOSIT_OVERRIDE",
                  description: `Force-approved deposit ${id} for user ${deposit.userId} via bulk`,
                },
              });
            }
          });

          await storage.distributeReferralCommissions(deposit.userId, toFloat(deposit.amount));

          await storage.createActivity({
            userId: deposit.userId,
            type: "deposit_approved",
            description: `Deposit of ${toFloat(deposit.amount).toLocaleString()} XNRT approved${notes ? ` - ${notes}` : ""}`,
          });

          void notifyUser(deposit.userId, {
            type: "deposit_approved",
            title: "💰 Deposit Approved!",
            message: `Your deposit of ${toFloat(deposit.amount).toLocaleString()} XNRT has been approved and credited to your account`,
            url: "/wallet",
            metadata: { amount: deposit.amount, transactionId: id },
          }).catch((err) => {
            console.error("Error sending bulk deposit notification (non-blocking):", err);
          });

          successful.push(id);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          failed.push({ id, error: errorMessage });
          errors.push(`${id}: ${errorMessage}`);
        }
      }

      res.json({
        approved: successful.length,
        failed: failed.length,
        total: depositIds.length,
        successful,
        failures: failed,
        errors,
      });
    } catch (error) {
      console.error("Error bulk approving deposits:", error);
      res.status(500).json({ message: "Failed to process bulk approval" });
    }
  },
);

router.post(
  "/bulk-reject",
  requireAuth,
  requireAdmin,
  validateCSRF,
  async (req, res) => {
    try {
      const { depositIds, notes } = (req.body ?? {}) as {
        depositIds?: string[];
        notes?: string;
      };

      if (!depositIds || !Array.isArray(depositIds) || depositIds.length === 0) {
        return res.status(400).json({ message: "Invalid deposit IDs" });
      }

      const successful: string[] = [];
      const failed: Array<{ id: string; error: string }> = [];
      const errors: string[] = [];

      for (const id of depositIds) {
        try {
          const deposit = await storage.getTransactionById(id);

          if (!deposit || deposit.type !== "deposit") {
            throw new Error(`Deposit ${id} not found`);
          }
          if (deposit.status === "approved" || deposit.status === "rejected") {
            throw new Error(`Deposit ${id} already processed`);
          }

          await storage.updateTransaction(id, {
            status: "rejected",
            adminNotes: notes || deposit.adminNotes,
            approvedBy: req.authUser!.id,
            approvedAt: new Date(),
          });

          await storage.createActivity({
            userId: deposit.userId,
            type: "deposit_rejected",
            description: `Deposit of ${toFloat(deposit.amount).toLocaleString()} XNRT rejected${notes ? ` - ${notes}` : ""}`,
          });

          successful.push(id);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          failed.push({ id, error: errorMessage });
          errors.push(`${id}: ${errorMessage}`);
        }
      }

      res.json({
        rejected: successful.length,
        failed: failed.length,
        total: depositIds.length,
        successful,
        failures: failed,
        errors,
      });
    } catch (error) {
      console.error("Error bulk rejecting deposits:", error);
      res.status(500).json({ message: "Failed to process bulk rejection" });
    }
  },
);

router.get("/unmatched", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const unmatched = await prismaAny.unmatchedDeposit.findMany({
      where: { resolved: false },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(unmatched);
  } catch (error) {
    console.error("Error fetching unmatched deposits:", error);
    res.status(500).json({ message: "Failed to fetch unmatched deposits" });
  }
});

router.post(
  "/unmatched/:id/match",
  requireAuth,
  requireAdmin,
  validateCSRF,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { userId } = (req.body ?? {}) as { userId?: string };

      if (!userId) {
        return res.status(400).json({ message: "User ID required" });
      }

      const unmatchedDeposit = await prismaAny.unmatchedDeposit.findUnique({
        where: { id },
      });
      if (!unmatchedDeposit) {
        return res.status(404).json({ message: "Unmatched deposit not found" });
      }
      if (unmatchedDeposit.resolved) {
        return res.status(400).json({ message: "Deposit already matched" });
      }

      const usdtAmount = toFloat(unmatchedDeposit.amount);
      const xnrtRate = parseFloat(process.env.XNRT_RATE_USDT || "100");
      const platformFeeBps = parseFloat(process.env.PLATFORM_FEE_BPS || "0");
      const netUsdt = usdtAmount * (1 - platformFeeBps / 10_000);
      const xnrtAmount = netUsdt * xnrtRate;

      const txHash = unmatchedDeposit.txHash ?? (unmatchedDeposit as any).transactionHash;

      await prismaAny.$transaction(async (tx: any) => {
        await tx.transaction.create({
          data: {
            userId,
            type: "deposit",
            amount: new DecimalCtor(xnrtAmount),
            usdtAmount: new DecimalCtor(usdtAmount),
            transactionHash: txHash,
            walletAddress: unmatchedDeposit.fromAddress,
            status: "approved",
            verified: true,
            confirmations: unmatchedDeposit.confirmations ?? 0,
            verificationData: {
              manualMatch: true,
              matchedBy: req.authUser!.id,
              matchedAt: new Date().toISOString(),
            },
            approvedBy: req.authUser!.id,
            approvedAt: new Date(),
          },
        });

        await tx.balance.upsert({
          where: { userId },
          create: {
            userId,
            xnrtBalance: new DecimalCtor(xnrtAmount),
            totalEarned: new DecimalCtor(xnrtAmount),
          },
          update: {
            xnrtBalance: { increment: new DecimalCtor(xnrtAmount) },
            totalEarned: { increment: new DecimalCtor(xnrtAmount) },
          },
        });

        await tx.unmatchedDeposit.update({
          where: { id },
          data: { resolved: true },
        });
      });

      await storage.distributeReferralCommissions(userId, xnrtAmount);
      await storage.createActivity({
        userId,
        type: "deposit_approved",
        description: `Deposit of ${xnrtAmount.toLocaleString()} XNRT approved via manual match`,
      });

      res.json({ message: "Deposit matched and credited successfully" });
    } catch (error) {
      console.error("Error matching deposit:", error);
      res.status(500).json({ message: "Failed to match deposit" });
    }
  },
);

/**
 * GET /api/admin/deposits/reports
 * Fetch pending deposit reports, enriched with basic user info (email, username)
 * without relying on a Prisma relation on depositReport.
 */
router.get("/reports", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const reports = await prismaAny.depositReport.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const userIds = Array.from(
      new Set(
        (reports as any[])
          .map((r: any) => r.userId)
          .filter(
            (id: unknown): id is string => typeof id === "string" && id.length > 0,
          ),
      ),
    );

    let userMap = new Map<string, { email: string; username: string | null }>();

    if (userIds.length > 0) {
      const users = await prismaAny.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, username: true },
      });

      userMap = new Map(
        (users as any[]).map((u: any) => [u.id, { email: u.email, username: u.username }]),
      );
    }

    const enrichedReports = (reports as any[]).map((report: any) => ({
      ...report,
      user: report.userId ? userMap.get(report.userId) ?? null : null,
    }));

    res.json(enrichedReports);
  } catch (error) {
    console.error("Error fetching deposit reports:", error);
    res.status(500).json({ message: "Failed to fetch deposit reports" });
  }
});

router.post(
  "/reports/:id/resolve",
  requireAuth,
  requireAdmin,
  validateCSRF,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { resolution, adminNotes } = (req.body ?? {}) as {
        resolution?: "approved" | "rejected";
        adminNotes?: string;
      };

      if (!resolution || !["approved", "rejected"].includes(resolution)) {
        return res.status(400).json({ message: "Invalid resolution" });
      }

      const report = await prismaAny.depositReport.findUnique({ where: { id } });
      if (!report) return res.status(404).json({ message: "Report not found" });
      if (report.status !== "pending") {
        return res.status(400).json({ message: "Report already resolved" });
      }

      if (resolution === "approved") {
        const xnrtRate = parseFloat(process.env.XNRT_RATE_USDT || "100");
        const platformFeeBps = parseFloat(process.env.PLATFORM_FEE_BPS || "0");
        const usdtAmount = report.amount ? toFloat(report.amount) : 0;
        const netUsdt = usdtAmount * (1 - platformFeeBps / 10_000);
        const xnrtAmount = netUsdt * xnrtRate;

        await prismaAny.$transaction(async (tx: any) => {
          await tx.transaction.create({
            data: {
              userId: report.userId!,
              type: "deposit",
              amount: new DecimalCtor(xnrtAmount),
              usdtAmount: new DecimalCtor(usdtAmount),
              transactionHash: report.txHash,
              status: "approved",
              adminNotes: adminNotes || "Credited from deposit report",
              approvedBy: req.authUser!.id,
              approvedAt: new Date(),
            },
          });

          await tx.balance.upsert({
            where: { userId: report.userId! },
            create: {
              userId: report.userId!,
              xnrtBalance: new DecimalCtor(xnrtAmount),
              totalEarned: new DecimalCtor(xnrtAmount),
            },
            update: {
              xnrtBalance: { increment: new DecimalCtor(xnrtAmount) },
              totalEarned: { increment: new DecimalCtor(xnrtAmount) },
            },
          });

          await tx.depositReport.update({
            where: { id },
            data: {
              status: "approved",
              resolvedAt: new Date(),
              notes: adminNotes || null,
            },
          });
        });

        await storage.distributeReferralCommissions(report.userId!, xnrtAmount);
        await storage.createActivity({
          userId: report.userId!,
          type: "deposit_approved",
          description: `Deposit of ${xnrtAmount.toLocaleString()} XNRT approved from deposit report`,
        });
      } else {
        await prismaAny.depositReport.update({
          where: { id },
          data: {
            status: "rejected",
            resolvedAt: new Date(),
            notes: adminNotes || null,
          },
        });
      }

      res.json({ message: `Report ${resolution} successfully` });
    } catch (error) {
      console.error("Error resolving deposit report:", error);
      res.status(500).json({ message: "Failed to resolve report" });
    }
  },
);

router.post(
  "/reconcile-referrals",
  requireAuth,
  requireAdmin,
  validateCSRF,
  async (_req, res) => {
    try {
      console.log("[RECONCILE] Starting referral commission reconciliation...");

      const approvedDeposits = await storage.raw(`
      SELECT id, "userId", amount, "createdAt"
      FROM "Transaction"
      WHERE type = 'deposit' AND status = 'approved'
      ORDER BY "createdAt" ASC
    `);

      console.log(
        `[RECONCILE] Found ${approvedDeposits.length} approved deposits to process`,
      );

      await storage.raw(`DELETE FROM "Referral"`);
      console.log("[RECONCILE] Cleared existing referral records");

      await storage.raw(`UPDATE "Balance" SET "referralBalance" = 0`);
      console.log("[RECONCILE] Reset all referral balances");

      let totalProcessed = 0;
      for (const deposit of approvedDeposits as Array<{ id: string; userId: string; amount: string }>) {
        const amount = parseFloat(deposit.amount);
        console.log(
          `[RECONCILE] Processing deposit ${deposit.id}: ${amount} XNRT for user ${deposit.userId}`,
        );
        await storage.distributeReferralCommissions(deposit.userId, amount);
        totalProcessed++;
      }

      console.log(
        `[RECONCILE] Reconciliation complete. Processed ${totalProcessed} deposits.`,
      );

      res.json({
        message: "Referral commissions reconciled successfully",
        depositsProcessed: totalProcessed,
      });
    } catch (error) {
      console.error("Error reconciling referrals:", error);
      res.status(500).json({ message: "Failed to reconcile referrals" });
    }
  },
);

export default router;
