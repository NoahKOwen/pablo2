import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "../server/db/client";
import {
  approveMiningActivationPayment,
  createMiningActivationRequest,
  MiningPowerServiceError,
  requestMiningActivationExit,
} from "../server/services/miningPowerActivation.ts";

const prismaAny = prisma as any;
const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const email = `mining-r2-${suffix}@example.invalid`;
const username = `mining-r2-${suffix}`;
const referralCode = `R2${randomBytes(6).toString("hex")}`;
const activationRequestId = `mining-r2-${randomBytes(16).toString("hex")}`;
const txHash = `0x${randomBytes(32).toString("hex")}`;

let userId: string | null = null;
let activationId: string | null = null;
let paymentTransactionId: string | null = null;
let temporarilyActivatedProtocolId: string | null = null;
let originalEffectiveFrom: Date | null = null;

async function cleanup() {
  if (activationId) {
    await prismaAny.outboxEvent.deleteMany({
      where: { aggregateType: "MiningActivation", aggregateId: activationId },
    });
  }
  if (userId) {
    const activations = await prismaAny.miningActivation.findMany({
      where: { userId },
      select: { id: true, paymentTransactionId: true },
    });
    const activationIds = activations.map((a: any) => a.id);
    const paymentIds = activations
      .map((a: any) => a.paymentTransactionId)
      .filter(Boolean);

    if (activationIds.length) {
      await prismaAny.outboxEvent.deleteMany({
        where: { aggregateType: "MiningActivation", aggregateId: { in: activationIds } },
      });
    }
    await prismaAny.activity.deleteMany({ where: { userId } });
    await prismaAny.miningActivation.deleteMany({ where: { userId } });
    if (paymentIds.length) {
      await prismaAny.transaction.deleteMany({ where: { id: { in: paymentIds } } });
    }
    await prismaAny.transaction.deleteMany({
      where: { userId, type: "mining_activation", source: "mining_power" },
    });
    await prismaAny.user.deleteMany({ where: { id: userId } });
  }
  if (temporarilyActivatedProtocolId) {
    await prismaAny.miningProtocolConfig.update({
      where: { id: temporarilyActivatedProtocolId },
      data: { status: "draft", effectiveFrom: originalEffectiveFrom },
    });
  }
}

async function main() {
  if (!process.env.XNRT_WALLET) {
    throw new Error("XNRT_WALLET must be configured for the R2 integration test");
  }

  let protocol = await prismaAny.miningProtocolConfig.findFirst({
    where: { status: "active" },
  });

  if (!protocol) {
    protocol = await prismaAny.miningProtocolConfig.findUnique({
      where: { version: "mining-power-v1-draft" },
    });
    if (!protocol) throw new Error("R1 draft MiningProtocolConfig not found");
    temporarilyActivatedProtocolId = protocol.id;
    originalEffectiveFrom = protocol.effectiveFrom;
    protocol = await prismaAny.miningProtocolConfig.update({
      where: { id: protocol.id },
      data: { status: "active", effectiveFrom: null },
    });
  }

  assert.equal(protocol.activationPaused, false);

  const user = await prismaAny.user.create({
    data: {
      email,
      username,
      passwordHash: "integration-test-only",
      referralCode,
      emailVerified: true,
    },
  });
  userId = user.id;

  const createInput = {
    userId,
    activationRequestId,
    packageCode: "starter",
    durationMonths: 1,
    transactionHash: txHash,
  };

  const [createdA, createdB] = await Promise.all([
    createMiningActivationRequest(createInput),
    createMiningActivationRequest(createInput),
  ]);

  assert.equal(createdA.activation.id, createdB.activation.id);
  activationId = createdA.activation.id;
  paymentTransactionId = createdA.activation.paymentTransactionId;
  assert.ok(paymentTransactionId);

  const pendingCount = await prismaAny.miningActivation.count({
    where: { activationRequestId },
  });
  assert.equal(pendingCount, 1);

  let txReuseBlocked = false;
  try {
    await createMiningActivationRequest({
      ...createInput,
      activationRequestId: `mining-r2-${randomBytes(16).toString("hex")}`,
    });
  } catch (error) {
    txReuseBlocked =
      error instanceof MiningPowerServiceError &&
      error.code === "PAYMENT_TRANSACTION_ALREADY_USED";
  }
  assert.equal(txReuseBlocked, true, "same transaction hash must not fund two activations");

  const [approvedA, approvedB] = await Promise.all([
    approveMiningActivationPayment({
      activationId,
      adminUserId: userId,
      force: true,
      notes: "R2 integration test",
    }),
    approveMiningActivationPayment({
      activationId,
      adminUserId: userId,
      force: true,
      notes: "R2 integration test duplicate",
    }),
  ]);

  assert.equal(approvedA.activation.id, approvedB.activation.id);
  assert.equal(approvedA.activation.status, "active");
  assert.ok(approvedA.activation.rewardEligibleFrom);
  assert.ok(approvedA.activation.expiresAt);

  const outboxCount = await prismaAny.outboxEvent.count({
    where: { dedupeKey: `mining-activation-qualified:${activationId}` },
  });
  assert.equal(outboxCount, 1);

  const payment = await prismaAny.transaction.findUnique({
    where: { id: paymentTransactionId },
  });
  assert.equal(payment.status, "approved");
  assert.equal(payment.type, "mining_activation");
  assert.equal(payment.source, "mining_power");

  const [exitA, exitB] = await Promise.all([
    requestMiningActivationExit(userId, activationId),
    requestMiningActivationExit(userId, activationId),
  ]);
  assert.equal(exitA.activation.id, exitB.activation.id);
  assert.ok(exitA.activation.exitRequestedAt);
  assert.ok(exitA.activation.exitedAt);
  assert.equal(new Date(exitA.activation.exitedAt).getUTCHours(), 0);
  assert.equal(new Date(exitA.activation.exitedAt).getUTCMinutes(), 0);

  console.log("Mining Power R2 DB integration/concurrency test passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
    } finally {
      await prismaAny.$disconnect();
    }
  });
