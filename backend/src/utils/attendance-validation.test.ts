import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  combineAttendanceValidation,
  evaluateGeofence,
  evaluatePunctuality,
  isWithinInventoryWindow,
} from "./attendance-validation";

describe("evaluateGeofence", () => {
  it("marks inside radius as valid", () => {
    const result = evaluateGeofence(80, 150, 30);
    assert.equal(result.locationStatus, "INSIDE_GEOFENCE");
    assert.equal(result.geoValidationStatus, "VALID");
  });

  it("marks exact radius as inside (inclusive)", () => {
    const result = evaluateGeofence(150, 150, 30);
    assert.equal(result.locationStatus, "INSIDE_GEOFENCE");
    assert.equal(result.geoValidationStatus, "VALID");
  });

  it("marks review margin as pending review", () => {
    const result = evaluateGeofence(170, 150, 30);
    assert.equal(result.locationStatus, "OUTSIDE_GEOFENCE");
    assert.equal(result.geoValidationStatus, "PENDING_REVIEW");
  });

  it("marks exact review margin as pending (inclusive)", () => {
    const result = evaluateGeofence(180, 150, 30);
    assert.equal(result.geoValidationStatus, "PENDING_REVIEW");
  });

  it("marks beyond review margin as rejected", () => {
    const result = evaluateGeofence(181, 150, 30);
    assert.equal(result.geoValidationStatus, "REJECTED");
  });

  it("marks far distance as rejected", () => {
    const result = evaluateGeofence(250, 150, 30);
    assert.equal(result.geoValidationStatus, "REJECTED");
  });
});

describe("evaluatePunctuality", () => {
  const scheduledStart = new Date("2026-06-16T12:00:00.000Z");

  it("classifies early arrival", () => {
    const receivedAt = new Date("2026-06-16T11:50:00.000Z");
    const result = evaluatePunctuality(receivedAt, scheduledStart, 15, 30, 15);
    assert.equal(result.punctualityStatus, "EARLY");
    assert.equal(result.timeValidationStatus, "VALID");
  });

  it("classifies exact early tolerance as valid", () => {
    const receivedAt = new Date("2026-06-16T11:45:00.000Z");
    const result = evaluatePunctuality(receivedAt, scheduledStart, 15, 30, 15);
    assert.equal(result.timeValidationStatus, "VALID");
  });

  it("classifies on time arrival", () => {
    const receivedAt = new Date("2026-06-16T12:10:00.000Z");
    const result = evaluatePunctuality(receivedAt, scheduledStart, 15, 30, 15);
    assert.equal(result.punctualityStatus, "ON_TIME");
  });

  it("classifies late arrival", () => {
    const receivedAt = new Date("2026-06-16T12:20:00.000Z");
    const result = evaluatePunctuality(receivedAt, scheduledStart, 15, 30, 15);
    assert.equal(result.punctualityStatus, "LATE");
  });

  it("classifies outside window", () => {
    const receivedAt = new Date("2026-06-16T12:40:00.000Z");
    const result = evaluatePunctuality(receivedAt, scheduledStart, 15, 30, 15);
    assert.equal(result.punctualityStatus, "OUTSIDE_TIME_WINDOW");
    assert.equal(result.timeValidationStatus, "REJECTED");
  });
});

describe("isWithinInventoryWindow", () => {
  it("accepts compatible timestamp", () => {
    const scheduledStart = new Date("2026-06-16T12:00:00.000Z");
    const at = new Date("2026-06-16T12:10:00.000Z");
    assert.equal(isWithinInventoryWindow(at, scheduledStart, 15, 30), true);
  });

  it("rejects too early timestamp", () => {
    const scheduledStart = new Date("2026-06-16T12:00:00.000Z");
    const at = new Date("2026-06-16T11:30:00.000Z");
    assert.equal(isWithinInventoryWindow(at, scheduledStart, 15, 30), false);
  });
});

describe("combineAttendanceValidation", () => {
  it("applies the most restrictive status", () => {
    const geo = evaluateGeofence(80, 150, 30);
    const time = evaluatePunctuality(
      new Date("2026-06-16T12:40:00.000Z"),
      new Date("2026-06-16T12:00:00.000Z"),
      15,
      30,
      15,
    );

    const result = combineAttendanceValidation(geo, time);
    assert.equal(result.validationStatus, "REJECTED");
  });
});
