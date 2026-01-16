import { Router } from "express";
import { storage } from "../../storage";
import { requireAuth, requireAdmin, validateCSRF } from "../../auth/middleware";

const router = Router();

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
    const withdrawal = await storage.getTransactionById(id);

    if (!withdrawal || withdrawal.type !== "withdrawal") {
      return res.status(404).json({ message: "Withdrawal not found" });
    }
    if (withdrawal.status !== "pending") {
      return res.status(400).json({ message: "Withdrawal already processed" });
    }

    const withdrawAmount = Number(withdrawal.amount);
    if (!Number.isFinite(withdrawAmount) || withdrawAmount <= 0) {
      return res.status(400).json({ message: "Invalid withdrawal amount" });
    }

    const balance = await storage.getBalance(withdrawal.userId);
    if (!balance) {
      return res.status(400).json({
        message: "User balance not found; cannot approve withdrawal",
      });
    }

    let sourceBalanceKey:
      | "xnrtBalance"
      | "stakingBalance"
      | "miningBalance"
      | "referralBalance";

    switch (withdrawal.source) {
      case "main":
        sourceBalanceKey = "xnrtBalance";
        break;
      case "staking":
        sourceBalanceKey = "stakingBalance";
        break;
      case "mining":
        sourceBalanceKey = "miningBalance";
        break;
      case "referral":
        sourceBalanceKey = "referralBalance";
        break;
      default:
        sourceBalanceKey = "xnrtBalance";
    }

    const currentBalance = parseFloat(balance[sourceBalanceKey] || "0");
    if (withdrawAmount > currentBalance) {
      return res.status(400).json({
        message: "Insufficient balance to approve withdrawal",
      });
    }

    await storage.updateBalance(withdrawal.userId, {
      [sourceBalanceKey]: (currentBalance - withdrawAmount).toString(),
    });

    await storage.updateTransaction(id, { status: "approved" });

    await storage.createActivity({
      userId: withdrawal.userId,
      type: "withdrawal_approved",
      description: `Withdrawal of ${withdrawAmount.toLocaleString()} XNRT approved`,
    });

    res.json({ message: "Withdrawal approved successfully" });
  } catch (error) {
    console.error("Error approving withdrawal:", error);
    res.status(500).json({ message: "Failed to approve withdrawal" });
  }
});

router.post("/:id/reject", requireAuth, requireAdmin, validateCSRF, async (req, res) => {
  try {
    const { id } = req.params;
    const withdrawal = await storage.getTransactionById(id);

    if (!withdrawal || withdrawal.type !== "withdrawal") {
      return res.status(404).json({ message: "Withdrawal not found" });
    }
    if (withdrawal.status !== "pending") {
      return res.status(400).json({ message: "Withdrawal already processed" });
    }

    await storage.updateTransaction(id, { status: "rejected" });

    await storage.createActivity({
      userId: withdrawal.userId,
      type: "withdrawal_rejected",
      description: `Withdrawal of ${parseFloat(
        withdrawal.amount
      ).toLocaleString()} XNRT rejected`,
    });

    res.json({ message: "Withdrawal rejected" });
  } catch (error) {
    console.error("Error rejecting withdrawal:", error);
    res.status(500).json({ message: "Failed to reject withdrawal" });
  }
});

export default router;
