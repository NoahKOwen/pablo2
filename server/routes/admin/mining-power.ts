import { Router } from "express";
import {
  approveMiningActivationPayment,
  getMiningActivationForAdmin,
  getPendingMiningActivationPayments,
  recordMiningActivationPaymentVerification,
  rejectMiningActivationPayment,
  toMiningPowerHttpError,
} from "../../services/miningPowerActivation";
import { verifyBscUsdtDeposit } from "../../services/verifyBscUsdt";

const router = Router();

function sendError(res: any, error: unknown) {
  const mapped = toMiningPowerHttpError(error);
  return res.status(mapped.status).json(mapped.body);
}

router.get("/payments/pending", async (_req, res) => {
  try {
    res.json(await getPendingMiningActivationPayments());
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/payments/:activationId/verify", async (req, res) => {
  try {
    const activation = await getMiningActivationForAdmin(req.params.activationId);
    const payment = activation.paymentTransaction;
    if (!payment?.transactionHash) {
      return res.status(400).json({ message: "Mining Power payment has no transaction hash" });
    }

    const result = await verifyBscUsdtDeposit({
      txHash: payment.transactionHash,
      expectedTo: payment.walletAddress || process.env.XNRT_WALLET!,
      minAmount: payment.usdtAmount ? Number(payment.usdtAmount.toString()) : undefined,
      requiredConf: parseInt(process.env.BSC_CONFIRMATIONS ?? "12", 10),
    });

    const updated = await recordMiningActivationPaymentVerification({
      activationId: activation.id,
      verified: !!result.verified,
      confirmations: result.confirmations ?? 0,
      verificationData: {
        verifiedAt: new Date().toISOString(),
        reason: result.reason || null,
        amountOnChain: result.amountOnChain ?? null,
      },
    });

    res.json({ verification: result, activation: updated });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/payments/:activationId/approve", async (req, res) => {
  try {
    const { notes, force } = (req.body ?? {}) as { notes?: string; force?: boolean };
    res.json(
      await approveMiningActivationPayment({
        activationId: req.params.activationId,
        adminUserId: req.authUser!.id,
        notes,
        force: !!force,
      }),
    );
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/payments/:activationId/reject", async (req, res) => {
  try {
    const { notes } = (req.body ?? {}) as { notes?: string };
    res.json(
      await rejectMiningActivationPayment({
        activationId: req.params.activationId,
        adminUserId: req.authUser!.id,
        notes,
      }),
    );
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
