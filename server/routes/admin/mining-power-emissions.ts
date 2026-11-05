/** Read-only R3 monitoring; the parent /api/admin router enforces auth/admin/CSRF. */
import { Router } from "express";
import {
  listMiningEmissionDays,
  readMiningEmissionAdminStatus,
} from "../../services/miningPowerEmission";

const router = Router();
router.get("/status", async (_req, res) => {
  try { res.json(await readMiningEmissionAdminStatus()); }
  catch (err) {
    console.error("[R3] admin status failed:", err);
    res.status(500).json({ message: "Unable to read emission status" });
  }
});
router.get("/days", async (req, res) => {
  try { res.json(await listMiningEmissionDays(Number(req.query.limit ?? 30))); }
  catch (err) {
    console.error("[R3] admin day history failed:", err);
    res.status(500).json({ message: "Unable to read emission history" });
  }
});
export default router;
