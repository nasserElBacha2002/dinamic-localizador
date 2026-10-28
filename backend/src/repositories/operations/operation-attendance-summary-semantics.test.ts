import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOperationalEmployeesBaseQuery } from "./operation-attendance.repository";

describe("operation attendance summary query semantics", () => {
  it("uses separate global and filtered queries: global has no search, filtered may include search", () => {
    const globalQuery = buildOperationalEmployeesBaseQuery(false);
    const filteredQuery = buildOperationalEmployeesBaseQuery(true);

    assert.doesNotMatch(globalQuery, /LIKE @search/);
    assert.match(filteredQuery, /LIKE @search/);
    assert.match(globalQuery, /oa\.cancelled_at IS NULL/);
    assert.match(filteredQuery, /oa\.cancelled_at IS NULL/);
  });
});
