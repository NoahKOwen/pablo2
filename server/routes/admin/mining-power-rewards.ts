/** R4 read-only administrator monitoring. Parent /api/admin enforces auth/admin. */
import { Router } from "express";
import { r4AuditDay, r4FindBatchForDay, r4Status } from "../../services/miningPowerRewards";

const router = Router();
router.get("/status", async (_req, res) => {
  try { res.json(await r4Status()); }
  catch (error) { console.error("[R4] status", error); res.status(500).json({ message: "Unable to read reward batches" }); }
});
router.get("/day/:day", async (req, res) => {
  try {
    const batch = await r4FindBatchForDay(req.params.day);
    if (!batch) return res.status(404).json({ message: "No R4 reward batch for day" });
    res.json(batch);
  } catch (error) { console.error("[R4] day", error); res.status(400).json({ message: "Unable to read reward day" }); }
});
router.get("/audit/:day", async (req, res) => {
  try { res.json(await r4AuditDay(req.params.day)); }
  catch (error) { console.error("[R4] audit", error); res.status(400).json({ message: "Unable to audit reward day" }); }
});
export default router;
