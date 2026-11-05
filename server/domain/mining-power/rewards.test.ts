import assert from "node:assert/strict";
import { allocateFrozenDailyRewards, quantizeRewardDown, R4_LEDGER_DECIMALS } from "./rewards.ts";
import { parseFixed18 } from "./calculations.ts";
const s = (id: string, power: string) => ({ id: `s-${id}`, activationId: id, userId: `user-${id}`, effectiveMp: power });
assert.equal(R4_LEDGER_DECIMALS, 9);
assert.deepEqual(quantizeRewardDown("1.123456789987654321"), {
  amount: "1.123456789", dust: "0.000000000987654321", units: 1123456789n, quantum: 1000000000n,
});
assert.deepEqual(quantizeRewardDown("0.000000000999999999"), {
  amount: "0", dust: "0.000000000999999999", units: 0n, quantum: 1000000000n,
});
assert.throws(() => quantizeRewardDown("150000000.000000000000000001"));
assert.throws(() => quantizeRewardDown("1", 18));
const input = {
  reservedEmission: "0.000000001", networkEffectiveMp: "3", qualifiedActivationCount: 3,
  snapshots: [s("z", "1"), s("a", "1"), s("m", "1")],
};
const result = allocateFrozenDailyRewards(input);
assert.deepEqual(result.allocations.map(a => [a.activationId, a.rewardAmount, a.status]), [
  ["a", "0.000000001", "pending"], ["m", "0", "skipped"], ["z", "0", "skipped"],
]);
assert.deepEqual(allocateFrozenDailyRewards({ ...input, snapshots: [...input.snapshots].reverse() }), result);
const remainder = allocateFrozenDailyRewards({
  ...input, reservedEmission: "1.000000000000000123", networkEffectiveMp: "3",
});
assert.equal(remainder.allocatedEmission, "1");
assert.equal(remainder.dust, "0.000000000000000123");
assert.deepEqual(remainder.allocations.map(a => a.rewardAmount), ["0.333333334", "0.333333333", "0.333333333"]);
assert.equal(remainder.allocations.reduce((p,a)=>p+parseFixed18(a.rewardAmount),0n), parseFixed18("1"));
const weight = allocateFrozenDailyRewards({ reservedEmission: "7", networkEffectiveMp: "4", qualifiedActivationCount: 2,
  snapshots: [s("y", "3"), s("x", "1")],
});
assert.deepEqual(weight.allocations.map(a=>a.rewardAmount),["1.75","5.25"]);
assert.deepEqual(allocateFrozenDailyRewards({reservedEmission:"0", networkEffectiveMp:"0",qualifiedActivationCount:0,snapshots:[]}),{
  allocations: [], allocatedEmission: "0", dust:"0",positiveCount:0,
});
assert.throws(()=>allocateFrozenDailyRewards({...input, networkEffectiveMp:"2"}),/MISMATCH/);
assert.throws(()=>allocateFrozenDailyRewards({...input, snapshots:[s("a","1"),s("a","1"),s("z","1")]}),/DUPLICATE/);
assert.throws(()=>allocateFrozenDailyRewards({...input, qualifiedActivationCount:4}),/COUNT/);
assert.throws(()=>allocateFrozenDailyRewards({...input, snapshots:[s("a","0"),s("b","1"),s("c","2")]}),/NONPOSITIVE/);
const tiny = allocateFrozenDailyRewards({
  reservedEmission: "0.000000000999999999",networkEffectiveMp:"1",qualifiedActivationCount:1,
  snapshots:[s("tiny","1")],
});
assert.equal(tiny.allocatedEmission,"0");
assert.equal(tiny.allocations[0].status,"skipped");
assert.equal(tiny.dust,"0.000000000999999999");
const thousands = Array.from({length:1001},(_,i)=>s(`a-${i.toString().padStart(5,"0")}`,`${i+1}`));
const totalMp = (1001*1002/2).toString(); // integer-only fixture creation, not token math
const large = allocateFrozenDailyRewards({
  reservedEmission:"12345.678901234567890123",networkEffectiveMp:totalMp,
  qualifiedActivationCount:thousands.length,snapshots:thousands,
});
assert.equal(large.allocatedEmission,"12345.678901234");
assert.equal(large.allocations.length,1001);
assert.equal(large.allocations.reduce((sum,a)=>sum+parseFixed18(a.rewardAmount),0n),parseFixed18(large.allocatedEmission));
assert.deepEqual(allocateFrozenDailyRewards({
  reservedEmission:"12345.678901234567890123",networkEffectiveMp:totalMp,
  qualifiedActivationCount:thousands.length,snapshots:[...thousands].reverse(),
}),large);
console.log("Mining Power R4 pure deterministic allocation tests passed.");
