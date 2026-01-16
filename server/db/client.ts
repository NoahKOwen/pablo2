import { createRequire } from "module";

const require = createRequire(import.meta.url);

const prismaPkg: any = require("@prisma/client");

const PrismaClientCtor =
  prismaPkg?.PrismaClient ??
  prismaPkg?.default?.PrismaClient ??
  prismaPkg?.default ??
  prismaPkg;

if (!PrismaClientCtor) {
  throw new Error(
    "[Prisma] PrismaClient constructor not found. Did you run `prisma generate`?",
  );
}

export const Prisma: any = prismaPkg?.Prisma ?? prismaPkg?.default?.Prisma ?? prismaPkg;

const globalForPrisma = globalThis as unknown as { prisma?: any };

const rawDbUrl = process.env.DATABASE_URL;

if (!rawDbUrl) {
  console.warn("[Prisma] DATABASE_URL is not set; Prisma client will not be able to connect.");
} else if (process.env.NODE_ENV === "development") {
  const masked = rawDbUrl.replace(/(:)([^:@]+)(@)/, ":***@");
  console.log("[Prisma] DATABASE_URL:", masked);
}

const defaultPrismaLogs = process.env.NODE_ENV === "development"
  ? ["query", "info", "warn", "error"]
  : ["error"];

const prismaLogs = process.env.PRISMA_LOGS
  ? process.env.PRISMA_LOGS.split(",").map((s) => s.trim())
  : defaultPrismaLogs;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClientCtor({
    log: prismaLogs,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Attach runtime event handlers for Prisma to surface more detailed logs during development.
if (process.env.NODE_ENV === "development") {
  try {
    // Query events
    if (prismaLogs.includes("query") || prismaLogs.includes("info")) {
      prisma.$on("query", (e: any) => {
        // avoid logging raw parameters in prod; in dev this is useful
        const params = e.params ? ` params=${JSON.stringify(e.params)}` : "";
        console.log(`[prisma][query] ${e.query} (${e.duration}ms)${params}`);
      });
    }

    // Info / warn / error
    if (prismaLogs.includes("info")) {
      prisma.$on("info", (e: any) => console.info("[prisma][info]", e.message || e));
    }
    if (prismaLogs.includes("warn")) {
      prisma.$on("warn", (e: any) => console.warn("[prisma][warn]", e.message || e));
    }
    if (prismaLogs.includes("error")) {
      prisma.$on("error", (e: any) => {
        try {
          console.error("[prisma][error]", e?.message ?? e, e?.stack ? `\n${e.stack}` : "");
        } catch (err) {
          console.error("[prisma][error] (failed to stringify)", e);
        }
      });
    }
  } catch (err) {
    // Non-fatal: if $on isn't available or errors occur, just log the problem.
    console.warn("[prisma] failed to attach event listeners:", err);
  }
}

// Optional debug ping to detect intermittent connection closures.
// Enable by setting PRISMA_DEBUG_PING=true in development.
if (process.env.NODE_ENV === "development" && process.env.PRISMA_DEBUG_PING === "true") {
  try {
    const pingInterval = Number(process.env.PRISMA_DEBUG_PING_INTERVAL_MS) || 10000;
    console.log(`[prisma][ping] debug ping enabled (interval=${pingInterval}ms)`);
    setInterval(async () => {
      try {
        // Use a small raw query to avoid heavy plan overhead
        await (prisma as any).$queryRaw`SELECT 1`;
        console.log("[prisma][ping] ok");
      } catch (err: any) {
        console.error("[prisma][ping][error]", err?.message ?? err, err?.stack ? `\n${err.stack}` : "");
      }
    }, pingInterval);
  } catch (err) {
    console.warn("[prisma][ping] failed to start ping monitor:", err);
  }
}

export type PrismaClient = typeof prisma;
