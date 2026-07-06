import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildListNavigationState,
  resolveListReturnPath,
} from "./list-navigation";

describe("buildListNavigationState", () => {
  it("captures pathname and search as fromList", () => {
    const state = buildListNavigationState("/operations", {
      pathname: "/operations",
      search: "?status=SCHEDULED&page=2",
    });

    assert.equal(state.fromList, "/operations?status=SCHEDULED&page=2");
    assert.equal(state.listPath, "/operations");
  });
});

describe("resolveListReturnPath", () => {
  it("returns fromList when it matches listPath", () => {
    const path = resolveListReturnPath("/operations", {
      fromList: "/operations?status=SCHEDULED&page=2",
      listPath: "/operations",
    });

    assert.equal(path, "/operations?status=SCHEDULED&page=2");
  });

  it("falls back to listPath when state is missing", () => {
    assert.equal(resolveListReturnPath("/operations", undefined), "/operations");
    assert.equal(resolveListReturnPath("/operations", null), "/operations");
  });

  it("falls back when fromList does not match listPath", () => {
    const path = resolveListReturnPath("/operations", {
      fromList: "/employees?search=ana",
      listPath: "/operations",
    });

    assert.equal(path, "/operations");
  });

  it("returns operation detail when navigating from operational view to attendance", () => {
    const path = resolveListReturnPath("/attendance", {
      fromList: "/operations/inv-123",
      listPath: "/operations/inv-123",
    });

    assert.equal(path, "/operations/inv-123");
  });
});
