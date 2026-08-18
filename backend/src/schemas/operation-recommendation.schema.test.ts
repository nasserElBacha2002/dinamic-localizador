import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listEmployeeRecommendationsQuerySchema } from "./operation-recommendation.schema";

describe("listEmployeeRecommendationsQuerySchema", () => {
  it("accepts optional effectiveDate", () => {
    const parsed = listEmployeeRecommendationsQuerySchema.parse({
      limit: "5",
      effectiveDate: "2026-09-01",
    });
    assert.equal(parsed.limit, 5);
    assert.equal(parsed.effectiveDate, "2026-09-01");
  });

  it("rejects invalid effectiveDate", () => {
    assert.throws(() =>
      listEmployeeRecommendationsQuerySchema.parse({ effectiveDate: "01-09-2026" }),
    );
    assert.throws(() =>
      listEmployeeRecommendationsQuerySchema.parse({ effectiveDate: "2026-02-30" }),
    );
  });
});
