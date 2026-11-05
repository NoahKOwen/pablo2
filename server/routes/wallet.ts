import { Router } from "express";
import { Prisma } from "../db/client";
import { storage } from "../storage";
import { requireAuth, validateCSRF } from "../auth/middleware";
import { prisma } from "./shared";
import { ethers } from "ethers";
import { deriveDepositAddress } from "../services/hdWallet";
import { verifyBscUsdtDeposit } from "../services/verifyBscUsdt";

const router = Router();

router.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const wallets = await prisma.linkedWallet.findMany({
      where: { userId, active: true },
      select: { address: true, linkedAt: true },
      orderBy: { linkedAt: "desc" },
    });
    res.json(wallets.map((w: any) => w.address));
  } catch (error) {
    console.error("Error fetching linked wallets:", error);
    res.status(500).json({ message: "Failed to fetch wallets" });
  }
});

router.get("/link/challenge", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const address = String(req.query.address || "").toLowerCase();

    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      return res.status(400).json({ message: "Invalid address format" });
    }

    const nonce = Math.floor(100000 + Math.random() * 900000);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const issuedAt = new Date();

    await prisma.walletNonce.upsert({
      where: { userId_walletAddress: { userId, walletAddress: address } },
      update: { nonce, expiresAt },
      create: { userId, walletAddress: address, nonce, expiresAt },
    });

    const message = `XNRT Wallet Link

Address: ${address}
Nonce: ${nonce}
Issued: ${issuedAt.toISOString()}`;

    res.json({
      message,
      nonce: String(nonce),
      issuedAt: issuedAt.toISOString(),
    });
  } catch (error) {
    console.error("Error generating challenge:", error);
    res.status(500).json({ message: "Failed to generate challenge" });
  }
});

router.post("/link/confirm", requireAuth, validateCSRF, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const { address, signature, nonce, issuedAt } = req.body;
    const normalized = String(address || "").toLowerCase();

    if (!address || !signature || !nonce || !issuedAt) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const rec = await prisma.walletNonce.findUnique({
      where: {
        userId_walletAddress: { userId, walletAddress: normalized },
      },
    });

    if (
      !rec ||
      String(rec.nonce) !== String(nonce) ||
      !rec.expiresAt ||
      rec.expiresAt < new Date()
    ) {
      return res.status(400).json({ message: "Invalid or expired challenge" });
    }

    const message = `XNRT Wallet Link

Address: ${normalized}
Nonce: ${nonce}
Issued: ${issuedAt}`;

    let recoveredAddress: string;
    try {
      recoveredAddress = ethers.verifyMessage(message, signature).toLowerCase();
    } catch {
      return res.status(400).json({ message: "Invalid signature" });
    }

    if (recoveredAddress !== normalized) {
      return res.status(400).json({ message: "Signature does not match address" });
    }

    const existing = await prisma.linkedWallet.findFirst({
      where: { address: normalized, active: true },
    });

    if (existing && existing.userId !== userId) {
      return res.status(409).json({
        message: "This wallet is already linked to another account",
      });
    }

    if (existing && existing.userId === userId) {
      return res.json({ address: existing.address, alreadyLinked: true });
    }

    await prisma.$transaction([
      prisma.walletNonce.delete({ where: { id: rec.id } }),
      prisma.linkedWallet.create({
        data: {
          userId,
          address: normalized,
          signature,
        },
      }),
    ]);

    res.json({ address: normalized });
  } catch (error) {
    console.error("Error linking wallet:", error);
    res.status(500).json({ message: "Failed to link wallet" });
  }
});

router.get("/deposit-address", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;

    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: { depositAddress: true, derivationIndex: true },
    });

    if (!user?.depositAddress || user?.derivationIndex === null) {
      const maxIndexUser = await prisma.user.findFirst({
        where: { derivationIndex: { not: null } },
        orderBy: { derivationIndex: "desc" },
        select: { derivationIndex: true },
      });

      const nextIndex = (maxIndexUser?.derivationIndex ?? -1) + 1;
      const address = deriveDepositAddress(nextIndex);

      await prisma.user.update({
        where: { id: userId },
        data: { depositAddress: address, derivationIndex: nextIndex },
      });

      return res.json({
        address,
        network: "BSC (BEP-20)",
        token: "USDT",
        instructions: [
          "Send USDT (BEP-20) from your exchange to this address",
          "Deposits will be automatically detected and credited",
          "No gas fees or wallet connection needed",
          "Minimum 12 block confirmations required",
        ],
      });
    }

    res.json({
      address: user.depositAddress,
      network: "BSC (BEP-20)",
      token: "USDT",
      instructions: [
        "Send USDT (BEP-20) from your exchange to this address",
        "Deposits will be automatically detected and credited",
        "No gas fees or wallet connection needed",
        "Minimum 12 block confirmations required",
      ],
    });
  } catch (error) {
    console.error("Error getting deposit address:", error);
    res.status(500).json({ message: "Failed to get deposit address" });
  }
});

router.post("/report-deposit", requireAuth, validateCSRF, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    let { transactionHash, amount, description } = req.body;

    if (!transactionHash || amount === undefined || amount === null) {
      return res.status(400).json({ message: "Transaction hash and amount required" });
    }

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    transactionHash = String(transactionHash).trim().toLowerCase();
    if (!/^0x[a-f0-9]{64}$/.test(transactionHash)) {
      return res.status(400).json({ message: "Invalid transaction hash format" });
    }

    const existingTx = await prisma.transaction.findFirst({
      where: { transactionHash },
    });
    if (existingTx) {
      if (
        existingTx.type === "deposit" &&
        existingTx.status === "approved" &&
        existingTx.userId === userId &&
        !existingTx.referralProcessed
      ) {
        await storage.distributeReferralCommissions(
          userId,
          Number(existingTx.amount),
          existingTx.id,
        );
        return res.json({
          message: "Deposit was already credited; referral payout retry completed",
          alreadyProcessed: true,
          referralRetry: true,
        });
      }
      return res.status(409).json({
        message: "This deposit has already been credited",
        alreadyProcessed: true,
      });
    }

    const existingReport = await prisma.depositReport.findFirst({
      where: { txHash: transactionHash },
    });
    if (existingReport) {
      return res.status(409).json({
        message: "This deposit has already been reported",
      });
    }

    const treasuryAddress = process.env.XNRT_WALLET || "";
    const verification = await verifyBscUsdtDeposit({
      txHash: transactionHash,
      expectedTo: treasuryAddress,
      minAmount: amountNum,
      requiredConf: parseInt(process.env.BSC_CONFIRMATIONS ?? "12", 10),
    });

    if (!verification.verified) {
      const report = await prisma.depositReport.create({
        data: {
          userId,
          txHash: transactionHash,
          toAddress: treasuryAddress,
          amount: new Prisma.Decimal(amountNum),
          notes: description || `Verification: ${verification.reason}`,
          status: "pending",
        },
      });

      return res.json({
        message: "Report submitted for admin review",
        reportId: report.id,
        reason: verification.reason,
      });
    }

    const provider = new ethers.JsonRpcProvider(process.env.RPC_BSC_URL);
    const receipt = await provider.getTransactionReceipt(transactionHash);
    const transaction = await provider.getTransaction(transactionHash);
    const fromAddress = transaction?.from?.toLowerCase() || "";

    const linkedWallet = await prisma.linkedWallet.findFirst({
      where: { userId, address: fromAddress, active: true },
    });

    const xnrtRate = parseFloat(process.env.XNRT_RATE_USDT || "100");
    const platformFeeBps = parseFloat(process.env.PLATFORM_FEE_BPS || "0");
    const usdtAmount = verification.amountOnChain ?? amountNum;
    const netUsdt = usdtAmount * (1 - platformFeeBps / 10_000);
    const xnrtAmount = netUsdt * xnrtRate;

    if (linkedWallet) {
      const createdDeposit = await prisma.$transaction(async (tx: any) => {
        const created = await tx.transaction.create({
          data: {
            userId,
            type: "deposit",
            amount: new Prisma.Decimal(xnrtAmount),
            usdtAmount: new Prisma.Decimal(usdtAmount),
            transactionHash,
            walletAddress: fromAddress,
            status: "approved",
            verified: true,
            confirmations: verification.confirmations,
            verificationData: {
              autoVerified: true,
              reportSubmitted: true,
              verifiedAt: new Date().toISOString(),
              blockNumber: receipt?.blockNumber,
            } as any,
          },
        });

        await tx.balance.upsert({
          where: { userId },
          create: {
            userId,
            xnrtBalance: new Prisma.Decimal(xnrtAmount),
            totalEarned: new Prisma.Decimal(xnrtAmount),
          },
          update: {
            xnrtBalance: { increment: new Prisma.Decimal(xnrtAmount) },
            totalEarned: { increment: new Prisma.Decimal(xnrtAmount) },
          },
        });

        await tx.activity.create({
          data: {
            userId,
            type: "deposit_approved",
            description: `Deposit of ${xnrtAmount.toLocaleString()} XNRT approved via auto-detection`,
          },
        });

        return created;
      });

      console.log(`[ReportDeposit] Auto-credited ${xnrtAmount} XNRT to user ${userId}`);

      await storage.distributeReferralCommissions(
        userId,
        xnrtAmount,
        createdDeposit.id,
      );

      const { sendDepositNotification } = await import("../services/depositScanner");
      void sendDepositNotification(userId, xnrtAmount, transactionHash).catch((err) => {
        console.error("[ReportDeposit] Notification error:", err);
      });

      return res.json({
        message: "Deposit verified and credited automatically!",
        credited: true,
        amount: xnrtAmount,
      });
    } else {
      await prisma.unmatchedDeposit.create({
        data: {
          fromAddress,
          toAddress: treasuryAddress,
          amount: new Prisma.Decimal(usdtAmount),
          txHash: transactionHash,
          reason:
            typeof description === "string" && description.trim().length > 0
              ? description.trim()
              : `Verified on-chain but wallet not linked (from: ${
                  fromAddress || "unknown"
                }) - ${verification.reason || "no reason"}`,
          confirmations: verification.confirmations ?? 0,
          resolved: false,
        },
      });

      return res.json({
        message: "Deposit verified on blockchain. Admin will credit your account shortly.",
        verified: true,
        pendingAdminReview: true,
      });
    }
  } catch (error: any) {
    console.error("Error reporting deposit:", error);

    if (error.code === "P2002" && error.meta?.target?.includes("transactionHash")) {
      return res.status(409).json({
        message: "This transaction has already been processed",
        alreadyProcessed: true,
      });
    }
    res.status(500).json({ message: "Failed to process deposit report" });
  }
});

export default router;
