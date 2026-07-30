import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAbsenceBalanceIdempotencyKey } from "./absence-balance-ledger";

describe("buildAbsenceBalanceIdempotencyKey", () => {
  it("builds deterministic reserve/consume/release keys", () => {
    assert.equal(
      buildAbsenceBalanceIdempotencyKey.reserve("req-1", 2026),
      "absence:req-1:reserve:2026:v1",
    );
    assert.equal(
      buildAbsenceBalanceIdempotencyKey.consume("req-1", 2026),
      "absence:req-1:consume:2026:v1",
    );
    assert.equal(
      buildAbsenceBalanceIdempotencyKey.release("req-1", 2026),
      "absence:req-1:release:2026:v1",
    );
    assert.equal(
      buildAbsenceBalanceIdempotencyKey.reversal("mov-9"),
      "absence:movement:mov-9:reversal:v1",
    );
  });
});
