import { Router } from "express";
import { requireAuth, requireAdmin, validateCSRF } from "../../auth/middleware";
import { prisma } from "../shared";
import { insertAnnouncementSchema } from "../../../shared/schema";

const router = Router();

router.get("/", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const announcements = await prisma.announcement.findMany({
      include: {
        creator: { select: { id: true, username: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(announcements);
  } catch (error) {
    console.error("Error fetching announcements:", error);
    res.status(500).json({ message: "Failed to fetch announcements" });
  }
});

router.post("/", requireAuth, requireAdmin, validateCSRF, async (req, res) => {
  try {
    const validationResult = insertAnnouncementSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: validationResult.error.issues,
      });
    }

    const { title, content, type, isActive, expiresAt } = validationResult.data;

    const announcement = await prisma.announcement.create({
      data: {
        title,
        content,
        type: type || "info",
        isActive: isActive !== undefined ? isActive : true,
        createdBy: req.authUser!.id,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      include: {
        creator: { select: { id: true, username: true, email: true } },
      },
    });

    res.status(201).json(announcement);
  } catch (error) {
    console.error("Error creating announcement:", error);
    res.status(500).json({ message: "Failed to create announcement" });
  }
});

router.put("/:id", requireAuth, requireAdmin, validateCSRF, async (req, res) => {
  try {
    const { id } = req.params;

    const partialSchema = insertAnnouncementSchema.partial();
    const validationResult = partialSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: validationResult.error.issues,
      });
    }

    const { title, content, type, isActive, expiresAt } = validationResult.data;

    const announcement = await prisma.announcement.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(type !== undefined && { type }),
        ...(isActive !== undefined && { isActive }),
        ...(expiresAt !== undefined && {
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        }),
      },
      include: {
        creator: { select: { id: true, username: true, email: true } },
      },
    });

    res.json(announcement);
  } catch (error: any) {
    console.error("Error updating announcement:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Announcement not found" });
    }
    res.status(500).json({ message: "Failed to update announcement" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, validateCSRF, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.announcement.delete({ where: { id } });
    res.status(204).send();
  } catch (error: any) {
    console.error("Error deleting announcement:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Announcement not found" });
    }
    res.status(500).json({ message: "Failed to delete announcement" });
  }
});

export default router;
