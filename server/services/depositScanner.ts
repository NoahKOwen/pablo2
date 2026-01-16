// server/services/depositScanner.ts
import { ethers } from "ethers";
import { prisma, Prisma } from "../db/client";

const RPC_URL = process.env.RPC_BSC_URL || "";
const USDT_ADDRESS = (process.env.USDT_BSC_ADDRESS || "").toLowerCase();
const TREASURY_ADDRESS = (process.env.XNRT_WALLET || "").toLowerCase();
const REQUIRED_CONFIRMATIONS = Number(process.env.BSC_CONFIRMATIONS || 12);
const XNRT_RATE = Number(process.env.XNRT_RATE_USDT || 100);
const PLATFORM_FEE_BPS = Number(process.env.PLATFORM_FEE_BPS || 0);
const SCAN_BATCH = Number(process.env.BSC_SCAN_BATCH || 300);
const AUTO_DEPOSIT_ENABLED = process.env.AUTO_DEPOSIT === "true";

const provider = new ethers.JsonRpcProvider(RPC_URL);
const USDT_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];
const usdtContract = new ethers.Contract(USDT_ADDRESS, USDT_ABI, provider);

// in-memory flag to avoid overlapping scans
let isScanning = false;
const SCANNER_ID = "bsc-usdt";

export async function startDepositScanner() {
  if (!AUTO_DEPOSIT_ENABLED) {
    console.log("[DepositScanner] AUTO_DEPOSIT not enabled, scanner disabled");
    return;
  }

  if (!RPC_URL) {
    console.error(
      "[DepositScanner] RPC_BSC_URL is not set. Scanner disabled.",
    );
    return;
  }

  if (!USDT_ADDRESS) {
    console.error(
      "[DepositScanner] USDT_BSC_ADDRESS is not set. Scanner disabled.",
    );
    return;
  }

  const scanInterval = 60 * 1000; // 1 minute

  console.log("[DepositScanner] Starting scanner service...");
  console.log(
    `[DepositScanner] Treasury / manual deposit address: ${
      TREASURY_ADDRESS || "(not configured)"
    }`,
  );
  console.log(`[DepositScanner] USDT token: ${USDT_ADDRESS}`);
  console.log(
    `[DepositScanner] Required confirmations: ${REQUIRED_CONFIRMATIONS}`,
  );
  console.log(`[DepositScanner] Scan batch size: ${SCAN_BATCH}`);
  console.log(`[DepositScanner] Watching user deposit addresses...`);

  // Run immediately
  await scanForDeposits().catch((err) => {
    console.error("[DepositScanner] Initial scan error:", err);
  });

  // Then run every minute
  setInterval(async () => {
    if (!isScanning) {
      await scanForDeposits().catch((err) => {
        console.error("[DepositScanner] Scan error:", err);
      });
    }
  }, scanInterval);
}

export async function scanForDeposits() {
  if (isScanning) return;

  isScanning = true;
  const startTime = Date.now();

  try {
    // Get or create scanner state (single row keyed by scannerId)
    let state = await prisma.scannerState.findUnique({
      where: { scannerId: SCANNER_ID },
    });

    const currentBlock = await provider.getBlockNumber();

    if (!state) {
      // Initialize scanner state
      let startBlock = currentBlock - 100; // Default: 100 blocks ago

      // Support BSC_START_FROM='latest' to start near tip
      if (process.env.BSC_START_FROM === "latest") {
        startBlock = Math.max(0, currentBlock - REQUIRED_CONFIRMATIONS - 3);
        console.log(
          `[DepositScanner] Starting from latest (block ${startBlock})`,
        );
      }

      state = await prisma.scannerState.create({
        data: {
          scannerId: SCANNER_ID,
          lastProcessedBlock: Math.max(0, startBlock),
        },
      });
    }

    const fromBlock = state.lastProcessedBlock + 1;
    const maxToBlock = currentBlock - REQUIRED_CONFIRMATIONS;
    const toBlock = Math.min(maxToBlock, fromBlock + SCAN_BATCH - 1);

    if (fromBlock > toBlock) {
      console.log("[DepositScanner] No new blocks to scan");
      return;
    }

    console.log(
      `[DepositScanner] Scanning blocks ${fromBlock} to ${toBlock}...`,
    );

    // Get all user deposit addresses
    const users = await prisma.user.findMany({
      where: { depositAddress: { not: null } },
      select: { id: true, depositAddress: true },
    });

    // Create address-to-userId mapping
    const addressToUserId = new Map<string, string>();
    users.forEach((user: any) => {
      if (user.depositAddress) {
        addressToUserId.set(user.depositAddress.toLowerCase(), user.id);
      }
    });

    console.log(
      `[DepositScanner] Watching ${users.length} deposit addresses`,
    );

    // Query USDT Transfer events to any address (we'll filter by user addresses)
    const filter = usdtContract.filters.Transfer();
    const events = await usdtContract.queryFilter(filter, fromBlock, toBlock);

    console.log(
      `[DepositScanner] Found ${events.length} transfer events`,
    );

    for (const event of events) {
      if (event instanceof ethers.EventLog) {
        await processDepositEvent(event, currentBlock, addressToUserId);
      }
    }

    // Update scanner state
    await prisma.scannerState.update({
      where: { id: state.id },
      data: {
        lastProcessedBlock: toBlock,
      },
    });

    const duration = Date.now() - startTime;
    console.log(
      `[DepositScanner] Scan completed in ${duration}ms`,
    );
  } catch (error) {
    console.error("[DepositScanner] Scan failed:", error);
  } finally {
    isScanning = false;
  }
}

async function processDepositEvent(
  event: ethers.EventLog,
  currentBlock: number,
  addressToUserId: Map<string, string>,
) {
  try {
    const txHash = event.transactionHash.toLowerCase();
    const from = ((event.args as any).from as string).toLowerCase();
    const to = ((event.args as any).to as string).toLowerCase();
    const value = (event.args as any).value as bigint;
    const blockNumber = event.blockNumber;
    const confirmations = currentBlock - blockNumber;

    // USDT has 18 decimals on BSC
    const usdtAmount = Number(ethers.formatUnits(value, 18));

    // Check if this transfer is to a user's deposit address
    const userId = addressToUserId.get(to);

    if (!userId) {
      // Not sent to a user deposit address, check if it's to treasury (legacy/manual)
      if (TREASURY_ADDRESS && to === TREASURY_ADDRESS) {
        // Legacy treasury deposit - check for linked wallet
        const linkedWallet = await prisma.linkedWallet.findFirst({
          where: { address: from, active: true },
        });

        if (linkedWallet) {
          // Skip if already processed
          const existing = await prisma.transaction.findFirst({
            where: { transactionHash: txHash },
          });
          if (existing) return;

          await processUserDeposit(
            linkedWallet.userId,
            to,
            from,
            usdtAmount,
            txHash,
            blockNumber,
            confirmations,
          );
        }
      }
      return; // Not a user deposit
    }

    // Skip if already processed
    const existingTx = await prisma.transaction.findFirst({
      where: { transactionHash: txHash },
    });

    if (existingTx) {
      return; // Already processed
    }

    console.log(
      `[DepositScanner] New deposit: ${usdtAmount} USDT to user deposit address ${to}`,
    );

    // Process user deposit
    await processUserDeposit(
      userId,
      to,
      from,
      usdtAmount,
      txHash,
      blockNumber,
      confirmations,
    );
  } catch (error) {
    console.error("[DepositScanner] Event processing error:", error);
  }
}

async function processUserDeposit(
  userId: string,
  toAddress: string,
  fromAddress: string,
  usdtAmount: number,
  txHash: string,
  blockNumber: number,
  confirmations: number,
) {
  try {
    // Make sure we only ever credit once tx has enough confirmations.
    if (confirmations < REQUIRED_CONFIRMATIONS) {
      console.log(
        `[DepositScanner] Tx ${txHash} only has ${confirmations}/${REQUIRED_CONFIRMATIONS} confirmations, waiting for more`,
      );
      return;
    }

    // Calculate XNRT amount
    const netUsdt = usdtAmount * (1 - PLATFORM_FEE_BPS / 10_000);
    const xnrtAmount = netUsdt * XNRT_RATE;

    await prisma.$transaction(async (tx: any) => {
      // Create approved transaction
      await tx.transaction.create({
        data: {
          userId,
          type: "deposit",
          amount: new Prisma.Decimal(xnrtAmount),
          usdtAmount: new Prisma.Decimal(usdtAmount),
          transactionHash: txHash,
          walletAddress: toAddress, // User's deposit address or treasury
          status: "approved",
          verified: true,
          confirmations,
          verificationData: {
            autoDeposit: true,
            blockNumber,
            scannedAt: new Date().toISOString(),
            fromAddress,
          } as any,
        },
      });

      // Credit balance atomically
      await tx.balance.upsert({
        where: { userId },
        create: {
          userId,
          xnrtBalance: new Prisma.Decimal(xnrtAmount),
          totalEarned: new Prisma.Decimal(xnrtAmount),
        },
        update: {
          xnrtBalance: { increment: new Prisma.Decimal(xnrtAmount) },
          totalEarned: { increment: new Prisma.Decimal(xnrtAmount) },
        },
      });
    });

    console.log(
      `[DepositScanner] Auto-credited ${xnrtAmount} XNRT to user ${userId}`,
    );

    // Send notification (non-blocking)
    void sendDepositNotification(userId, xnrtAmount, txHash).catch((err) => {
      console.error("[DepositScanner] Notification error:", err);
    });
  } catch (error) {
    console.error("[DepositScanner] Linked deposit processing error:", error);
  }
}

async function sendDepositNotification(
  userId: string,
  amount: number,
  txHash: string,
) {
  // Import dynamically to avoid circular dependency
  const { notifyUser } = await import("../notifications");

  await notifyUser(userId, {
    type: "deposit_approved",
    title: "💰 Deposit Auto-Credited!",
    message: `Your deposit of ${amount.toLocaleString()} XNRT has been automatically credited to your account`,
    url: "/wallet",
    metadata: {
      amount: amount.toString(),
      transactionHash: txHash,
      autoDeposit: true,
    },
  });
}

// Export for manual trigger if needed
export { sendDepositNotification };
