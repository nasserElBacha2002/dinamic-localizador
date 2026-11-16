import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareTermToCatalogPrice } from "./contract-vs-catalog";

describe("compareTermToCatalogPrice", () => {
  it("detects catalog amount and seat divergence", () => {
    const result = compareTermToCatalogPrice(
      {
        agreedAmount: "350.000000",
        currency: "USD",
        billingPeriod: "MONTHLY",
        priceKind: "REGULAR",
        seatMax: 180,
      },
      {
        id: "price-id",
        billingPlanTierId: "tier-id",
        amount: "300.000000",
        currency: "USD",
        billingPeriod: "MONTHLY",
        priceKind: "REGULAR",
        effectiveFrom: new Date().toISOString(),
        effectiveTo: null,
        createdAt: new Date().toISOString(),
      },
      100,
    );

    assert.equal(result.amountDiffersFromCatalog, true);
    assert.equal(result.seatCapacityDiffersFromCatalog, true);
  });
});