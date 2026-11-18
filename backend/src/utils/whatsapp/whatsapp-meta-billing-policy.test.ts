import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  META_SERVICE_FREE_MESSAGES_PER_SENDER_MONTH,
  META_SERVICE_FREE_TIER_EFFECTIVE_ISO,
} from "../../constants/whatsapp-message-cost";
import {
  decideMetaPricing,
  isMetaServiceFreeTierActive,
  isEligibleServiceMessage,
} from "./whatsapp-meta-billing-policy";

describe("whatsapp meta billing policy", () => {
  it("SERVICE rank 999 and 1000 are free after Oct 2026", () => {
    const sentAt = new Date("2026-10-15T12:00:00.000Z");
    assert.equal(isMetaServiceFreeTierActive(sentAt), true);

    for (const rank of [999, 1000]) {
      const decision = decideMetaPricing({
        metaBillingCategory: "SERVICE",
        sentAt,
        serviceMonthRank: rank,
        tariffAmount: "0.05",
        tariffCurrency: "USD",
        providerStatus: "delivered",
        customerServiceWindowOpen: true,
      });
      assert.equal(decision.metaPriceAmount, "0");
      assert.equal(decision.metaCostNote, "SERVICE_FREE_TIER");
      assert.equal(decision.metaCostQuality, "ESTIMATED");
    }
  });

  it("SERVICE rank 1002 uses tariff when available", () => {
    const sentAt = new Date("2026-10-15T12:00:00.000Z");
    const decision = decideMetaPricing({
      metaBillingCategory: "SERVICE",
      sentAt,
      serviceMonthRank: 1002,
      tariffAmount: "0.026",
      tariffCurrency: "USD",
      providerStatus: "delivered",
      customerServiceWindowOpen: true,
    });
    assert.equal(decision.metaPriceAmount, "0.026");
  });

  it("SERVICE rank 1001 uses tariff when available", () => {
    const sentAt = new Date("2026-10-15T12:00:00.000Z");
    const decision = decideMetaPricing({
      metaBillingCategory: "SERVICE",
      sentAt,
      serviceMonthRank: 1001,
      tariffAmount: "0.042",
      tariffCurrency: "USD",
      providerStatus: "delivered",
      customerServiceWindowOpen: true,
    });
    assert.equal(decision.metaPriceAmount, "0.042");
    assert.equal(decision.metaCostSource, "TARIFF_TABLE");
    assert.match(decision.metaCostNote ?? "", /ABOVE_FREE_TIER/);
  });

  it("MARKETING does not consume SERVICE free tier logic at rank null", () => {
    const sentAt = new Date("2026-10-15T12:00:00.000Z");
    const decision = decideMetaPricing({
      metaBillingCategory: "MARKETING",
      sentAt,
      serviceMonthRank: null,
      tariffAmount: "0.09",
      tariffCurrency: "USD",
      providerStatus: "delivered",
      customerServiceWindowOpen: false,
    });
    assert.equal(decision.serviceMonthRank, null);
    assert.equal(decision.metaPriceAmount, "0.09");
  });

  it("inbound Meta fee is policy-estimated zero (not provider-confirmed)", () => {
    const decision = decideMetaPricing({
      metaBillingCategory: "NONE_INBOUND",
      sentAt: new Date("2026-11-01T00:00:00.000Z"),
      serviceMonthRank: null,
      tariffAmount: null,
      tariffCurrency: null,
      providerStatus: "received",
      customerServiceWindowOpen: null,
    });
    assert.equal(decision.metaPriceAmount, "0");
    assert.equal(decision.metaCostQuality, "ESTIMATED");
  });

  it("failed delivery leaves meta unavailable", () => {
    const decision = decideMetaPricing({
      metaBillingCategory: "UTILITY",
      sentAt: new Date("2026-10-15T12:00:00.000Z"),
      serviceMonthRank: null,
      tariffAmount: "0.03",
      tariffCurrency: "USD",
      providerStatus: "failed",
      customerServiceWindowOpen: false,
    });
    assert.equal(decision.metaCostQuality, "UNAVAILABLE");
    assert.equal(decision.metaBillable, false);
  });

  it("monthly reset: pre-Oct 2026 SERVICE is policy-free", () => {
    const sentAt = new Date("2026-09-30T23:59:59.000Z");
    assert.equal(isMetaServiceFreeTierActive(sentAt), false);
    const decision = decideMetaPricing({
      metaBillingCategory: "SERVICE",
      sentAt,
      serviceMonthRank: 2000,
      tariffAmount: "0.05",
      tariffCurrency: "USD",
      providerStatus: "delivered",
      customerServiceWindowOpen: true,
    });
    assert.equal(decision.metaCostNote, "PRE_OCT_2026_SERVICE_META_FREE");
  });

  it("SERVICE eligibility requires customer service window for TwiML", () => {
    assert.equal(
      isEligibleServiceMessage({
        metaBillingCategory: "SERVICE",
        customerServiceWindowOpen: false,
        messageKind: "BOT_TWIML",
      }),
      false,
    );
    assert.equal(
      isEligibleServiceMessage({
        metaBillingCategory: "SERVICE",
        customerServiceWindowOpen: true,
        messageKind: "BOT_TWIML",
      }),
      true,
    );
  });

  it("SERVICE with unknown rank has no positive amount", () => {
    const decision = decideMetaPricing({
      metaBillingCategory: "SERVICE",
      sentAt: new Date("2026-10-15T12:00:00.000Z"),
      serviceMonthRank: null,
      tariffAmount: "0.026",
      tariffCurrency: "USD",
      providerStatus: "delivered",
      customerServiceWindowOpen: true,
    });
    assert.equal(decision.metaPriceAmount, null);
    assert.equal(decision.metaCostNote, "SERVICE_RANK_UNKNOWN");
  });

  it("documents free tier quota constant", () => {
    assert.equal(META_SERVICE_FREE_MESSAGES_PER_SENDER_MONTH, 1000);
    assert.ok(META_SERVICE_FREE_TIER_EFFECTIVE_ISO.startsWith("2026-10-01"));
  });
});