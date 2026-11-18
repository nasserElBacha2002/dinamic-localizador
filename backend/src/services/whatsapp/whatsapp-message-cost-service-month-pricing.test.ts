import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideMetaPricing } from "../../utils/whatsapp/whatsapp-meta-billing-policy";

const sentAt = new Date("2026-10-15T12:00:00.000Z");
const tariff = { tariffAmount: "0.026000", tariffCurrency: "USD" as const };

describe("SERVICE month rank pricing (999–1002)", () => {
  for (const rank of [999, 1000]) {
    it(`rank ${rank} is free tier`, () => {
      const decision = decideMetaPricing({
        metaBillingCategory: "SERVICE",
        sentAt,
        serviceMonthRank: rank,
        providerStatus: "delivered",
        customerServiceWindowOpen: true,
        ...tariff,
      });
      assert.equal(decision.metaPriceAmount, "0");
      assert.equal(decision.metaCostNote, "SERVICE_FREE_TIER");
    });
  }

  it("rank 1001 uses tariff above free tier", () => {
    const decision = decideMetaPricing({
      metaBillingCategory: "SERVICE",
      sentAt,
      serviceMonthRank: 1001,
      providerStatus: "delivered",
      customerServiceWindowOpen: true,
      ...tariff,
    });
    assert.equal(decision.metaPriceAmount, "0.026000");
    assert.match(decision.metaCostNote ?? "", /ABOVE_FREE_TIER/);
  });

  it("rank 1002 also uses tariff", () => {
    const decision = decideMetaPricing({
      metaBillingCategory: "SERVICE",
      sentAt,
      serviceMonthRank: 1002,
      providerStatus: "delivered",
      customerServiceWindowOpen: true,
      ...tariff,
    });
    assert.equal(decision.metaPriceAmount, "0.026000");
  });

  it("failed delivery does not bill", () => {
    const decision = decideMetaPricing({
      metaBillingCategory: "SERVICE",
      sentAt,
      serviceMonthRank: 1002,
      providerStatus: "failed",
      customerServiceWindowOpen: true,
      ...tariff,
    });
    assert.equal(decision.metaCostQuality, "UNAVAILABLE");
    assert.equal(decision.metaBillable, false);
  });

  it("SERVICE without rank never gets a positive tariff", () => {
    const decision = decideMetaPricing({
      metaBillingCategory: "SERVICE",
      sentAt,
      serviceMonthRank: null,
      providerStatus: "delivered",
      customerServiceWindowOpen: true,
      ...tariff,
    });
    assert.equal(decision.metaPriceAmount, null);
    assert.equal(decision.metaCostNote, "SERVICE_RANK_UNKNOWN");
    assert.equal(decision.metaCostQuality, "UNAVAILABLE");
  });

  it("UTILITY tariff is independent of customer service window (open)", () => {
    const decision = decideMetaPricing({
      metaBillingCategory: "UTILITY",
      sentAt,
      serviceMonthRank: null,
      providerStatus: "delivered",
      customerServiceWindowOpen: true,
      ...tariff,
    });
    assert.equal(decision.metaPriceAmount, "0.026000");
    assert.equal(decision.metaCostSource, "TARIFF_TABLE");
  });

  it("UTILITY tariff is independent of customer service window (closed)", () => {
    const decision = decideMetaPricing({
      metaBillingCategory: "UTILITY",
      sentAt,
      serviceMonthRank: null,
      providerStatus: "delivered",
      customerServiceWindowOpen: false,
      ...tariff,
    });
    assert.equal(decision.metaPriceAmount, "0.026000");
  });
});