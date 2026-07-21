import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEmployeesListApiFilters,
  EMPLOYEE_TABLE_DEFAULTS,
} from "./employees-list-table-state";

describe("employees list table state", () => {
  it("maps category none and sorting to API filters", () => {
    const filters = buildEmployeesListApiFilters({
      ...EMPLOYEE_TABLE_DEFAULTS,
      search: "ana",
      active: "true",
      categoryId: "none",
      sortBy: "category",
      sortOrder: "desc",
    });

    assert.equal(filters.search, "ana");
    assert.equal(filters.active, true);
    assert.equal(filters.categoryId, "none");
    assert.equal(filters.sortBy, "category");
    assert.equal(filters.sortDirection, "desc");
  });

  it("omits all category filter when categoryId is all", () => {
    const filters = buildEmployeesListApiFilters({
      ...EMPLOYEE_TABLE_DEFAULTS,
      categoryId: "all",
    });
    assert.equal(filters.categoryId, undefined);
  });
});
