import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../errors/app-error";
import {
  applyPercentDiscount,
  assertBenefitFinalAmount,
  subtractBenefitAmounts,
} from "./commercial-benefit-decimal";

describe("commercial benefit decimal arithmetic", () => {
  it("applies percent discount with half-up rounding", () => {
    assert.equal(applyPercentDiscount("300.000000", "10"), "270");
    assert.equal(applyPercentDiscount("100", "33.3333"), "66.6667");
    assert.equal(applyPercentDiscount("1", "12.5"), "0.875");
  });

  it("subtracts fixed discount amounts exactly", () => {
    assert.equal(subtractBenefitAmounts("300.000000", "50"), "250");
  });

  it("rejects discount greater than base and negative discounts", () => {
    assert.throws(
      () => subtractBenefitAmounts("100", "100.000001"),
      (error: unknown) => error instanceof AppError && error.code === "BILLING_BENEFIT_DISCOUNT_EXCEEDS_BASE",
    );
    assert.throws(
      () => subtractBenefitAmounts("100", "-1"),
      (error: unknown) => error instanceof AppError && error.code === "BILLING_INVALID_BENEFIT_DISCOUNT",
    );
  });

  it("validates final agreed amount for percent and fixed discounts", () => {
    assert.equal(
      assertBenefitFinalAmount("300.000000", "PERCENT_DISCOUNT", {
        finalAgreedAmount: "270",
        discountPercent: "10",
      }),
      "270",
    );
    assert.equal(
      assertBenefitFinalAmount("300.000000", "FIXED_AMOUNT_DISCOUNT", {
        finalAgreedAmount: "250",
        discountAmount: "50",
      }),
      "250",
    );
  });

  it("rejects percent above 100", () => {
    assert.throws(
      () => applyPercentDiscount("100", "100.0001"),
      (error: unknown) => error instanceof AppError && error.code === "BILLING_INVALID_BENEFIT_PERCENT",
    );
  });

  it("accepts DECIMAL(18,6) maximum and rejects the first value above range", () => {
    const maxAllowed = "999999999999.999999";
    assert.doesNotThrow(() => subtractBenefitAmounts(maxAllowed, "0"));
    assert.throws(
      () => subtractBenefitAmounts("1000000000000", "0"),
      (error: unknown) => error instanceof AppError && error.code === "BILLING_AMOUNT_OUT_OF_RANGE",
    );
    assert.throws(
      () => subtractBenefitAmounts("999999999999.9999991", "0"),
      (error: unknown) => error instanceof AppError && error.code === "BILLING_AMOUNT_OUT_OF_RANGE",
    );
  });

  it("rejects percent precision beyond DECIMAL(9,4) instead of truncating", () => {
    assert.throws(
      () => applyPercentDiscount("300", "10.12345"),
      (error: unknown) => error instanceof AppError && error.code === "BILLING_INVALID_BENEFIT_PERCENT",
    );
    assert.equal(applyPercentDiscount("300.000000", "33.3333"), "200.0001");
  });

  it("applies percent discount at DECIMAL(9,4) boundaries", () => {
    assert.equal(applyPercentDiscount("100", "0.0001"), "99.9999");
    assert.equal(applyPercentDiscount("100", "100"), "0");
    assert.throws(
      () => applyPercentDiscount("100", "0.00001"),
      (error: unknown) => error instanceof AppError && error.code === "BILLING_INVALID_BENEFIT_PERCENT",
    );
  });
});