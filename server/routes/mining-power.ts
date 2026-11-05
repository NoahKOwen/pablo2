import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, validateCSRF } from "../auth/middleware";
import {
  createMiningActivationRequest,
  getPublicMiningPowerConfig,
  getUserMiningActivation,
  listActiveMiningDurations,
  listActiveMiningPackages,
  listUserMiningActivations,
  quoteMiningActivation,
  requestMiningActivationExit,
  toMiningPowerHttpError,
} from "../services/miningPowerActivation";

const router = Router();

const activationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many Mining Power requests, please try again later" },
  skip: () => process.env.NODE_ENV === "development",
});

function sendError(res: any, error: unknown) {
  const mapped = toMiningPowerHttpError(error);
  return res.status(mapped.status).json(mapped.body);
}

router.get("/config/public", async (_req, res) => {
  try {
    res.json(await getPublicMiningPowerConfig());
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/packages", async (_req, res) => {
  try {
    res.json(await listActiveMiningPackages());
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/durations", async (_req, res) => {
  try {
    res.json(await listActiveMiningDurations());
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/activation/quote", requireAuth, activationLimiter, async (req, res) => {
  try {
    const packageCode = String(req.body?.packageCode ?? "").trim().toLowerCase();
    const durationMonths = Number(req.body?.durationMonths);
    if (!packageCode || !Number.isInteger(durationMonths) || durationMonths <= 0) {
      return res.status(400).json({ message: "Valid packageCode and durationMonths are required" });
    }
    res.json(await quoteMiningActivation({ packageCode, durationMonths }));
  } catch (error) {
    sendError(res, error);
  }
});

router.post(
  "/activations",
  requireAuth,
  validateCSRF,
  activationLimiter,
  async (req, res) => {
    try {
      const activationRequestId =
        req.body?.activationRequestId ?? req.header("Idempotency-Key");
      const result = await createMiningActivationRequest({
        userId: req.authUser!.id,
        activationRequestId,
        packageCode: String(req.body?.packageCode ?? "").trim().toLowerCase(),
        durationMonths: Number(req.body?.durationMonths),
        transactionHash: req.body?.transactionHash,
        proofImageUrl: req.body?.proofImageUrl,
      });
      res.status(result.idempotentReplay ? 200 : 201).json(result);
    } catch (error) {
      sendError(res, error);
    }
  },
);

router.get("/activations", requireAuth, async (req, res) => {
  try {
    res.json(await listUserMiningActivations(req.authUser!.id));
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/activations/:id", requireAuth, async (req, res) => {
  try {
    res.json(await getUserMiningActivation(req.authUser!.id, req.params.id));
  } catch (error) {
    sendError(res, error);
  }
});

router.post(
  "/activations/:id/exit",
  requireAuth,
  validateCSRF,
  activationLimiter,
  async (req, res) => {
    try {
      res.json(await requestMiningActivationExit(req.authUser!.id, req.params.id));
    } catch (error) {
      sendError(res, error);
    }
  },
);

export default router;
