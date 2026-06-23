import { describe, expect, it } from "vitest";
import { statisticsFiltersSchema, statisticsTableQuerySchema } from "../schemas/statistics.schema";

describe("statisticsFiltersSchema", () => {
  it("parses empty filters", () => {
    const result = statisticsFiltersSchema.parse({});
    expect(result.export).toBe(false);
  });

  it("parses export flag", () => {
    const result = statisticsFiltersSchema.parse({ export: "true" });
    expect(result.export).toBe(true);
  });

  it("accepts validation status including NO_CHECK_IN", () => {
    const result = statisticsFiltersSchema.parse({ validationStatus: "NO_CHECK_IN" });
    expect(result.validationStatus).toBe("NO_CHECK_IN");
  });
});

describe("statisticsTableQuerySchema", () => {
  it("defaults pagination and sort direction", () => {
    const result = statisticsTableQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.sortDirection).toBe("desc");
  });

  it("coerces page and limit", () => {
    const result = statisticsTableQuerySchema.parse({ page: "2", limit: "50" });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(50);
  });
});  
