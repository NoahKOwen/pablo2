import assert from "node:assert/strict";
import {
  assertDayClosed,
  assertGenesisAtMonthStart,
  dailyEmissionCeiling,
  effectiveMpForDay,
  emissionSchedule,
  isEmptyEmissionDay,
  parseUtcDate,
  requirePoolCap,
  reserveDailyEmissionAmount,
} from "./emission.ts";
import { parseFixed18 } from "./calculations.ts";

const genesis = parseUtcDate("2027-01-01");
assertGenesisAtMonthStart(genesis);
assert.throws(() => assertGenesisAtMonthStart(parseUtcDate("2027-01-02")));
assert.throws(() => parseUtcDate("2027-02-30"));
const schedule = emissionSchedule(genesis);
assert.equal(schedule.epochs.length, 4);
assert.deepEqual(schedule.epochs.map(e => e.epochNumber), [1,2,3,4]);
assert.equal(schedule.epochs[0].endsAt.toISOString(), "2028-07-01T00:00:00.000Z");
assert.equal(schedule.epochs[1].endsAt.toISOString(), "2030-07-01T00:00:00.000Z");
assert.equal(schedule.epochs[2].endsAt.toISOString(), "2032-07-01T00:00:00.000Z");
assert.equal(schedule.endsAt.toISOString(), "2034-01-01T00:00:00.000Z");
assert.equal(schedule.epochs.reduce((t,e)=>t+e.days,0n), 2557n); // includes 2028, 2032 leap years
const first = dailyEmissionCeiling({genesisAt:genesis,rewardDayStart:genesis,rewardPoolTokens:"150000000"});
assert.equal(first.epochNumber,1);
assert.equal(dailyEmissionCeiling({genesisAt:genesis,rewardDayStart:parseUtcDate("2028-07-01"),rewardPoolTokens:"150000000"}).epochNumber,2);
assert.equal(dailyEmissionCeiling({genesisAt:genesis,rewardDayStart:parseUtcDate("2030-07-01"),rewardPoolTokens:"150000000"}).epochNumber,3);
assert.equal(dailyEmissionCeiling({genesisAt:genesis,rewardDayStart:parseUtcDate("2032-07-01"),rewardPoolTokens:"150000000"}).epochNumber,4);
assert.throws(()=>dailyEmissionCeiling({genesisAt:genesis,rewardDayStart:parseUtcDate("2034-01-01"),rewardPoolTokens:"150000000"}));
assert.throws(()=>dailyEmissionCeiling({genesisAt:genesis,rewardDayStart:parseUtcDate("2026-12-31"),rewardPoolTokens:"150000000"}));
assert.throws(()=>requirePoolCap("150000000.000000000000000001"));
assert.equal(requirePoolCap("150000000"),parseFixed18("150000000"));
let total = 0n;
for (let offset = 0; offset < 2557; offset++) {
  const day = new Date(genesis.getTime() + offset*86_400_000);
  const amount = dailyEmissionCeiling({genesisAt:genesis,rewardDayStart:day,rewardPoolTokens:"150000000"});
  total += parseFixed18(amount.ceiling);
}
assert.ok(total <= parseFixed18("150000000"), "calendar allocation must never exceed pool cap");
const half = reserveDailyEmissionAmount({theoreticalCeiling:"100",networkBaseMp:"50",fullEmissionBaseMpThreshold:"100"});
assert.deepEqual(half, {utilization:"0.5",reserved:"50"});
assert.deepEqual(reserveDailyEmissionAmount({theoreticalCeiling:"100",networkBaseMp:"1000000",fullEmissionBaseMpThreshold:"100"}),{utilization:"1",reserved:"100"});
assert.deepEqual(reserveDailyEmissionAmount({theoreticalCeiling:"100",networkBaseMp:"0",fullEmissionBaseMpThreshold:"100"}),{utilization:"0",reserved:"0"});
assert.throws(()=>reserveDailyEmissionAmount({theoreticalCeiling:"100",networkBaseMp:"1",fullEmissionBaseMpThreshold:"0"}));
assertDayClosed(parseUtcDate("2027-01-01"),parseUtcDate("2027-01-02"));
assert.throws(()=>assertDayClosed(parseUtcDate("2027-01-01"),new Date("2027-01-01T23:59:59Z")));
assert.equal(isEmptyEmissionDay("5","0"),true);
assert.throws(()=>isEmptyEmissionDay("0","1"));
const a={ id:"test", userId:"u", status:"active", rewardEligibleFrom:parseUtcDate("2027-01-01"),expiresAt:parseUtcDate("2027-02-01"),exitedAt:null,baseMp:"100",staticWeightedMpSnapshot:"200",genesisEligible:true,genesisMultiplierSnapshot:"1.2",genesisBoostStartsAt:parseUtcDate("2027-01-01"),genesisBoostEndsAt:parseUtcDate("2027-02-01") };
assert.deepEqual(effectiveMpForDay(a,genesis,"2.5"),{baseMp:"100",effectiveMp:"240",genesisMultiplier:"1.2"});
assert.throws(()=>effectiveMpForDay({...a,status:"exited"},genesis,"2.5"));
assert.deepEqual(effectiveMpForDay({...a,staticWeightedMpSnapshot:"240"},genesis,"2.5"),{baseMp:"100",effectiveMp:"250",genesisMultiplier:"1.2"});
console.log("Mining Power R3 pure epoch/emission calculation tests passed.");
