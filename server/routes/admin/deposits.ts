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

async function approvePendingDeposit(params: {
  deposit: any;
  adminUserId: string;
  notes?: string;
  force?: boolean;
}) {
  const { deposit, adminUserId, notes, force = false } = params;

  let override = false;

  await prismaAny.$transaction(async (tx: any) => {
    // Re-read current verification/status inside the transaction. A stale UI or
    // concurrent verifier must never turn a normal approval into an implicit
    // override.
    const current = await tx.transaction.findUnique({ where: { id: deposit.id } });
    if (!current || current.type !== "deposit") {
      throw new Error("DEPOSIT_ALREADY_PROCESSED");
    }
    if (!current.verified && !force) {
      throw new Error("DEPOSIT_NOT_VERIFIED");
    }
    override = !current.verified && force;

    // State transition first: only one concurrent approve/reject path wins. If
    // this is not an explicit force approval, verified=true is part of the
    // atomic predicate too.
    const claimed = await tx.transaction.updateMany({
      where: {
        id: current.id,
        type: "deposit",
        status: "pending",
        ...(force ? {} : { verified: true }),
      },
      data: {
        status: "approved",
        adminNotes: notes ?? current.adminNotes,
        approvedBy: adminUserId,
        approvedAt: new Date(),
        verificationData: current.verificationData ?? undefined,
      },
    });

    if (claimed.count !== 1) {
      throw new Error("DEPOSIT_ALREADY_PROCESSED");
    }

    const amountDec = new DecimalCtor(current.amount);
    await tx.balance.upsert({
      where: { userId: current.userId },
      create: {
        userId: current.userId,
        xnrtBalance: amountDec,
        totalEarned: amountDec,
      },
      update: {
        xnrtBalance: { increment: amountDec },
        totalEarned: { increment: amountDec },
      },
    });

    await tx.activity.create({
      data: {
        userId: current.userId,
        type: "deposit_approved",
        description: `Deposit of ${toFloat(current.amount).toLocaleString()} XNRT approved${notes ? ` - ${notes}` : ""}`,
      },
    });

    if (override) {
      await tx.activity.create({
        data: {
          userId: adminUserId,
          type: "ADMIN_DEPOSIT_OVERRIDE",
          description: `Force-approved unverified deposit ${current.id} for user ${current.userId}`,
        },
      });
    }
  });

  return { override };
}

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

      if (deposit.status === "rejected") {
        return res.status(409).json({ message: "Deposit already rejected" });
      }

      // Safe retry path for an R1 approval whose commission distribution failed
      // after the primary deposit credit committed. Historical approved deposits
      // are marked referralProcessed=true by the R1 migration.
      if (deposit.status === "approved") {
        if (!deposit.referralProcessed) {
          await storage.distributeReferralCommissions(
            deposit.userId,
            toFloat(deposit.amount),
            id,
          );
          return res.json({ ok: true, alreadyApproved: true, referralRetry: true });
        }
        return res.json({ ok: true, alreadyApproved: true });
      }

      const { override } = await approvePendingDeposit({
        deposit,
        adminUserId: req.authUser!.id,
        notes,
        force: !!force,
      });

      await storage.distributeReferralCommissions(
        deposit.userId,
        toFloat(deposit.amount),
        id,
      );

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
    } catch (error: any) {
      if (error?.message === "DEPOSIT_NOT_VERIFIED") {
        return res.status(400).json({
          message: "Deposit is not verified. Pass force=true only after manual review.",
        });
      }
      if (error?.message === "DEPOSIT_ALREADY_PROCESSED") {
        return res.status(409).json({ message: "Deposit already processed" });
      }
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

      const rejected = await prismaAny.$transaction(async (tx: any) => {
        const claimed = await tx.transaction.updateMany({
          where: { id, type: "deposit", status: "pending" },
          data: {
            status: "rejected",
            adminNotes: notes ?? deposit.adminNotes,
            approvedBy: req.authUser!.id,
            approvedAt: new Date(),
          },
        });
        if (claimed.count !== 1) return false;

        await tx.activity.create({
          data: {
            userId: deposit.userId,
            type: "deposit_rejected",
            description: `Deposit of ${toFloat(deposit.amount).toLocaleString()} XNRT rejected${notes ? ` - ${notes}` : ""}`,
          },
        });
        return true;
      });

      if (!rejected) {
        return res.status(409).json({ message: "Deposit already processed" });
      }

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
      const { depositIds, notes, force } = (req.body ?? {}) as {
        depositIds?: string[];
        notes?: string;
        force?: boolean;
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
          if (deposit.status === "rejected") {
            throw new Error(`Deposit ${id} already rejected`);
          }
          if (deposit.status === "approved") {
            if (!deposit.referralProcessed) {
              await storage.distributeReferralCommissions(
                deposit.userId,
                toFloat(deposit.amount),
                id,
              );
            }
            successful.push(id);
            continue;
          }

          await approvePendingDeposit({
            deposit,
            adminUserId: req.authUser!.id,
            notes,
            force: !!force,
          });

          await storage.distributeReferralCommissions(
            deposit.userId,
            toFloat(deposit.amount),
            id,
          );

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
          const rejected = await prismaAny.$transaction(async (tx: any) => {
            const claimed = await tx.transaction.updateMany({
              where: { id, type: "deposit", status: "pending" },
              data: {
                status: "rejected",
                adminNotes: notes || deposit.adminNotes,
                approvedBy: req.authUser!.id,
                approvedAt: new Date(),
              },
            });
            if (claimed.count !== 1) return false;

            await tx.activity.create({
              data: {
                userId: deposit.userId,
                type: "deposit_rejected",
                description: `Deposit of ${toFloat(deposit.amount).toLocaleString()} XNRT rejected${notes ? ` - ${notes}` : ""}`,
              },
            });
            return true;
          });

          if (!rejected) {
            throw new Error(`Deposit ${id} already processed`);
          }

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
        const existing = await prismaAny.transaction.findFirst({
          where: { transactionHash: unmatchedDeposit.txHash },
        });
        if (
          existing?.type === "deposit" &&
          existing.status === "approved" &&
          !existing.referralProcessed
        ) {
          await storage.distributeReferralCommissions(
            existing.userId,
            toFloat(existing.amount),
            existing.id,
          );
          return res.json({
            message: "Deposit was already matched; referral payout retry completed",
            alreadyMatched: true,
            referralRetry: true,
          });
        }
        return res.status(409).json({ message: "Deposit already matched" });
      }

      const usdtAmount = toFloat(unmatchedDeposit.amount);
      const xnrtRate = parseFloat(process.env.XNRT_RATE_USDT || "100");
      const platformFeeBps = parseFloat(process.env.PLATFORM_FEE_BPS || "0");
      const netUsdt = usdtAmount * (1 - platformFeeBps / 10_000);
      const xnrtAmount = netUsdt * xnrtRate;

      const txHash = unmatchedDeposit.txHash ?? (unmatchedDeposit as any).transactionHash;

      const createdDeposit = await prismaAny.$transaction(async (tx: any) => {
        const created = await tx.transaction.create({
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

        await tx.activity.create({
          data: {
            userId,
            type: "deposit_approved",
            description: `Deposit of ${xnrtAmount.toLocaleString()} XNRT approved via manual match`,
          },
        });

        await tx.unmatchedDeposit.update({
          where: { id },
          data: { resolved: true },
        });

        return created;
      });

      await storage.distributeReferralCommissions(
        userId,
        xnrtAmount,
        createdDeposit.id,
      );

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
        if (report.status === "approved" && report.txHash) {
          const existing = await prismaAny.transaction.findFirst({
            where: { transactionHash: report.txHash },
          });
          if (
            existing?.type === "deposit" &&
            existing.status === "approved" &&
            !existing.referralProcessed
          ) {
            await storage.distributeReferralCommissions(
              existing.userId,
              toFloat(existing.amount),
              existing.id,
            );
            return res.json({
              message: "Report was already approved; referral payout retry completed",
              alreadyResolved: true,
              referralRetry: true,
            });
          }
        }
        return res.status(409).json({ message: "Report already resolved" });
      }

      if (resolution === "approved") {
        const xnrtRate = parseFloat(process.env.XNRT_RATE_USDT || "100");
        const platformFeeBps = parseFloat(process.env.PLATFORM_FEE_BPS || "0");
        const usdtAmount = report.amount ? toFloat(report.amount) : 0;
        const netUsdt = usdtAmount * (1 - platformFeeBps / 10_000);
        const xnrtAmount = netUsdt * xnrtRate;

        const createdDeposit = await prismaAny.$transaction(async (tx: any) => {
          const claimed = await tx.depositReport.updateMany({
            where: { id, status: "pending" },
            data: {
              status: "approved",
              resolvedAt: new Date(),
              notes: adminNotes || null,
            },
          });
          if (claimed.count !== 1) {
            throw new Error("REPORT_ALREADY_RESOLVED");
          }

          const created = await tx.transaction.create({
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

          await tx.activity.create({
            data: {
              userId: report.userId!,
              type: "deposit_approved",
              description: `Deposit of ${xnrtAmount.toLocaleString()} XNRT approved from deposit report`,
            },
          });

          return created;
        });

        await storage.distributeReferralCommissions(
          report.userId!,
          xnrtAmount,
          createdDeposit.id,
        );
      } else {
        const rejected = await prismaAny.depositReport.updateMany({
          where: { id, status: "pending" },
          data: {
            status: "rejected",
            resolvedAt: new Date(),
            notes: adminNotes || null,
          },
        });
        if (rejected.count !== 1) {
          return res.status(409).json({ message: "Report already resolved" });
        }
      }

      res.json({ message: `Report ${resolution} successfully` });
    } catch (error: any) {
      if (error?.message === "REPORT_ALREADY_RESOLVED") {
        return res.status(409).json({ message: "Report already resolved" });
      }
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
    return res.status(410).json({
      message:
        "Legacy destructive referral reconciliation is disabled in XNRT R1. Use the idempotent ReferralCommission ledger and a reviewed offline repair procedure instead.",
    });
  },
);

export default router;
