import { Router } from "express";
import { requireAuth, requireAdmin, validateCSRF } from "../../auth/middleware";

import statsRouter from "./stats";
import depositsRouter from "./deposits";
import withdrawalsRouter from "./withdrawals";
import usersRouter from "./users";
import announcementsRouter from "./announcements";
import achievementsRouter from "./achievements";
import { pushRouter } from "../notifications";

const router = Router();

// Auth + Admin required for EVERYTHING under /api/admin/*
router.use(requireAuth, requireAdmin);

// CSRF for any mutating admin request (POST/PUT/PATCH/DELETE)
router.use((req, res, next) => {
  const m = req.method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return next();
  return validateCSRF(req, res, next);
});

router.use("/stats", statsRouter);
router.use("/deposits", depositsRouter);
router.use("/withdrawals", withdrawalsRouter);
router.use("/users", usersRouter);
router.use("/announcements", announcementsRouter);
router.use("/achievements", achievementsRouter);
router.use("/push", pushRouter);

export default router;
