import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { operationRecommendationKeys } from "./useOperationRecommendations";

describe("operationRecommendationKeys", () => {
  it("includes effectiveDate so recurring Desde changes invalidate cache", () => {
    const today = operationRecommendationKeys.employees("c1", "op1", 10, "2026-08-14");
    const future = operationRecommendationKeys.employees("c1", "op1", 10, "2026-09-15");
    assert.notDeepEqual(today, future);
    assert.equal(today[today.length - 1], "2026-08-14");
    assert.equal(future[future.length - 1], "2026-09-15");
  });
});
