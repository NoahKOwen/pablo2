/** Deliberately no CLI command to create/activate a production R3 program.
 * Governance/treasury configuration must be reviewed separately.
 * Reservation is a manual, explicit operation and NEVER credits balances.
 */
import { prisma } from "../server/db/client";
import {
  listMiningEmissionDays,
  readMiningEmissionAdminStatus,
  reserveCompletedMiningEmissionDay,
} from "../server/services/miningPowerEmission";

async function main() {
  const [action, dayArg] = process.argv.slice(2);
  if (action === "status") {
    console.log(JSON.stringify(await readMiningEmissionAdminStatus(), null, 2));
  } else if (action === "days") {
    console.log(JSON.stringify(await listMiningEmissionDays(), null, 2));
  } else if (action === "reserve") {
    const parsed = /^--day=(\d{4}-\d{2}-\d{2})$/.exec(dayArg ?? "");
    if (!parsed || process.argv[4] !== "--confirm" || process.env.MINING_POWER_R3_ENABLE_RESERVATIONS !== "1") {
      throw new Error("Reserve requires --day=YYYY-MM-DD --confirm and MINING_POWER_R3_ENABLE_RESERVATIONS=1");
    }
    const result = await reserveCompletedMiningEmissionDay({ day: parsed[1] });
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("Usage: pnpm exec tsx scripts/mining-power-r3-ops.ts status|days|reserve --day=YYYY-MM-DD --confirm");
    process.exitCode = 2;
  }
}
main().catch((e) => {
  console.error("R3 operation refused:", e?.code ?? "ERROR", e?.message ?? e);
  process.exitCode = 1;
}).finally(async () => {
  await (prisma as any).$disconnect();
});
