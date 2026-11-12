import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isOperationalChargeHolderCategory,
} from "./operational-charge-holder";
import { OPERATIONAL_CHARGE_HOLDER_CATEGORY_NORMALIZED_NAME } from "../../constants/operational-charge-holder";

describe("operational charge holder category", () => {
  it("recognizes the system Encargado normalized name", () => {
    assert.equal(
      isOperationalChargeHolderCategory(OPERATIONAL_CHARGE_HOLDER_CATEGORY_NORMALIZED_NAME),
      true,
    );
    assert.equal(isOperationalChargeHolderCategory("supervisor"), false);
  });
});
