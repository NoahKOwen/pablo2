/**
 * Auto-generated drizzle.config.ts
 * - Ensures drizzle-kit receives `dialect: "postgresql"` (required)
 * - Accepts DATABASE_URL or individual PG* env vars
 * - Uses ssl.rejectUnauthorized: true by default (Neon)
 *
 * If you need different SSL handling for local debugging,
 * modify the ssl property below.
 */

import { defineConfig } from "drizzle-kit";

function parseDatabaseUrl(url?: string) {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const database = u.pathname?.replace(/^\//, "");
    return {
      url: url,
      host: u.hostname,
      port: u.port ? Number(u.port) : undefined,
      user: u.username || undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      database,
      ssl: { rejectUnauthorized: true },
    };
  } catch (e) {
    // fallback to undefined if parse fails
    return undefined;
  }
}

const fromUrl = parseDatabaseUrl(process.env.DATABASE_URL);

const dbCredentials = fromUrl ?? {
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  // Neon / most managed DBs require SSL — keep verify on in prod
  ssl: { rejectUnauthorized: true },
};

export default defineConfig({
  // adjust schema/out paths if your project differs
  schema: "./shared/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // NOTE: don't set driver here unless you need a special driver
  // driver: "aws-data-api" | "d1-http" | "pglite" // examples only
  dbCredentials,
} as any);
