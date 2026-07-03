import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildListNavigationState,
  resolveListReturnPath,
} from "./list-navigation";

describe("buildListNavigationState", () => {
  it("captures pathname and search as fromList", () => {
    const state = buildListNavigationState("/inventories", {
      pathname: "/inventories",
      search: "?status=SCHEDULED&page=2",
    });

    assert.equal(state.fromList, "/inventories?status=SCHEDULED&page=2");
    assert.equal(state.listPath, "/inventories");
  });
});

describe("resolveListReturnPath", () => {
  it("returns fromList when it matches listPath", () => {
    const path = resolveListReturnPath("/inventories", {
      fromList: "/inventories?status=SCHEDULED&page=2",
      listPath: "/inventories",
    });

    assert.equal(path, "/inventories?status=SCHEDULED&page=2");
  });

  it("falls back to listPath when state is missing", () => {
    assert.equal(resolveListReturnPath("/inventories", undefined), "/inventories");
    assert.equal(resolveListReturnPath("/inventories", null), "/inventories");
  });

  it("falls back when fromList does not match listPath", () => {
    const path = resolveListReturnPath("/inventories", {
      fromList: "/employees?search=ana",
      listPath: "/inventories",
    });

    assert.equal(path, "/inventories");
  });
});
