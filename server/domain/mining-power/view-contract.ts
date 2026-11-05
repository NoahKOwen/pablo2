/** Read-model validation helpers without database side effects. */
export const R5_MAX_PAGE_SIZE = 50;
export class MiningPowerViewInputError extends Error {
  readonly code = "INVALID_PAGINATION";
  readonly httpStatus = 400;
}
export function r5PageSize(raw: unknown, fallback = 20): number {
  if (raw === undefined) return fallback;
  if (typeof raw !== "string" || !/^[1-9][0-9]{0,2}$/.test(raw)) {
    throw new MiningPowerViewInputError("limit must be an integer between 1 and 50");
  }
  const n = Number(raw);
  if (n < 1 || n > R5_MAX_PAGE_SIZE) {
    throw new MiningPowerViewInputError("limit must be an integer between 1 and 50");
  }
  return n;
}
export function r5PageCursor(raw: unknown): string | null {
  if (raw === undefined) return null;
  if (typeof raw !== "string" || raw.length < 1 || raw.length > 100 || !/^[a-zA-Z0-9-]+$/.test(raw)) {
    throw new MiningPowerViewInputError("Invalid page cursor");
  }
  return raw;
}
export function r5CursorFilter<T extends { id: string; createdAt: Date }>(anchor: T | null, userId: string) {
  if (!anchor) return { userId };
  return {
    userId,
    OR: [
      { createdAt: { lt: anchor.createdAt } },
      { createdAt: anchor.createdAt, id: { lt: anchor.id } },
    ],
  };
}
export function r5Decimal(value: any): string {
  if (value === null || value === undefined) return "0";
  // Prisma Decimal#toString may emit scientific notation. toFixed avoids it.
  if (typeof value.toFixed === "function") return value.toFixed();
  return String(value);
}
export function r5Iso(value: Date | null | undefined): string | null { return value ? value.toISOString() : null; }
export function r5NextBoundary(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}
