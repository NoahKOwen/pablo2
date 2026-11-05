// server/scripts/generateDepositAddresses.ts
import "dotenv/config";
import { prisma } from "../db/client";
import { deriveDepositAddress } from "../services/hdWallet";

/**
 * Migration script to generate / fix unique deposit addresses for users.
 *
 * Rules:
 * - If user has BOTH depositAddress AND derivationIndex → leave as-is.
 * - If user has derivationIndex BUT no depositAddress → derive address from index.
 * - If user has NEITHER → assign next available derivationIndex and derive address.
 * - If user has depositAddress BUT NO derivationIndex → SKIP (log warning) to avoid
 *   overwriting an address that may already be in use on-chain.
 */
async function generateDepositAddresses() {
  console.log("🔑 Starting deposit address generation for existing users...\n");

  try {
    const usersNeedingWork = await prisma.user.findMany({
      where: {
        OR: [{ depositAddress: null }, { derivationIndex: null }],
      },
      select: {
        id: true,
        email: true,
        username: true,
        depositAddress: true,
        derivationIndex: true,
      },
      orderBy: { createdAt: "asc" },
    });

    if (usersNeedingWork.length === 0) {
      console.log("✅ All users already have deposit addresses & indices!\n");
      return;
    }

    console.log(
      `📊 Found ${usersNeedingWork.length} users with missing address and/or derivation index\n`,
    );

    // Highest existing derivation index among ALL users
    const maxIndexUser = await prisma.user.findFirst({
      where: { derivationIndex: { not: null } },
      orderBy: { derivationIndex: "desc" },
      select: { derivationIndex: true },
    });

    let nextIndex = (maxIndexUser?.derivationIndex ?? -1) + 1;

    console.log(`🔢 Next available derivation index: ${nextIndex}\n`);

    let createdNew = 0;
    let filledMissingAddress = 0;
    let skippedHasAddressNoIndex = 0;

    for (const user of usersNeedingWork) {
      const hasAddress = !!user.depositAddress;
      const hasIndex =
        user.derivationIndex !== null && user.derivationIndex !== undefined;

      // Shouldn't normally happen due to the WHERE, but guard anyway
      if (hasAddress && hasIndex) {
        continue;
      }

      // Danger case: user already has an address that may be in use on-chain,
      // but no derivationIndex to reproduce the key. Do NOT overwrite.
      if (hasAddress && !hasIndex) {
        console.warn(
          `⚠️  Skipping user ${user.username} (${user.email}) - has depositAddress (${user.depositAddress}) but no derivationIndex. Manual review required.`,
        );
        skippedHasAddressNoIndex++;
        continue;
      }

      // Has index but missing address → safe to derive address from that index.
      if (!hasAddress && hasIndex) {
        const index = user.derivationIndex!;
        try {
          const derivedAddress = deriveDepositAddress(index);

          await prisma.user.update({
            where: { id: user.id },
            data: {
              depositAddress: derivedAddress.toLowerCase(),
            },
          });

          console.log(
            `✅ Filled missing address for ${user.username} (${user.email})`,
          );
          console.log(`   Address: ${derivedAddress}`);
          console.log(`   Index:   ${index}\n`);

          filledMissingAddress++;
        } catch (error) {
          console.error(
            `❌ Failed to derive address at index ${user.derivationIndex} for ${user.username}:`,
            error,
          );
        }
        continue;
      }

      // No address AND no index → allocate next index and derive address.
      if (!hasAddress && !hasIndex) {
        try {
          const index = nextIndex;
          const derivedAddress = deriveDepositAddress(index);

          await prisma.user.update({
            where: { id: user.id },
            data: {
              depositAddress: derivedAddress.toLowerCase(),
              derivationIndex: index,
            },
          });

          console.log(
            `✅ Created new address for ${user.username} (${user.email})`,
          );
          console.log(`   Address: ${derivedAddress}`);
          console.log(`   Index:   ${index}\n`);

          createdNew++;
          nextIndex++;
        } catch (error) {
          console.error(
            `❌ Failed to generate address for ${user.username} (new index ${nextIndex}):`,
            error,
          );
        }
      }
    }

    console.log("✨ Deposit address generation completed!\n");
    console.log(`📈 New addresses created:           ${createdNew}`);
    console.log(`🔧 Addresses filled from index:     ${filledMissingAddress}`);
    console.log(
      `⚠️  Skipped (has address, no index): ${skippedHasAddressNoIndex}`,
    );
    console.log(`🔢 Next available index:            ${nextIndex}\n`);
  } catch (error) {
    console.error("❌ Error during address generation:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
generateDepositAddresses().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
