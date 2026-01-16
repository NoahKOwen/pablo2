// server/routes/transactions.ts
import { Router } from "express";
import { storage } from "../storage";
import { requireAuth, validateCSRF } from "../auth/middleware";
import { prisma } from "./shared";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const transactions = await storage.getTransactionsByUser(userId);
    res.json(transactions);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ message: "Failed to fetch transactions" });
  }
});

router.get("/deposits", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const deposits = await storage.getTransactionsByUser(userId, "deposit");
    res.json(deposits);
  } catch (error) {
    console.error("Error fetching deposits:", error);
    res.status(500).json({ message: "Failed to fetch deposits" });
  }
});

router.get("/withdrawals", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const withdrawals = await storage.getTransactionsByUser(
      userId,
      "withdrawal",
    );
    res.json(withdrawals);
  } catch (error) {
    console.error("Error fetching withdrawals:", error);
    res.status(500).json({ message: "Failed to fetch withdrawals" });
  }
});

router.post("/deposit", requireAuth, validateCSRF, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    let { usdtAmount, transactionHash, proofImageUrl } = req.body;

    if (!usdtAmount || !transactionHash) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const usdt = Number(usdtAmount);
    if (!Number.isFinite(usdt) || usdt <= 0) {
      return res.status(400).json({ message: "Invalid USDT amount" });
    }

    transactionHash = String(transactionHash).trim().toLowerCase();
    if (!/^0x[a-f0-9]{64}$/.test(transactionHash)) {
      return res.status(400).json({ message: "Invalid transaction hash format" });
    }

    const existing = await prisma.transaction.findFirst({
      where: { transactionHash },
    });
    if (existing) {
      return res.status(409).json({
        message: "This transaction hash was already used for a deposit.",
      });
    }

    if (proofImageUrl) {
      const isBase64DataUrl = proofImageUrl.startsWith("data:image/");
      const isValidUrl = /^https?:\/\//.test(proofImageUrl);
      if (!isBase64DataUrl && !isValidUrl) {
        return res
          .status(400)
          .json({ message: "Invalid proof image URL format" });
      }
    }

    const rate = parseFloat(process.env.XNRT_RATE_USDT ?? "100");
    const feeBps = parseFloat(process.env.PLATFORM_FEE_BPS ?? "0");
    const netUsdt = usdt * (1 - feeBps / 10_000);
    const xnrtAmount = netUsdt * rate;

    const transaction = await storage.createTransaction({
      userId,
      type: "deposit",
      amount: xnrtAmount.toString(),
      usdtAmount: usdt.toString(),
      transactionHash,
      walletAddress: process.env.XNRT_WALLET!,
      ...(proofImageUrl && { proofImageUrl }),
      status: "pending",
      verified: false,
      confirmations: 0,
    });

    res.json(transaction);
  } catch (error: any) {
    if (
      error.code === "P2002" &&
      error.meta?.target?.includes("transactionHash")
    ) {
      return res.status(409).json({
        message: "This transaction hash was already used for a deposit.",
      });
    }
    console.error("Error creating deposit:", error);
    res.status(500).json({ message: "Failed to create deposit" });
  }
});

router.post("/withdrawal", requireAuth, validateCSRF, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const { source, amount, walletAddress } = req.body;

    if (!source || amount === undefined || amount === null || !walletAddress) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const withdrawAmount = Number(amount);
    if (!Number.isFinite(withdrawAmount) || withdrawAmount <= 0) {
      return res.status(400).json({
        message: "Withdrawal amount must be a positive number",
      });
    }

    const fee = (withdrawAmount * 2) / 100;
    const netAmount = withdrawAmount - fee;
    const usdtAmount = netAmount / 100;

    const balance = await storage.getBalance(userId);
    if (!balance) {
      return res.status(404).json({ message: "Balance not found" });
    }

    let availableBalance = 0;

    switch (source) {
      case "main":
        availableBalance = parseFloat(balance.xnrtBalance || "0");
        break;
      case "staking":
        availableBalance = parseFloat(balance.stakingBalance || "0");
        break;
      case "mining":
        availableBalance = parseFloat(balance.miningBalance || "0");
        break;
      case "referral":
        availableBalance = parseFloat(balance.referralBalance || "0");
        break;
      default:
        return res.status(400).json({ message: "Invalid source" });
    }

    if (withdrawAmount > availableBalance) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    if (source === "referral" && withdrawAmount < 5000) {
      return res.status(400).json({
        message: "Minimum withdrawal from referral balance is 5,000 XNRT",
      });
    }

    if (source === "mining" && withdrawAmount < 5000) {
      return res.status(400).json({
        message: "Minimum withdrawal from mining balance is 5,000 XNRT",
      });
    }

    const transaction = await storage.createTransaction({
      userId,
      type: "withdrawal",
      amount: withdrawAmount.toString(),
      usdtAmount: usdtAmount.toString(),
      source,
      walletAddress,
      status: "pending",
      fee: fee.toString(),
      netAmount: netAmount.toString(),
    });

    res.json(transaction);
  } catch (error) {
    console.error("Error creating withdrawal:", error);
    res.status(500).json({ message: "Failed to create withdrawal" });
  }
});

export default router;
