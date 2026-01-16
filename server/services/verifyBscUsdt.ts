// server/services/verifyBscUsdt.ts
import { ethers } from "ethers";

// Reuse BSC RPC + USDT envs same as depositScanner
const RPC_URL = process.env.RPC_BSC_URL || "";
const USDT_ADDRESS = (process.env.USDT_BSC_ADDRESS || "").toLowerCase();

if (!RPC_URL) {
  console.warn(
    "[verifyBscUsdt] RPC_BSC_URL not set; on-chain verification will always fail."
  );
}

if (!USDT_ADDRESS) {
  console.warn(
    "[verifyBscUsdt] USDT_BSC_ADDRESS not set; on-chain verification will always fail."
  );
}

const provider = new ethers.JsonRpcProvider(RPC_URL);

const USDT_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

const usdt = new ethers.Contract(USDT_ADDRESS, USDT_ABI, provider);

export type VerifyResult = {
  verified: boolean;
  confirmations: number;
  amountOnChain?: number;
  reason?: string;
};

export async function verifyBscUsdtDeposit(params: {
  txHash: string;
  expectedTo: string;
  minAmount?: number;
  requiredConf?: number;
}): Promise<VerifyResult> {
  const { txHash, expectedTo } = params;

  // ---------- TEST/DEV OVERRIDE ----------
  // Enable by env: ALLOW_VERIFY_OVERRIDE=1
  // Optional: VERIFY_OVERRIDE_PREFIX="test:" => only override if txHash startsWith("test:")
  // NOTE: In prod keep ALLOW_VERIFY_OVERRIDE unset/0.
  const allowOverride =
    process.env.ALLOW_VERIFY_OVERRIDE === "1" &&
    (process.env.NODE_ENV !== "production" ||
      process.env.FORCE_OVERRIDE_IN_PROD === "1");

  const prefix = (process.env.VERIFY_OVERRIDE_PREFIX || "").toLowerCase();
  const matchPrefix = prefix
    ? txHash?.toLowerCase().startsWith(prefix)
    : true;

  // Also allow sentinel: requiredConf === -1 to force override from caller (optional)
  const forceByParam = params.requiredConf === -1;

  if (allowOverride && (matchPrefix || forceByParam)) {
    const fakeConf = Number(process.env.OVERRIDE_CONFIRMATIONS ?? 12);
    const amt =
      typeof params.minAmount === "number" ? params.minAmount : undefined;

    return {
      verified: true,
      confirmations: fakeConf,
      amountOnChain: amt,
      reason: "override",
    };
  }
  // ---------------------------------------

  if (!RPC_URL || !USDT_ADDRESS) {
    return {
      verified: false,
      confirmations: 0,
      reason: "RPC_BSC_URL or USDT_BSC_ADDRESS not configured",
    };
  }

  try {
    const need =
      params.requiredConf ?? Number(process.env.BSC_CONFIRMATIONS ?? 12);

    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      return {
        verified: false,
        confirmations: 0,
        reason: "Transaction not found",
      };
    }

    // status 1 = success, 0 = reverted / failed
    if (receipt.status !== 1) {
      const currentBlock = await provider.getBlockNumber();
      const conf = currentBlock - (receipt.blockNumber ?? 0);

      return {
        verified: false,
        confirmations: conf,
        reason: "Transaction failed",
      };
    }

    let totalToExpected = BigInt(0);

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== USDT_ADDRESS) {
        continue;
      }

      try {
        const parsed = usdt.interface.parseLog({
          topics: log.topics,
          data: log.data,
        });

        if (parsed?.name !== "Transfer") continue;

        const to: string = (parsed.args as any).to;
        const value: bigint = (parsed.args as any).value;

        if (to.toLowerCase() === expectedTo.toLowerCase()) {
          totalToExpected += value;
        }
      } catch {
        // Ignore non-transfer / unparsable logs
      }
    }

    const currentBlock = await provider.getBlockNumber();
    const conf = currentBlock - (receipt.blockNumber ?? 0);

    if (totalToExpected === BigInt(0)) {
      return {
        verified: false,
        confirmations: conf,
        reason: "No USDT transfer to expected address",
      };
    }

    // USDT (BSC) has 18 decimals
    const amountFloat = Number(ethers.formatUnits(totalToExpected, 18));

    if (
      typeof params.minAmount === "number" &&
      amountFloat + 1e-10 < params.minAmount
    ) {
      return {
        verified: false,
        confirmations: conf,
        reason: `On-chain ${amountFloat} USDT < claimed ${params.minAmount} USDT`,
      };
    }

    if (conf < need) {
      return {
        verified: false,
        confirmations: conf,
        amountOnChain: amountFloat,
        reason: `Only ${conf}/${need} confirmations`,
      };
    }

    return {
      verified: true,
      confirmations: conf,
      amountOnChain: amountFloat,
    };
  } catch (e: any) {
    // Thora sa cleaner error message
    if (
      e?.code === "BAD_DATA" &&
      typeof e?.shortMessage === "string" &&
      e.shortMessage.includes("rate limit")
    ) {
      return {
        verified: false,
        confirmations: 0,
        reason: "RPC rate limited (eth_getLogs / receipt). Try again later.",
      };
    }

    return {
      verified: false,
      confirmations: 0,
      reason: e?.message ?? "Verify error",
    };
  }
}
