import { nanoid } from "nanoid";
import crypto from "crypto";

export function generateCSRFToken(): string {
  return nanoid(32);
}

export function validateCSRFToken(
  headerToken: string | undefined,
  cookieToken: string | undefined,
): boolean {
  if (!headerToken || !cookieToken) return false;

  const a = headerToken.trim();
  const b = cookieToken.trim();
  if (!a || !b) return false;

  // Compare bytes (utf8) and require same length before timingSafeEqual
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;

  try {
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
