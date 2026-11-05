import { Prisma, prisma } from "../db/client";
import {
  calculateExpirationBoundary,
  firstRewardBoundaryStrictlyAfter,
} from "../domain/mining-power/calculations.ts";
import {
  assertSameIdempotentActivationRequest,
  buildActivationPowerSnapshot,
  MINING_POWER_PAYMENT_ASSET,
  MINING_POWER_TRANSACTION_SOURCE,
  MINING_POWER_TRANSACTION_TYPE,
  normalizeActivationRequestId,
  normalizeBscTransactionHash,
  normalizeOptionalProofImageUrl,
} from "../domain/mining-power/activation.ts";

const prismaAny = prisma as any;
const DecimalCtor = (Prisma as any).Decimal as new (value: any) => any;

export class MiningPowerServiceError extends Error {
  constructor(
    public code: string,
    public httpStatus: number,
    message: string,
  ) {
    super(message);
  }
}

function serviceError(code: string, httpStatus: number, message: string): never {
  throw new MiningPowerServiceError(code, httpStatus, message);
}

function decimalString(value: any): string {
  return value?.toString?.() ?? String(value);
}

function decimalEquals(a: any, b: any): boolean {
  return new DecimalCtor(a).equals(new DecimalCtor(b));
}

function mapIdempotencyHelperError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "ACTIVATION_REQUEST_ID_OWNED_BY_ANOTHER_USER") {
    serviceError("IDEMPOTENCY_KEY_CONFLICT", 409, "Activation request ID is already in use");
  }
  if (message === "ACTIVATION_REQUEST_ID_REUSED_WITH_DIFFERENT_PAYLOAD") {
    serviceError(
      "IDEMPOTENCY_KEY_REUSE",
      409,
      "Activation request ID was already used with different activation details",
    );
  }
  throw error;
}

async function getActiveProtocol(now = new Date()) {
  const protocol = await prismaAny.miningProtocolConfig.findFirst({
    where: {
      status: "active",
      OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }],
    },
  });
  if (!protocol) {
    serviceError(
      "NO_ACTIVE_PROTOCOL",
      503,
      "Mining Power activation is not available because no active protocol version is configured",
    );
  }
  return protocol;
}

async function getPackageAndDuration(params: {
  protocolConfigId: string;
  packageCode: string;
  durationMonths: number;
}) {
  const [pkg, duration] = await Promise.all([
    prismaAny.miningPackage.findFirst({
      where: {
        protocolConfigId: params.protocolConfigId,
        code: params.packageCode,
        enabled: true,
      },
    }),
    prismaAny.miningDuration.findFirst({
      where: {
        protocolConfigId: params.protocolConfigId,
        months: params.durationMonths,
        enabled: true,
      },
    }),
  ]);

  if (!pkg) serviceError("PACKAGE_NOT_FOUND", 404, "Mining package is not available");
  if (!duration) serviceError("DURATION_NOT_FOUND", 404, "Mining duration is not available");
  return { pkg, duration };
}

function buildQuoteFromRows(protocol: any, pkg: any, duration: any) {
  const activationAmountUsdt = decimalString(pkg.activationAmountUsdt);
  const snapshot = buildActivationPowerSnapshot({
    activationAmountUsdt,
    baseMpPerUsdt: decimalString(protocol.baseMpPerUsdt),
    packageBoostRate: decimalString(pkg.packageBoostRate),
    durationMultiplier: decimalString(duration.multiplier),
  });

  if (!decimalEquals(snapshot.baseMp, pkg.baseMp)) {
    serviceError(
      "PACKAGE_CONFIG_INTEGRITY_ERROR",
      500,
      "Mining package Base MP does not match the active protocol rate",
    );
  }

  return {
    protocolConfigId: protocol.id,
    protocolVersion: protocol.version,
    termsVersion: protocol.termsVersion,
    packageId: pkg.id,
    packageCode: pkg.code,
    packageName: pkg.name,
    activationAmountUsdt,
    packageBoostRate: decimalString(pkg.packageBoostRate),
    durationId: duration.id,
    durationMonths: duration.months,
    ...snapshot,
    paymentAsset: MINING_POWER_PAYMENT_ASSET,
    paymentNetwork: "BSC (BEP-20)",
    paymentAddress: process.env.XNRT_WALLET || null,
    guaranteed: false,
  };
}

export async function getPublicMiningPowerConfig() {
  const now = new Date();
  const protocol = await prismaAny.miningProtocolConfig.findFirst({
    where: {
      status: "active",
      OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }],
    },
    select: {
      version: true,
      termsVersion: true,
      activationPaused: true,
      rewardTimezone: true,
      rewardBoundaryHourUtc: true,
      maxEffectiveMpMultiplier: true,
      maxEcosystemBoost: true,
      effectiveFrom: true,
    },
  });

  if (!protocol) {
    return {
      enabled: false,
      reason: "NO_ACTIVE_PROTOCOL",
      guaranteed: false,
    };
  }

  return {
    enabled: !protocol.activationPaused,
    activationPaused: protocol.activationPaused,
    protocolVersion: protocol.version,
    termsVersion: protocol.termsVersion,
    rewardTimezone: protocol.rewardTimezone,
    rewardBoundaryHourUtc: protocol.rewardBoundaryHourUtc,
    maxEffectiveMpMultiplier: decimalString(protocol.maxEffectiveMpMultiplier),
    maxEcosystemBoost: decimalString(protocol.maxEcosystemBoost),
    effectiveFrom: protocol.effectiveFrom,
    guaranteed: false,
  };
}

export async function listActiveMiningPackages() {
  const protocol = await getActiveProtocol();
  return prismaAny.miningPackage.findMany({
    where: { protocolConfigId: protocol.id, enabled: true },
    orderBy: [{ sortOrder: "asc" }, { activationAmountUsdt: "asc" }],
    select: {
      code: true,
      name: true,
      activationAmountUsdt: true,
      baseMp: true,
      packageBoostRate: true,
      sortOrder: true,
    },
  });
}

export async function listActiveMiningDurations() {
  const protocol = await getActiveProtocol();
  return prismaAny.miningDuration.findMany({
    where: { protocolConfigId: protocol.id, enabled: true },
    orderBy: { months: "asc" },
    select: { months: true, multiplier: true },
  });
}

export async function quoteMiningActivation(input: {
  packageCode: string;
  durationMonths: number;
}) {
  const protocol = await getActiveProtocol();
  if (protocol.activationPaused) {
    serviceError("ACTIVATION_PAUSED", 503, "Mining Power activations are currently paused");
  }
  const { pkg, duration } = await getPackageAndDuration({
    protocolConfigId: protocol.id,
    packageCode: input.packageCode,
    durationMonths: input.durationMonths,
  });
  return buildQuoteFromRows(protocol, pkg, duration);
}

async function serializeActivation(activation: any) {
  return {
    ...activation,
    paymentAmount: decimalString(activation.paymentAmount),
    eligibleValueUsdt: decimalString(activation.eligibleValueUsdt),
    activationAmountUsdtSnapshot: decimalString(activation.activationAmountUsdtSnapshot),
    baseMp: decimalString(activation.baseMp),
    packageMultiplierSnapshot: decimalString(activation.packageMultiplierSnapshot),
    durationMultiplierSnapshot: decimalString(activation.durationMultiplierSnapshot),
    staticWeightedMpSnapshot: decimalString(activation.staticWeightedMpSnapshot),
    genesisMultiplierSnapshot: decimalString(activation.genesisMultiplierSnapshot),
    paymentTransaction: activation.paymentTransaction
      ? {
          ...activation.paymentTransaction,
          amount: decimalString(activation.paymentTransaction.amount),
          usdtAmount: activation.paymentTransaction.usdtAmount
            ? decimalString(activation.paymentTransaction.usdtAmount)
            : null,
        }
      : undefined,
  };
}

export async function createMiningActivationRequest(input: {
  userId: string;
  activationRequestId: unknown;
  packageCode: string;
  durationMonths: number;
  transactionHash: unknown;
  proofImageUrl?: unknown;
}) {
  let activationRequestId: string;
  let transactionHash: string;
  let proofImageUrl: string | undefined;
  try {
    activationRequestId = normalizeActivationRequestId(input.activationRequestId);
    transactionHash = normalizeBscTransactionHash(input.transactionHash);
    proofImageUrl = normalizeOptionalProofImageUrl(input.proofImageUrl);
  } catch (error) {
    serviceError("INVALID_REQUEST", 400, error instanceof Error ? error.message : "Invalid activation request");
  }

  const packageCode = String(input.packageCode ?? "").trim().toLowerCase();
  const durationMonths = Number(input.durationMonths);
  if (!packageCode) serviceError("INVALID_PACKAGE", 400, "packageCode is required");
  if (!Number.isInteger(durationMonths) || durationMonths <= 0) {
    serviceError("INVALID_DURATION", 400, "durationMonths must be a positive integer");
  }

  const existing = await prismaAny.miningActivation.findUnique({
    where: { activationRequestId },
    include: { paymentTransaction: true },
  });
  if (existing) {
    try {
      assertSameIdempotentActivationRequest({
        existingUserId: existing.userId,
        requestingUserId: input.userId,
        existingPackageCode: existing.packageCodeSnapshot,
        requestedPackageCode: packageCode,
        existingDurationMonths: existing.durationMonthsSnapshot,
        requestedDurationMonths: durationMonths,
        existingTransactionHash: existing.paymentTransaction?.transactionHash,
        requestedTransactionHash: transactionHash,
      });
    } catch (error) {
      mapIdempotencyHelperError(error);
    }
    return { activation: await serializeActivation(existing), idempotentReplay: true };
  }

  const protocol = await getActiveProtocol();
  if (protocol.activationPaused) {
    serviceError("ACTIVATION_PAUSED", 503, "Mining Power activations are currently paused");
  }
  if (!process.env.XNRT_WALLET) {
    serviceError("PAYMENT_WALLET_NOT_CONFIGURED", 503, "Mining Power payment wallet is not configured");
  }

  const { pkg, duration } = await getPackageAndDuration({
    protocolConfigId: protocol.id,
    packageCode,
    durationMonths,
  });
  const quote = buildQuoteFromRows(protocol, pkg, duration);

  try {
    const created = await prismaAny.$transaction(async (tx: any) => {
      const existingInside = await tx.miningActivation.findUnique({
        where: { activationRequestId },
        include: { paymentTransaction: true },
      });
      if (existingInside) {
        try {
          assertSameIdempotentActivationRequest({
            existingUserId: existingInside.userId,
            requestingUserId: input.userId,
            existingPackageCode: existingInside.packageCodeSnapshot,
            requestedPackageCode: packageCode,
            existingDurationMonths: existingInside.durationMonthsSnapshot,
            requestedDurationMonths: durationMonths,
            existingTransactionHash: existingInside.paymentTransaction?.transactionHash,
            requestedTransactionHash: transactionHash,
          });
        } catch (error) {
          mapIdempotencyHelperError(error);
        }
        return existingInside;
      }

      const payment = await tx.transaction.create({
        data: {
          userId: input.userId,
          type: MINING_POWER_TRANSACTION_TYPE,
          amount: new DecimalCtor(0),
          usdtAmount: new DecimalCtor(quote.activationAmountUsdt),
          source: MINING_POWER_TRANSACTION_SOURCE,
          transactionHash,
          walletAddress: process.env.XNRT_WALLET!,
          proofImageUrl,
          status: "pending",
          verified: false,
          confirmations: 0,
        },
      });

      return tx.miningActivation.create({
        data: {
          userId: input.userId,
          protocolConfigId: protocol.id,
          packageId: pkg.id,
          durationId: duration.id,
          activationRequestId,
          paymentTransactionId: payment.id,
          packageCodeSnapshot: pkg.code,
          packageNameSnapshot: pkg.name,
          paymentAsset: MINING_POWER_PAYMENT_ASSET,
          paymentAmount: new DecimalCtor(quote.activationAmountUsdt),
          eligibleValueUsdt: new DecimalCtor(quote.activationAmountUsdt),
          activationAmountUsdtSnapshot: new DecimalCtor(quote.activationAmountUsdt),
          baseMp: new DecimalCtor(quote.baseMp),
          packageMultiplierSnapshot: new DecimalCtor(quote.packageMultiplier),
          durationMultiplierSnapshot: new DecimalCtor(quote.durationMultiplier),
          staticWeightedMpSnapshot: new DecimalCtor(quote.staticWeightedMp),
          durationMonthsSnapshot: duration.months,
          genesisEligible: false,
          genesisMultiplierSnapshot: new DecimalCtor(1),
          protocolVersion: protocol.version,
          termsVersion: protocol.termsVersion,
          status: "payment_pending",
        },
        include: { paymentTransaction: true },
      });
    });

    return { activation: await serializeActivation(created), idempotentReplay: false };
  } catch (error: any) {
    if (error instanceof MiningPowerServiceError) throw error;
    if (error?.code === "P2002") {
      const byRequest = await prismaAny.miningActivation.findUnique({
        where: { activationRequestId },
        include: { paymentTransaction: true },
      });
      if (byRequest) {
        try {
          assertSameIdempotentActivationRequest({
            existingUserId: byRequest.userId,
            requestingUserId: input.userId,
            existingPackageCode: byRequest.packageCodeSnapshot,
            requestedPackageCode: packageCode,
            existingDurationMonths: byRequest.durationMonthsSnapshot,
            requestedDurationMonths: durationMonths,
            existingTransactionHash: byRequest.paymentTransaction?.transactionHash,
            requestedTransactionHash: transactionHash,
          });
        } catch (helperError) {
          mapIdempotencyHelperError(helperError);
        }
        return { activation: await serializeActivation(byRequest), idempotentReplay: true };
      }
      serviceError(
        "PAYMENT_TRANSACTION_ALREADY_USED",
        409,
        "This transaction hash or payment transaction is already in use",
      );
    }
    throw error;
  }
}

export async function listUserMiningActivations(userId: string) {
  const rows = await prismaAny.miningActivation.findMany({
    where: { userId },
    include: { paymentTransaction: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return Promise.all(rows.map(serializeActivation));
}

export async function getUserMiningActivation(userId: string, activationId: string) {
  const row = await prismaAny.miningActivation.findFirst({
    where: { id: activationId, userId },
    include: { paymentTransaction: true },
  });
  if (!row) serviceError("ACTIVATION_NOT_FOUND", 404, "Mining activation not found");
  return serializeActivation(row);
}

export async function requestMiningActivationExit(userId: string, activationId: string) {
  const existing = await prismaAny.miningActivation.findFirst({
    where: { id: activationId, userId },
  });
  if (!existing) serviceError("ACTIVATION_NOT_FOUND", 404, "Mining activation not found");
  if (existing.status !== "active") {
    serviceError("ACTIVATION_NOT_ACTIVE", 409, "Only an active Mining Power activation can request early exit");
  }
  if (existing.exitRequestedAt && existing.exitedAt) {
    return { activation: await getUserMiningActivation(userId, activationId), idempotentReplay: true };
  }

  const exitRequestedAt = new Date();
  const exitedAt = firstRewardBoundaryStrictlyAfter(exitRequestedAt);

  const updated = await prismaAny.$transaction(async (tx: any) => {
    const claimed = await tx.miningActivation.updateMany({
      where: {
        id: activationId,
        userId,
        status: "active",
        exitRequestedAt: null,
      },
      data: { exitRequestedAt, exitedAt },
    });
    if (claimed.count !== 1) return null;

    await tx.activity.create({
      data: {
        userId,
        type: "mining_power_exit_requested",
        description: `Mining Power activation ${activationId} scheduled to exit at ${exitedAt.toISOString()}`,
      },
    });

    return tx.miningActivation.findUnique({
      where: { id: activationId },
      include: { paymentTransaction: true },
    });
  });

  if (!updated) {
    const replay = await prismaAny.miningActivation.findFirst({
      where: { id: activationId, userId },
      include: { paymentTransaction: true },
    });
    if (replay?.exitRequestedAt && replay?.exitedAt) {
      return { activation: await serializeActivation(replay), idempotentReplay: true };
    }
    serviceError("EXIT_REQUEST_CONFLICT", 409, "Activation state changed before the exit request could be recorded");
  }

  return { activation: await serializeActivation(updated), idempotentReplay: false };
}

export async function getPendingMiningActivationPayments() {
  const rows = await prismaAny.miningActivation.findMany({
    where: { status: "payment_pending" },
    include: {
      paymentTransaction: true,
      user: { select: { id: true, email: true, username: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  return Promise.all(rows.map(serializeActivation));
}

export async function getMiningActivationForAdmin(activationId: string) {
  const row = await prismaAny.miningActivation.findUnique({
    where: { id: activationId },
    include: {
      paymentTransaction: true,
      user: { select: { id: true, email: true, username: true } },
    },
  });
  if (!row) serviceError("ACTIVATION_NOT_FOUND", 404, "Mining activation not found");
  return row;
}

export async function recordMiningActivationPaymentVerification(params: {
  activationId: string;
  verified: boolean;
  confirmations: number;
  verificationData: Record<string, unknown>;
}) {
  const activation = await getMiningActivationForAdmin(params.activationId);
  const payment = activation.paymentTransaction;
  if (!payment) serviceError("PAYMENT_NOT_FOUND", 409, "Activation has no linked payment transaction");
  if (payment.type !== MINING_POWER_TRANSACTION_TYPE || payment.source !== MINING_POWER_TRANSACTION_SOURCE) {
    serviceError("PAYMENT_INTEGRITY_ERROR", 500, "Linked transaction is not a Mining Power payment");
  }
  if (payment.status !== "pending") {
    serviceError("PAYMENT_ALREADY_PROCESSED", 409, "Mining Power payment is already processed");
  }

  await prismaAny.transaction.update({
    where: { id: payment.id },
    data: {
      verified: params.verified,
      confirmations: Math.max(0, Math.floor(params.confirmations || 0)),
      verificationData: params.verificationData,
    },
  });

  return getMiningActivationForAdmin(params.activationId);
}

export async function approveMiningActivationPayment(params: {
  activationId: string;
  adminUserId: string;
  notes?: string;
  force?: boolean;
}) {
  const current = await getMiningActivationForAdmin(params.activationId);
  const currentPayment = current.paymentTransaction;
  if (!currentPayment) serviceError("PAYMENT_NOT_FOUND", 409, "Activation has no linked payment transaction");

  if (current.status === "active" && currentPayment.status === "approved") {
    const existingEvent = await prismaAny.outboxEvent.findUnique({
      where: { dedupeKey: `mining-activation-qualified:${current.id}` },
    });
    if (!existingEvent) {
      serviceError(
        "OUTBOX_INTEGRITY_ERROR",
        500,
        "Active activation is missing its qualification outbox event",
      );
    }
    return { activation: await serializeActivation(current), idempotentReplay: true };
  }

  if (current.status !== "payment_pending" || currentPayment.status !== "pending") {
    serviceError("PAYMENT_ALREADY_PROCESSED", 409, "Mining Power payment is already processed");
  }
  if (!currentPayment.verified && !params.force) {
    serviceError(
      "PAYMENT_NOT_VERIFIED",
      400,
      "Mining Power payment is not verified. Use force=true only after manual review.",
    );
  }
  if (
    currentPayment.type !== MINING_POWER_TRANSACTION_TYPE ||
    currentPayment.source !== MINING_POWER_TRANSACTION_SOURCE ||
    currentPayment.userId !== current.userId ||
    !currentPayment.transactionHash ||
    !currentPayment.usdtAmount ||
    !decimalEquals(currentPayment.usdtAmount, current.paymentAmount)
  ) {
    serviceError("PAYMENT_INTEGRITY_ERROR", 500, "Mining Power payment linkage failed integrity checks");
  }

  const paymentConfirmedAt = new Date();
  const rewardEligibleFrom = firstRewardBoundaryStrictlyAfter(paymentConfirmedAt);
  const expiresAt = calculateExpirationBoundary(
    rewardEligibleFrom,
    current.durationMonthsSnapshot,
  );
  const dedupeKey = `mining-activation-qualified:${current.id}`;

  try {
    const result = await prismaAny.$transaction(async (tx: any) => {
      const paymentClaim = await tx.transaction.updateMany({
        where: {
          id: currentPayment.id,
          userId: current.userId,
          type: MINING_POWER_TRANSACTION_TYPE,
          source: MINING_POWER_TRANSACTION_SOURCE,
          status: "pending",
        },
        data: {
          status: "approved",
          adminNotes: params.notes ?? currentPayment.adminNotes,
          approvedBy: params.adminUserId,
          approvedAt: paymentConfirmedAt,
        },
      });
      if (paymentClaim.count !== 1) throw new Error("PAYMENT_ALREADY_PROCESSED");

      const activationClaim = await tx.miningActivation.updateMany({
        where: { id: current.id, status: "payment_pending" },
        data: {
          status: "active",
          paymentConfirmedAt,
          activatedAt: paymentConfirmedAt,
          rewardEligibleFrom,
          expiresAt,
        },
      });
      if (activationClaim.count !== 1) throw new Error("ACTIVATION_ALREADY_PROCESSED");

      await tx.outboxEvent.create({
        data: {
          type: "MiningActivationQualified",
          aggregateType: "MiningActivation",
          aggregateId: current.id,
          dedupeKey,
          payload: {
            activationId: current.id,
            userId: current.userId,
            paymentTransactionId: currentPayment.id,
            eligibleValueUsdt: decimalString(current.eligibleValueUsdt),
            protocolVersion: current.protocolVersion,
            paymentConfirmedAt: paymentConfirmedAt.toISOString(),
          },
          status: "pending",
        },
      });

      await tx.activity.create({
        data: {
          userId: current.userId,
          type: "mining_power_activated",
          description: `Mining Power ${current.packageNameSnapshot} activation approved; rewards become eligible ${rewardEligibleFrom.toISOString()}`,
        },
      });

      if (!currentPayment.verified && params.force) {
        await tx.activity.create({
          data: {
            userId: params.adminUserId,
            type: "ADMIN_MINING_PAYMENT_OVERRIDE",
            description: `Force-approved unverified Mining Power payment ${currentPayment.id} for activation ${current.id}`,
          },
        });
      }

      return tx.miningActivation.findUnique({
        where: { id: current.id },
        include: { paymentTransaction: true },
      });
    });

    return { activation: await serializeActivation(result), idempotentReplay: false };
  } catch (error: any) {
    if (error?.message === "PAYMENT_ALREADY_PROCESSED" || error?.message === "ACTIVATION_ALREADY_PROCESSED" || error?.code === "P2002") {
      const replay = await prismaAny.miningActivation.findUnique({
        where: { id: current.id },
        include: { paymentTransaction: true },
      });
      const event = await prismaAny.outboxEvent.findUnique({ where: { dedupeKey } });
      if (replay?.status === "active" && replay.paymentTransaction?.status === "approved" && event) {
        return { activation: await serializeActivation(replay), idempotentReplay: true };
      }
      serviceError("PAYMENT_APPROVAL_CONFLICT", 409, "Mining Power payment was processed concurrently");
    }
    throw error;
  }
}

export async function rejectMiningActivationPayment(params: {
  activationId: string;
  adminUserId: string;
  notes?: string;
}) {
  const current = await getMiningActivationForAdmin(params.activationId);
  const payment = current.paymentTransaction;
  if (!payment) serviceError("PAYMENT_NOT_FOUND", 409, "Activation has no linked payment transaction");

  if (current.status === "failed" && payment.status === "rejected") {
    return { activation: await serializeActivation(current), idempotentReplay: true };
  }
  if (current.status !== "payment_pending" || payment.status !== "pending") {
    serviceError("PAYMENT_ALREADY_PROCESSED", 409, "Mining Power payment is already processed");
  }

  try {
    const result = await prismaAny.$transaction(async (tx: any) => {
      const paymentClaim = await tx.transaction.updateMany({
        where: {
          id: payment.id,
          type: MINING_POWER_TRANSACTION_TYPE,
          source: MINING_POWER_TRANSACTION_SOURCE,
          status: "pending",
        },
        data: {
          status: "rejected",
          adminNotes: params.notes ?? payment.adminNotes,
          approvedBy: params.adminUserId,
          approvedAt: new Date(),
        },
      });
      if (paymentClaim.count !== 1) throw new Error("PAYMENT_ALREADY_PROCESSED");

      const activationClaim = await tx.miningActivation.updateMany({
        where: { id: current.id, status: "payment_pending" },
        data: { status: "failed" },
      });
      if (activationClaim.count !== 1) throw new Error("ACTIVATION_ALREADY_PROCESSED");

      await tx.activity.create({
        data: {
          userId: current.userId,
          type: "mining_power_payment_rejected",
          description: `Mining Power payment rejected for activation ${current.id}${params.notes ? ` - ${params.notes}` : ""}`,
        },
      });

      return tx.miningActivation.findUnique({
        where: { id: current.id },
        include: { paymentTransaction: true },
      });
    });

    return { activation: await serializeActivation(result), idempotentReplay: false };
  } catch (error: any) {
    if (error?.message === "PAYMENT_ALREADY_PROCESSED" || error?.message === "ACTIVATION_ALREADY_PROCESSED") {
      const replay = await prismaAny.miningActivation.findUnique({
        where: { id: current.id },
        include: { paymentTransaction: true },
      });
      if (replay?.status === "failed" && replay.paymentTransaction?.status === "rejected") {
        return { activation: await serializeActivation(replay), idempotentReplay: true };
      }
      serviceError("PAYMENT_REJECTION_CONFLICT", 409, "Mining Power payment was processed concurrently");
    }
    throw error;
  }
}

export function toMiningPowerHttpError(error: unknown) {
  if (error instanceof MiningPowerServiceError) {
    return { status: error.httpStatus, body: { message: error.message, code: error.code } };
  }
  console.error("Mining Power R2 unexpected error:", error);
  return {
    status: 500,
    body: { message: "Mining Power request failed", code: "MINING_POWER_INTERNAL_ERROR" },
  };
}
