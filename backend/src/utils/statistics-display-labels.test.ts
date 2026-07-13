import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeStatisticsFilters } from "./statistics-display-labels";

describe("statistics-display-labels", () => {
  it("maps deprecated NO_CHECK_IN filter to ABSENT effective state", () => {
    const normalized = normalizeStatisticsFilters({ validationStatus: "NO_CHECK_IN" });
    assert.equal(normalized.effectiveState, "ABSENT");
    assert.equal(normalized.validationStatus, undefined);
  });

  it("keeps explicit effectiveState when NO_CHECK_IN is also present", () => {
    const normalized = normalizeStatisticsFilters({
      validationStatus: "NO_CHECK_IN",
      effectiveState: "JUSTIFIED",
    });
    assert.equal(normalized.effectiveState, "JUSTIFIED");
    assert.equal(normalized.validationStatus, undefined);
  });
});
