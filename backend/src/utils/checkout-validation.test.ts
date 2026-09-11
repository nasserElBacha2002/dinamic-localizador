import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateGeofence } from "./attendance-validation";
import {
  combineCheckoutValidation,
  evaluateCheckoutTime,
} from "./checkout-validation";

describe("evaluateCheckoutTime", () => {
  const scheduledEnd = new Date("2026-06-24T21:00:00.000Z");

  it("marks checkout after scheduled end as extra worked time", () => {
    const result = evaluateCheckoutTime(
      new Date("2026-06-24T21:35:00.000Z"),
      scheduledEnd,
      15,
    );
    assert.equal(result.checkoutStatus, "CHECKOUT_LATE_EXTRA_TIME");
    assert.equal(result.extraWorkedMinutes, 35);
    assert.equal(result.earlyDepartureMinutes, 0);
  });

  it("allows early checkout within tolerance", () => {
    const result = evaluateCheckoutTime(
      new Date("2026-06-24T20:50:00.000Z"),
      scheduledEnd,
      15,
    );
    assert.equal(result.checkoutStatus, "CHECKOUT_EARLY_WITHIN_TOLERANCE");
    assert.equal(result.earlyDepartureMinutes, 10);
  });

  it("allows checkout exactly at the earliest configured instant", () => {
    const result = evaluateCheckoutTime(
      new Date("2026-06-24T20:45:00.000Z"),
      scheduledEnd,
      15,
    );
    assert.equal(result.checkoutStatus, "CHECKOUT_EARLY_WITHIN_TOLERANCE");
    assert.equal(result.earlyDepartureMinutes, 15);
  });

  it("classifies checkout exactly at operation end within tolerance", () => {
    const result = evaluateCheckoutTime(scheduledEnd, scheduledEnd, 15);
    assert.equal(result.checkoutStatus, "CHECKOUT_EARLY_WITHIN_TOLERANCE");
    assert.equal(result.earlyDepartureMinutes, 0);
  });

  it("flags checkout one minute before the earliest configured instant", () => {
    const result = evaluateCheckoutTime(
      new Date("2026-06-24T20:44:00.000Z"),
      scheduledEnd,
      15,
    );
    assert.equal(result.checkoutStatus, "CHECKOUT_EARLY_REVIEW");
    assert.equal(result.earlyDepartureMinutes, 16);
  });

  it("supports zero early-exit tolerance", () => {
    const atEnd = evaluateCheckoutTime(scheduledEnd, scheduledEnd, 0);
    const oneMinuteEarly = evaluateCheckoutTime(
      new Date("2026-06-24T20:59:00.000Z"),
      scheduledEnd,
      0,
    );
    assert.equal(atEnd.checkoutStatus, "CHECKOUT_EARLY_WITHIN_TOLERANCE");
    assert.equal(oneMinuteEarly.checkoutStatus, "CHECKOUT_EARLY_REVIEW");
  });

  it("flags checkout too early for review", () => {
    const result = evaluateCheckoutTime(
      new Date("2026-06-24T20:30:00.000Z"),
      scheduledEnd,
      15,
    );
    assert.equal(result.checkoutStatus, "CHECKOUT_EARLY_REVIEW");
    assert.equal(result.earlyDepartureMinutes, 30);
  });
});

describe("combineCheckoutValidation", () => {
  it("prioritizes location review over valid time", () => {
    const geo = evaluateGeofence(180, 150, 30);
    const time = evaluateCheckoutTime(new Date("2026-06-24T21:10:00.000Z"), new Date("2026-06-24T21:00:00.000Z"), 15);
    const result = combineCheckoutValidation(geo, time);
    assert.equal(result.checkoutStatus, "CHECKOUT_LOCATION_REVIEW");
  });

  it("rejects checkout far outside geofence", () => {
    const geo = evaluateGeofence(250, 150, 30);
    const time = evaluateCheckoutTime(new Date("2026-06-24T21:10:00.000Z"), new Date("2026-06-24T21:00:00.000Z"), 15);
    const result = combineCheckoutValidation(geo, time);
    assert.equal(result.checkoutStatus, "CHECKOUT_REJECTED");
  });
});
