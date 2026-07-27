import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createUuidInFilter } from "./sql-uuid-in-filter";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

describe("createUuidInFilter", () => {
  it("returns undefined for zero ids", () => {
    assert.equal(createUuidInFilter({ column: "e.id", parameterPrefix: "employeeId", values: [] }), undefined);
  });

  it("uses equality for a single id", () => {
    const filter = createUuidInFilter({
      column: "e.id",
      parameterPrefix: "employeeId",
      values: [ID_A],
    });
    assert.ok(filter);
    assert.equal(filter.clause, "e.id = @employeeId");
  });

  it("uses IN for multiple ids", () => {
    const filter = createUuidInFilter({
      column: "e.id",
      parameterPrefix: "employeeId",
      values: [ID_A, ID_B],
    });
    assert.ok(filter);
    assert.equal(filter.clause, "e.id IN (@employeeId0, @employeeId1)");
  });
});
