import jwt, { type SignOptions, type Secret } from "jsonwebtoken";
import crypto from "crypto";

function getJwtSecret(): Secret {
  const raw = process.env.JWT_SECRET;

  // In production: do not allow weak defaults
  if (process.env.NODE_ENV === "production" && (!raw || raw.trim().length < 16)) {
    throw new Error(
      "[auth/jwt] JWT_SECRET is missing/too short in production. Set a strong JWT_SECRET env var.",
    );
  }

  // Dev fallback (still warn)
  if (!raw || raw.trim().length < 16) {
    console.warn(
      "[auth/jwt] Using a dev fallback JWT_SECRET. Set JWT_SECRET for safer dev/prod parity.",
    );
    return "dev-secret-change-me" as Secret;
  }

  return raw as Secret;
}

const JWT_SECRET: Secret = getJwtSecret();

// Use seconds for expiresIn to keep typing simple
const DEFAULT_EXPIRES = 7 * 24 * 60 * 60; // 7 days

function getExpiresInSeconds(): number {
  const raw = process.env.JWT_EXPIRES_IN;
  if (!raw) return DEFAULT_EXPIRES;

  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_EXPIRES;

  return Math.floor(n);
}

const JWT_EXPIRES_IN_SECONDS = getExpiresInSeconds();

export interface AuthTokenPayload {
  userId: string;
  email: string;
  jwtId: string;
  iat?: number;
  exp?: number;
}

type SignTokenParams = Pick<AuthTokenPayload, "userId" | "email">;

export function signToken(params: SignTokenParams): { token: string; jwtId: string } {
  const jwtId = crypto.randomBytes(16).toString("hex");

  const payload: AuthTokenPayload = {
    userId: params.userId,
    email: params.email,
    jwtId,
  };

  const signOptions: SignOptions = {
    expiresIn: JWT_EXPIRES_IN_SECONDS,
  };

  const token = jwt.sign(payload, JWT_SECRET, signOptions);
  return { token, jwtId };
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}
