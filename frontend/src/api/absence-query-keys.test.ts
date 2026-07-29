import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { absenceKeys, normalizeAbsencesListSearch } from "./absence-query-keys";

describe("absenceKeys", () => {
  it("scopes list/detail/balances under companyId", () => {
    const companyId = "co-1";
    assert.deepEqual(absenceKeys.company(companyId), ["absences", "company", "co-1"]);
    assert.deepEqual(absenceKeys.types(companyId)[2], "co-1");
    assert.equal(absenceKeys.list(companyId, { page: 1 })[0], "absences");
    assert.ok(absenceKeys.list(companyId, { page: 1 }).includes("co-1"));
    assert.ok(absenceKeys.detail(companyId, "req-1").includes("co-1"));
    assert.ok(absenceKeys.balances(companyId, "emp-1", 2026).includes("co-1"));
  });

  it("does not reuse keys across companies", () => {
    const a = JSON.stringify(absenceKeys.list("co-a", { status: "PENDING" }));
    const b = JSON.stringify(absenceKeys.list("co-b", { status: "PENDING" }));
    assert.notEqual(a, b);
  });
});

describe("normalizeAbsencesListSearch", () => {
  it("maps legacy employeeId to employeeIds", () => {
    const next = normalizeAbsencesListSearch("?employeeId=11111111-1111-4111-8111-111111111111&status=all");
    assert.ok(next);
    const params = new URLSearchParams(next!);
    assert.equal(params.get("employeeIds"), "11111111-1111-4111-8111-111111111111");
    assert.equal(params.get("employeeId"), null);
    assert.equal(params.get("status"), "all");
  });

  it("keeps existing employeeIds and drops employeeId", () => {
    const next = normalizeAbsencesListSearch(
      "employeeIds=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&employeeId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
    assert.ok(next);
    const params = new URLSearchParams(next!);
    assert.equal(params.get("employeeIds"), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    assert.equal(params.get("employeeId"), null);
  });

  it("returns null when already canonical", () => {
    assert.equal(
      normalizeAbsencesListSearch("employeeIds=11111111-1111-4111-8111-111111111111&status=all"),
      null,
    );
  });
});
