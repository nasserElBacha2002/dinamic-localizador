import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listManagedTableUrlKeys, serializeTableUrlState } from "./table-url-state";

describe("serializeTableUrlState external params", () => {
  const defaults = {
    page: 1,
    pageSize: 10,
    status: "",
    search: "",
  };

  it("lists managed keys from defaults", () => {
    assert.deepEqual(
      [...listManagedTableUrlKeys(defaults)].sort(),
      ["page", "pageSize", "search", "status"],
    );
  });

  it("preserves unmanaged query params on serialize", () => {
    const existing = new URLSearchParams(
      "status=SCHEDULED&page=2&from=dashboard&companyView=compact",
    );
    const params = serializeTableUrlState({
      state: { ...defaults, status: "", page: 1 },
      defaults,
      preserveParams: existing,
    });

    assert.equal(params.get("from"), "dashboard");
    assert.equal(params.get("companyView"), "compact");
    assert.equal(params.get("status"), null);
    assert.equal(params.get("page"), null);
  });

  it("rewrites managed keys while keeping external ones", () => {
    const existing = new URLSearchParams("status=SCHEDULED&from=dashboard");
    const params = serializeTableUrlState({
      state: { ...defaults, status: "COMPLETED", page: 3 },
      defaults,
      preserveParams: existing,
    });

    assert.equal(params.get("status"), "COMPLETED");
    assert.equal(params.get("page"), "3");
    assert.equal(params.get("from"), "dashboard");
  });
});
