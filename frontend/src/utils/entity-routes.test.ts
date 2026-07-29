import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getEntityCreatePath,
  getEntityDetailPath,
  getEntityEditPath,
  getEntityListPath,
  isEntityEditPath,
} from "./entity-routes";

describe("entity-routes", () => {
  it("builds list / create / detail / edit paths", () => {
    assert.equal(getEntityListPath("employees"), "/employees");
    assert.equal(getEntityCreatePath("services"), "/services/new");
    assert.equal(getEntityDetailPath("work-teams", "wt-1"), "/work-teams/wt-1");
    assert.equal(getEntityEditPath("operations", "op-1"), "/operations/op-1/edit");
  });

  it("detects edit pathnames without false positives", () => {
    assert.equal(isEntityEditPath("/employees/abc/edit", "employees"), true);
    assert.equal(isEntityEditPath("/employees/abc", "employees"), false);
    assert.equal(isEntityEditPath("/employees/new", "employees"), false);
    assert.equal(isEntityEditPath("/services/abc/edit", "employees"), false);
  });
});
