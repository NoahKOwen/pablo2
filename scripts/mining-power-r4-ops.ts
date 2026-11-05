/** Manual-only R4 operator CLI. No scheduled workers, no network-facing writes. */
import { prisma } from "../server/db/client";
import {
  r4AuditDay,
  r4CreditChunk,
  r4FindBatchForDay,
  r4MaterializeBatch,
  r4PlanRewardBatch,
  r4Status,
} from "../server/services/miningPowerRewards";

async function main() {
  const [operation, ...args] = process.argv.slice(2);
  const dayArg = args.find(v=>v.startsWith("--day="));
  const day = dayArg?.slice("--day=".length);
  const confirm = args.includes("--confirm");
  const limitArg = args.find(v=>v.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : 25;
  if (operation === "status") {
    console.log(JSON.stringify(await r4Status(), null, 2));
  } else if (operation === "audit" && day) {
    console.log(JSON.stringify(await r4AuditDay(day), null, 2));
  } else if (operation === "batch" && day) {
    console.log(JSON.stringify(await r4FindBatchForDay(day), null, 2));
  } else if (confirm && day && operation === "plan") {
    console.log(JSON.stringify(await r4PlanRewardBatch(day), null, 2));
  } else if (confirm && day && operation === "materialize") {
    console.log(JSON.stringify(await r4MaterializeBatch(day), null, 2));
  } else if (confirm && day && operation === "credit") {
    console.log(JSON.stringify(await r4CreditChunk(day, limit), null, 2));
  } else {
    throw new Error("Usage: status | audit --day=YYYY-MM-DD | batch --day=... | plan/materialize/credit --day=... --confirm [--limit=1..50]");
  }
}
main().catch(e=>{ console.error("R4 operator command refused:", e?.code ?? "ERROR", e?.message ?? e); process.exitCode=1; })
  .finally(async()=>{ await (prisma as any).$disconnect(); });
