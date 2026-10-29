import { PrismaClient } from "@prisma/client";
import {
  MINING_POWER_MAX_ECOSYSTEM_BOOST,
  MINING_POWER_MAX_EFFECTIVE_MP_MULTIPLIER,
  MINING_POWER_REWARD_TIMEZONE,
  MINING_POWER_V1_DRAFT_VERSION,
  MINING_POWER_V1_SEED_DURATIONS,
  MINING_POWER_V1_SEED_PACKAGES,
} from "../shared/mining-power";

const prisma = new PrismaClient();

async function main() {
  const config = await prisma.miningProtocolConfig.upsert({
    where: { version: MINING_POWER_V1_DRAFT_VERSION },
    update: {},
    create: {
      version: MINING_POWER_V1_DRAFT_VERSION,
      status: "draft",
      tokenomicsVersion: "mining-v1-draft",
      maxSupplySnapshot: "1000000000",
      miningAllocationPercentSnapshot: "15",
      rewardPoolTokenAmount: "150000000",
      maxEffectiveMpMultiplier: MINING_POWER_MAX_EFFECTIVE_MP_MULTIPLIER,
      maxEcosystemBoost: MINING_POWER_MAX_ECOSYSTEM_BOOST,
      fullEmissionBaseMpThreshold: null,
      baseMpPerUsdt: "1",
      rewardTimezone: MINING_POWER_REWARD_TIMEZONE,
      rewardBoundaryHourUtc: 0,
      termsVersion: "mining-power-v1-r0",
    },
  });

  for (const item of MINING_POWER_V1_SEED_PACKAGES) {
    await prisma.miningPackage.upsert({
      where: {
        protocolConfigId_code: {
          protocolConfigId: config.id,
          code: item.code,
        },
      },
      update: {
        name: item.name,
        activationAmountUsdt: item.activationAmountUsdt,
        baseMp: item.baseMp,
        packageBoostRate: item.packageBoostRate,
        sortOrder: item.sortOrder,
      },
      create: {
        protocolConfigId: config.id,
        code: item.code,
        name: item.name,
        activationAmountUsdt: item.activationAmountUsdt,
        baseMp: item.baseMp,
        packageBoostRate: item.packageBoostRate,
        sortOrder: item.sortOrder,
      },
    });
  }

  for (const item of MINING_POWER_V1_SEED_DURATIONS) {
    await prisma.miningDuration.upsert({
      where: {
        protocolConfigId_months: {
          protocolConfigId: config.id,
          months: item.months,
        },
      },
      update: { multiplier: item.multiplier },
      create: {
        protocolConfigId: config.id,
        months: item.months,
        multiplier: item.multiplier,
      },
    });
  }

  console.log(
    `Mining Power R1 seed ready: ${MINING_POWER_V1_SEED_PACKAGES.length} packages, ${MINING_POWER_V1_SEED_DURATIONS.length} durations (${config.version}).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
