import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildEmployeesBaseQuery } from "./operation-attendance.repository";

describe("operation attendance summary search query", () => {
  it("omits the search predicate when no search term is provided", () => {
    const query = buildEmployeesBaseQuery(false);
    assert.doesNotMatch(query, /LIKE @search/);
  });

  it("searches by name, phone and document using a bound parameter", () => {
    const query = buildEmployeesBaseQuery(true);
    assert.match(query, /e\.name LIKE @search/);
    assert.match(query, /e\.phone_number LIKE @search/);
    assert.match(query, /e\.document_number LIKE @search/);
  });

  it("keeps company and operation scoping alongside the search predicate", () => {
    const query = buildEmployeesBaseQuery(true);
    assert.match(query, /ow\.operation_id = @operationId/);
    assert.match(query, /ow\.company_id = @companyId/);
    assert.match(query, /ow\.id = @operationWorkdayId/);
    // Never interpolate the raw term: only the @search parameter is referenced.
    assert.doesNotMatch(query, /LIKE '%/);
  });
});
