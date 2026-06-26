import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { statisticsFiltersSchema, statisticsTableQuerySchema } from "../schemas/statistics.schema";

describe("statisticsFiltersSchema", () => {
  it("parses empty filters", () => {
    const result = statisticsFiltersSchema.parse({});
    assert.equal(result.export, false);
  });

  it("parses export flag", () => {
    const result = statisticsFiltersSchema.parse({ export: "true" });
    assert.equal(result.export, true);
  });

  it("accepts validation status including NO_CHECK_IN", () => {
    const result = statisticsFiltersSchema.parse({ validationStatus: "NO_CHECK_IN" });
    assert.equal(result.validationStatus, "NO_CHECK_IN");
  });
});

describe("statisticsTableQuerySchema", () => {
  it("defaults pagination and sort direction", () => {
    const result = statisticsTableQuerySchema.parse({});
    assert.equal(result.page, 1);
    assert.equal(result.limit, 20);
    assert.equal(result.sortDirection, "desc");
  });

  it("coerces page and limit", () => {
    const result = statisticsTableQuerySchema.parse({ page: "2", limit: "50" });
    assert.equal(result.page, 2);
    assert.equal(result.limit, 50);
  });
});
