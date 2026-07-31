import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAbsenceBalanceIdempotencyKey } from "./absence-balance-ledger";

describe("buildAbsenceBalanceIdempotencyKey", () => {
  it("builds deterministic reserve/consume/release keys with reservation version", () => {
    assert.equal(
      buildAbsenceBalanceIdempotencyKey.reserve("req-1", 1, "type-a", 2026),
      "absence:req-1:reservation:1:type-a:2026:reserve",
    );
    assert.equal(
      buildAbsenceBalanceIdempotencyKey.consume("req-1", 1, "type-a", 2026),
      "absence:req-1:reservation:1:type-a:2026:consume",
    );
    assert.equal(
      buildAbsenceBalanceIdempotencyKey.release("req-1", 2, "type-b", 2027),
      "absence:req-1:reservation:2:type-b:2027:release",
    );
    assert.equal(
      buildAbsenceBalanceIdempotencyKey.reversal("mov-9"),
      "absence:movement:mov-9:reversal:v1",
    );
  });

  it("is stable for the same logical command", () => {
    const a = buildAbsenceBalanceIdempotencyKey.reserve("req-1", 3, "t1", 2026);
    const b = buildAbsenceBalanceIdempotencyKey.reserve("req-1", 3, "t1", 2026);
    assert.equal(a, b);
  });
});
