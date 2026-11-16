import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BillingPlanPrice } from "../../types/billing-catalog";
import { classifyLaunchTierPriceCatalogState } from "./launch-catalog-price-state";

const price = (partial: Partial<BillingPlanPrice> & Pick<BillingPlanPrice, "effectiveFrom">): BillingPlanPrice => ({
  id: partial.id ?? "p1",
  billingPlanTierId: partial.billingPlanTierId ?? "t1",
  amount: partial.amount ?? "300.000000",
  currency: partial.currency ?? "USD",
  billingPeriod: partial.billingPeriod ?? "MONTHLY",
  priceKind: partial.priceKind ?? "REGULAR",
  effectiveFrom: partial.effectiveFrom,
  effectiveTo: partial.effectiveTo ?? null,
  createdAt: partial.createdAt ?? partial.effectiveFrom,
});

describe("launch tier price catalog classification", () => {
  const referenceAt = new Date("2026-05-01T00:00:00.000Z");

  it("classifies empty catalog", () => {
    assert.equal(
      classifyLaunchTierPriceCatalogState({
        prices: [],
        openPrice: null,
        initialAmountUsd: "300",
        referenceAt,
      }),
      "EMPTY",
    );
  });

  it("classifies initial open-only catalog", () => {
    const open = price({ effectiveFrom: "2026-01-01T00:00:00.000Z" });
    assert.equal(
      classifyLaunchTierPriceCatalogState({
        prices: [open],
        openPrice: open,
        initialAmountUsd: "300",
        referenceAt,
      }),
      "OPEN_ONLY",
    );
  });

  it("classifies admin modified open price", () => {
    const initial = price({
      id: "old",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveTo: "2026-06-01T00:00:00.000Z",
    });
    const current = price({ id: "new", amount: "350.000000", effectiveFrom: "2026-06-01T00:00:00.000Z" });
    assert.equal(
      classifyLaunchTierPriceCatalogState({
        prices: [current, initial],
        openPrice: current,
        initialAmountUsd: "300",
        referenceAt: new Date("2026-07-01T00:00:00.000Z"),
      }),
      "ADMIN_MODIFIED_OPEN",
    );
  });

  it("classifies future scheduled prices without active row at reference", () => {
    const future = price({ effectiveFrom: "2027-01-01T00:00:00.000Z" });
    assert.equal(
      classifyLaunchTierPriceCatalogState({
        prices: [future],
        openPrice: null,
        initialAmountUsd: "300",
        referenceAt,
      }),
      "FUTURE_SCHEDULED_WITHOUT_OPEN",
    );
  });

  it("classifies historical rows without open price", () => {
    const closed = price({
      effectiveFrom: "2025-01-01T00:00:00.000Z",
      effectiveTo: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(
      classifyLaunchTierPriceCatalogState({
        prices: [closed],
        openPrice: null,
        initialAmountUsd: "300",
        referenceAt,
      }),
      "HISTORY_WITHOUT_OPEN",
    );
  });
});