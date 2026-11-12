import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isChargeAssignmentOperationallyEffective } from "./charge-assignment-effectiveness";

describe("charge assignment operational effectiveness", () => {
  it("treats cancelled rows as ineffective", () => {
    assert.equal(
      isChargeAssignmentOperationallyEffective(
        { validFrom: "2026-01-01", validUntil: null, cancelledAt: "2026-01-02T00:00:00.000Z" },
        "2026-06-01",
      ),
      false,
    );
  });

  it("distinguishes ended vs current vs future", () => {
    assert.equal(
      isChargeAssignmentOperationallyEffective(
        { validFrom: "2026-01-01", validUntil: "2026-05-01", cancelledAt: null },
        "2026-06-01",
      ),
      false,
    );
    assert.equal(
      isChargeAssignmentOperationallyEffective(
        { validFrom: "2026-06-01", validUntil: null, cancelledAt: null },
        "2026-06-15",
      ),
      true,
    );
    assert.equal(
      isChargeAssignmentOperationallyEffective(
        { validFrom: "2026-12-01", validUntil: null, cancelledAt: null },
        "2026-06-15",
      ),
      true,
    );
  });
});
