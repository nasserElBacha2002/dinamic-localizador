import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  areFilterValuesEqual,
  buildFilterResetState,
  countActiveFilters,
  hasActiveFilters,
  normalizeFilterValue,
} from "./filter-state";

describe("filter-state", () => {
  it("normalizes null and undefined to the same sentinel", () => {
    assert.equal(normalizeFilterValue(null), null);
    assert.equal(normalizeFilterValue(undefined), null);
    assert.equal(areFilterValuesEqual(null, undefined), true);
  });

  it("compares arrays by value", () => {
    assert.equal(areFilterValuesEqual(["a", "b"], ["a", "b"]), true);
    assert.equal(areFilterValuesEqual(["a", "b"], ["b", "a"]), false);
    assert.equal(areFilterValuesEqual([], []), true);
  });

  it("compares dates by ISO value", () => {
    const a = new Date("2026-07-01T00:00:00.000Z");
    const b = new Date("2026-07-01T00:00:00.000Z");
    assert.equal(areFilterValuesEqual(a, b), true);
    assert.equal(areFilterValuesEqual(a, new Date("2026-07-02T00:00:00.000Z")), false);
  });

  it("compares option-like objects by sorted keys", () => {
    assert.equal(
      areFilterValuesEqual({ value: "1", label: "A" }, { label: "A", value: "1" }),
      true,
    );
    assert.equal(
      areFilterValuesEqual({ value: "1", label: "A" }, { value: "2", label: "A" }),
      false,
    );
  });

  it("detects active filters against screen-specific defaults", () => {
    const defaults = {
      page: 1,
      pageSize: 10,
      search: "",
      status: "PENDING",
      employeeIds: [] as string[],
      sortBy: "name",
      sortOrder: "asc",
    };
    assert.equal(hasActiveFilters(defaults, defaults), false);
    assert.equal(
      hasActiveFilters({ ...defaults, page: 3 }, defaults),
      false,
      "page alone is not an active filter",
    );
    assert.equal(hasActiveFilters({ ...defaults, status: "APPROVED" }, defaults), true);
    assert.equal(hasActiveFilters({ ...defaults, search: "ana" }, defaults), true);
    assert.equal(hasActiveFilters({ ...defaults, employeeIds: ["e1"] }, defaults), true);
  });

  it("counts each differing filter key once", () => {
    const defaults = {
      page: 1,
      pageSize: 10,
      status: "",
      serviceId: "",
      datePreset: "today",
    };
    assert.equal(countActiveFilters(defaults, defaults), 0);
    assert.equal(
      countActiveFilters(
        { ...defaults, status: "ACTIVE", serviceId: "s1", datePreset: "week" },
        defaults,
      ),
      3,
    );
  });

  it("resets atomically while retaining pageSize and sort", () => {
    const defaults = {
      page: 1,
      pageSize: 10,
      search: "",
      status: "PENDING",
      sortBy: "name",
      sortOrder: "asc" as const,
    };
    const current = {
      page: 4,
      pageSize: 25,
      search: "juan",
      status: "APPROVED",
      sortBy: "createdAt",
      sortOrder: "desc" as const,
    };
    const next = buildFilterResetState(current, defaults);
    assert.deepEqual(next, {
      page: 1,
      pageSize: 25,
      search: "",
      status: "PENDING",
      sortBy: "createdAt",
      sortOrder: "desc",
    });
  });

  it("allows custom retain keys such as tab", () => {
    const defaults = {
      tab: "general",
      operationIds: [] as string[],
      empPage: 1,
      empPageSize: 10,
    };
    const current = {
      tab: "employee",
      operationIds: ["op-1"],
      empPage: 3,
      empPageSize: 25,
    };
    const next = buildFilterResetState(current, defaults, {
      retainKeys: ["tab", "empPageSize"],
    });
    assert.deepEqual(next, {
      tab: "employee",
      operationIds: [],
      empPage: 1,
      empPageSize: 25,
    });
  });
});
