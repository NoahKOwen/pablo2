import type { Request, Response, NextFunction, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { prisma } from "../db/client";
import { withRetry } from "../lib/prisma-retry";
import { verifyToken } from "./jwt";
import { validateCSRFToken } from "./csrf";

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: string;
        email: string;
        jwtId: string;
      };
    }
  }
}

export type AuthRequest = Request;

function cookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    path: "/",
  };
}

export function clearSidCookie(res: Response) {
  res.clearCookie("sid", cookieOptions());
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.sid;

  if (!token) {
    clearSidCookie(res);
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    clearSidCookie(res);
    return res.status(401).json({ message: "Unauthorized: Invalid or expired token" });
  }

  try {
    const session = (await withRetry(() =>
      prisma.session.findUnique({
        where: { jwtId: payload.jwtId },
        select: { jwtId: true, revokedAt: true },
      }),
    )) as { jwtId: string; revokedAt: Date | null } | null;

    if (!session || session.revokedAt) {
      clearSidCookie(res);
      return res.status(401).json({ message: "Unauthorized: Session revoked" });
    }

    req.authUser = {
      id: payload.userId,
      email: payload.email,
      jwtId: payload.jwtId,
    };

    return next();
  } catch (error) {
    console.error("Auth middleware DB error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.authUser) {
      return res.status(401).json({ message: "Unauthorized: Please log in first" });
    }

    const authUserId = req.authUser.id;

    const user = (await withRetry(() =>
      prisma.user.findUnique({
        where: { id: authUserId },
        select: { isAdmin: true },
      }),
    )) as { isAdmin: boolean } | null;

    if (!user?.isAdmin) {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }

    return next();
  } catch (error) {
    console.error("Admin middleware error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * CSRF header/cookie check.
 * Use this on state-changing routes that rely on cookies (sid).
 */
export function validateCSRF(req: Request, res: Response, next: NextFunction) {
  const rawHeader = req.headers["x-csrf-token"];
  const headerToken = Array.isArray(rawHeader) ? rawHeader[0] : (rawHeader as string | undefined);
  const cookieToken = req.cookies?.csrfToken as string | undefined;

  if (!validateCSRFToken(headerToken, cookieToken)) {
    return res.status(403).json({ message: "Invalid CSRF token" });
  }

  return next();
}

/**
 * Basic Origin/Host check to mitigate CSRF when sameSite='none' is used.
 * Allows no-Origin (curl / some same-origin cases) and exact hostname match.
 */
export function enforceSameOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  const host = req.headers.host;

  if (!origin || !host) return next();

  try {
    const originUrl = new URL(origin);
    const [hostName] = host.split(":");

    if (originUrl.hostname !== hostName) {
      return res.status(403).json({ message: "Invalid origin" });
    }

    return next();
  } catch (err) {
    console.error("enforceSameOrigin error:", err);
    return res.status(403).json({ message: "Invalid origin" });
  }
}

export const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { message: "Too many login attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "development",
});

// Convenience helper for global middleware chains
export const skipIfOptions: RequestHandler = (req, _res, next) => {
  if (req.method.toUpperCase() === "OPTIONS") return next();
  return next();
};
