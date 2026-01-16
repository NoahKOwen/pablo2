import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { nanoid } from "nanoid";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { hashPassword, comparePassword, generateResetToken } from "./password";
import { signToken } from "./jwt";
import { generateCSRFToken } from "./csrf";
import { requireAuth, loginRateLimiter, type AuthRequest, clearSidCookie } from "./middleware";
import { sendVerificationEmail, sendPasswordResetEmail } from "../services/email";

const router = Router();

/**
 * Origin allow-list helper.
 * - Dev: allow all
 * - Prod: compare against ALLOWED_ORIGINS (comma-separated absolute URLs)
 */
function isOriginAllowed(originHeader: string | undefined): boolean {
  if (!originHeader) return true;
  if (process.env.NODE_ENV !== "production") return true;

  const allowedFromEnv = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : [];

  // Fail open if env not set (prevents accidental lockouts)
  if (allowedFromEnv.length === 0) return true;

  try {
    const originUrl = new URL(originHeader);
    return allowedFromEnv.some((allowed) => {
      try {
        const allowedUrl = new URL(allowed);
        return (
          originUrl.protocol === allowedUrl.protocol &&
          originUrl.hostname === allowedUrl.hostname &&
          originUrl.port === allowedUrl.port
        );
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function ensureSafeOrigin(req: Request, res: Response): boolean {
  const origin = (req.headers.origin || req.headers.referer) as string | undefined;

  if (!isOriginAllowed(origin)) {
    res.status(403).json({ message: "Forbidden: Invalid request origin" });
    return false;
  }
  return true;
}

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(20),
  password: z.string().min(8),
  referralCode: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

const verifyTokenSchema = z.object({
  token: z.string(),
});

const verifyEmailSchema = z.object({
  token: z.string(),
});

const resendVerificationSchema = z.object({
  email: z.string().email(),
});

const forgotPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: "Too many password reset attempts, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "development",
});

function sidCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

// POST /auth/register
router.post("/register", async (req, res) => {
  try {
    if (!ensureSafeOrigin(req, res)) return;

    const data = registerSchema.parse(req.body);

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email: data.email }, { username: data.username }] },
      select: { email: true, username: true },
    });

    if (existingUser) {
      return res.status(400).json({
        message: existingUser.email === data.email ? "Email already registered" : "Username already taken",
      });
    }

    const passwordHash = await hashPassword(data.password);
    const userReferralCode = `XNRT${nanoid(8).toUpperCase()}`;

    let referredBy: string | null = null;
    if (data.referralCode) {
      const referrer = await prisma.user.findUnique({
        where: { referralCode: data.referralCode },
        select: { id: true },
      });
      if (referrer) referredBy = referrer.id;
    }

    const emailVerificationToken = crypto.randomBytes(32).toString("hex");
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        username: data.username,
        passwordHash,
        referralCode: userReferralCode,
        referredBy,
        emailVerified: false,
        emailVerificationToken,
        emailVerificationExpires,
      },
      select: { id: true, email: true, username: true },
    });

    await prisma.balance.create({ data: { userId: user.id } });

    // Assign all active tasks to new user
const activeTasks = (await prisma.task.findMany({
  where: { isActive: true },
  select: { id: true },
})) as Array<{ id: string }>;

if (activeTasks.length > 0) {
  await prisma.userTask.createMany({
    data: activeTasks.map((task: { id: string }) => ({
      userId: user.id,
      taskId: task.id,
      progress: 0,
      maxProgress: 1,
      completed: false,
    })),
    skipDuplicates: true,
  });
}

    if (referredBy) {
      const referrerChain = await getReferrerChain(referredBy);
      for (let i = 0; i < Math.min(referrerChain.length, 3); i++) {
        await prisma.referral.create({
          data: {
            referrerId: referrerChain[i],
            referredUserId: user.id,
            level: i + 1,
          },
        });
      }
    }

    try {
      await sendVerificationEmail(user.email, user.username, emailVerificationToken);
    } catch (emailError) {
      console.error("Failed to send verification email:", emailError);
    }

    return res.status(201).json({
      message: "Registration successful! Please check your email to verify your account.",
      user: { id: user.id, email: user.email, username: user.username, emailVerified: false },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    console.error("Register error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// POST /auth/login
router.post("/login", loginRateLimiter, async (req, res) => {
  try {
    if (!ensureSafeOrigin(req, res)) return;

    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isValid = await comparePassword(data.password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        message: "Please verify your email address before logging in. Check your inbox for the verification link.",
        emailVerified: false,
      });
    }

    const { token, jwtId } = signToken({ userId: user.id, email: user.email });

    await prisma.session.create({
      data: { jwtId, userId: user.id },
    });

    res.cookie("sid", token, sidCookieOptions());

    return res.json({
      message: "Login successful",
      user: { id: user.id, email: user.email, username: user.username },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    console.error("Login error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// POST /auth/verify-email
router.post("/verify-email", async (req, res) => {
  try {
    if (!ensureSafeOrigin(req, res)) return;

    const data = verifyEmailSchema.parse(req.body);

    const user = await prisma.user.findFirst({
      where: { emailVerificationToken: data.token },
    });

    if (!user) return res.status(400).json({ message: "Invalid verification token" });
    if (user.emailVerified) return res.status(400).json({ message: "Email already verified" });

    if (user.emailVerificationExpires && new Date() > user.emailVerificationExpires) {
      return res.status(400).json({
        message: "Verification token has expired. Please request a new one.",
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });

    const { token, jwtId } = signToken({ userId: user.id, email: user.email });

    await prisma.session.create({ data: { jwtId, userId: user.id } });

    res.cookie("sid", token, sidCookieOptions());

    return res.json({
      message: "Email verified successfully!",
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        emailVerified: true,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    console.error("Verify email error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// POST /auth/resend-verification
router.post("/resend-verification", forgotPasswordRateLimiter, async (req, res) => {
  try {
    if (!ensureSafeOrigin(req, res)) return;

    const data = resendVerificationSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    const uniformResponse = {
      message: "If an account exists with this email and is not yet verified, a verification link has been sent",
    };

    if (!user || user.emailVerified) return res.json(uniformResponse);

    const emailVerificationToken = crypto.randomBytes(32).toString("hex");
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationToken, emailVerificationExpires },
    });

    try {
      await sendVerificationEmail(user.email, user.username, emailVerificationToken);
    } catch (emailError) {
      console.error("Failed to resend verification email:", emailError);
    }

    return res.json(uniformResponse);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    console.error("Resend verification error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// POST /auth/logout
router.post("/logout", requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!ensureSafeOrigin(req, res)) return;

    const jwtId = req.authUser?.jwtId;

    if (jwtId) {
      await prisma.session.update({
        where: { jwtId },
        data: { revokedAt: new Date() },
      });
    }

    clearSidCookie(res);
    return res.status(204).send();
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// GET /auth/me
router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.authUser!.id },
      select: {
        id: true,
        email: true,
        username: true,
        referralCode: true,
        emailVerified: true,
        isAdmin: true,
        xp: true,
        level: true,
        streak: true,
        lastCheckIn: true,
        createdAt: true,
      },
    });

    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json(user);
  } catch (error) {
    console.error("Get user error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// GET /auth/csrf
router.get("/csrf", (req, res) => {
  const csrfToken = generateCSRFToken();
  const isProd = process.env.NODE_ENV === "production";

  res.cookie("csrfToken", csrfToken, {
    httpOnly: false,
    secure: isProd,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    maxAge: 24 * 60 * 60 * 1000,
    path: "/",
  });

  return res.json({ csrfToken });
});

// POST /auth/forgot-password
router.post("/forgot-password", forgotPasswordRateLimiter, async (req, res) => {
  try {
    if (!ensureSafeOrigin(req, res)) return;

    const data = forgotPasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true, email: true, username: true },
    });

    // Uniform response to prevent user enumeration
    const uniformResponse = {
      message: "If an account exists with this email, a password reset link has been sent",
    };

    if (!user) return res.json(uniformResponse);

    const token = generateResetToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordReset.create({
      data: { token, userId: user.id, expiresAt },
    });

    try {
      await sendPasswordResetEmail(user.email, user.username, token);
    } catch (emailError) {
      console.error("Failed to send password reset email:", emailError);
    }

    return res.json(uniformResponse);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    console.error("Forgot password error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// POST /auth/verify-reset-token
router.post("/verify-reset-token", async (req, res) => {
  try {
    if (!ensureSafeOrigin(req, res)) return;

    const data = verifyTokenSchema.parse(req.body);

    const resetToken = await prisma.passwordReset.findUnique({
      where: { token: data.token },
    });

    if (!resetToken) return res.status(400).json({ message: "Invalid or expired reset token" });
    if (resetToken.usedAt) return res.status(400).json({ message: "This reset token has already been used" });
    if (new Date() > resetToken.expiresAt) return res.status(400).json({ message: "Reset token has expired" });

    return res.json({ valid: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    console.error("Verify token error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// POST /auth/reset-password
router.post("/reset-password", async (req, res) => {
  try {
    if (!ensureSafeOrigin(req, res)) return;

    const data = resetPasswordSchema.parse(req.body);

    const resetToken = await prisma.passwordReset.findUnique({
      where: { token: data.token },
      include: { user: true },
    });

    if (!resetToken) return res.status(400).json({ message: "Invalid or expired reset token" });
    if (resetToken.usedAt) return res.status(400).json({ message: "This reset token has already been used" });
    if (new Date() > resetToken.expiresAt) return res.status(400).json({ message: "Reset token has expired" });

    const passwordHash = await hashPassword(data.password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordReset.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      prisma.session.updateMany({
        where: { userId: resetToken.userId },
        data: { revokedAt: new Date() },
      }),
    ]);

    // Optional: log out on password reset by clearing cookie too
    clearSidCookie(res);

    return res.json({ message: "Password has been reset successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    console.error("Reset password error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

async function getReferrerChain(userId: string): Promise<string[]> {
  const chain: string[] = [userId];
  let currentUserId = userId;

  for (let i = 0; i < 2; i++) {
    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { referredBy: true },
    });

    if (!user?.referredBy) break;

    chain.push(user.referredBy);
    currentUserId = user.referredBy;
  }

  return chain;
}

export default router;
