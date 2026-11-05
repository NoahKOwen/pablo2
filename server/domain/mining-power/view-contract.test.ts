import assert from "node:assert/strict";
import { r5PageSize, r5PageCursor, r5CursorFilter, r5Decimal, r5NextBoundary } from "./view-contract.ts";
assert.equal(r5PageSize(undefined), 20);
assert.equal(r5PageSize("50"), 50);
for (const invalid of ["0", "51", "-1", "1.5", "1e2", " 1", "", ["1"]]) {
  assert.throws(() => r5PageSize(invalid));
}
for (const invalid of ["../", "a%2Fb", "", "a".repeat(101), ["abc"]]) {
  assert.throws(() => r5PageCursor(invalid));
}
assert.equal(r5PageCursor("a-42"), "a-42");
const anchor = {id:"id-b",createdAt:new Date("2026-11-05T00:00:00.000Z")};
const filter = r5CursorFilter(anchor, "owner-A");
assert.equal(filter.userId, "owner-A");
assert.deepEqual(filter.OR, [
  {createdAt:{lt:anchor.createdAt}},
  {createdAt:anchor.createdAt,id:{lt:"id-b"}},
]);
assert.deepEqual(r5CursorFilter(null,"owner-A"),{userId:"owner-A"});
assert.equal(r5Decimal({toString(){return "1e-9"},toFixed(){return "0.000000001"}}),"0.000000001");
assert.equal(r5NextBoundary(new Date("2026-12-31T23:59:59Z")),"2027-01-01T00:00:00.000Z");
console.log("R5 read-model validation tests passed");
