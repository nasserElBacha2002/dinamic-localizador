import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  combineAttendanceValidation,
  evaluateGeofence,
  evaluatePunctuality,
  isWithinOperationWindow,
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
  const scheduledStart = new Date("2026-07-31T12:00:00.000Z");
  const expectedEnd = new Date("2026-07-31T20:00:00.000Z");

  it("classifies early arrival", () => {
    const receivedAt = new Date("2026-07-31T11:50:00.000Z");
    const result = evaluatePunctuality(receivedAt, scheduledStart, 15, 15, 15, expectedEnd);
    assert.equal(result.punctualityStatus, "EARLY");
    assert.equal(result.timeValidationStatus, "VALID");
  });

  it("classifies on time within late tolerance", () => {
    const receivedAt = new Date("2026-07-31T12:10:00.000Z");
    const result = evaluatePunctuality(receivedAt, scheduledStart, 15, 15, 0, expectedEnd);
    assert.equal(result.punctualityStatus, "ON_TIME");
  });

  it("classifies late after late tolerance and before end", () => {
    const receivedAt = new Date("2026-07-31T14:41:51.000Z");
    const result = evaluatePunctuality(receivedAt, scheduledStart, 15, 15, 15, expectedEnd);
    assert.equal(result.punctualityStatus, "LATE");
    assert.equal(result.timeValidationStatus, "VALID");
  });

  it("rejects at and after expected end", () => {
    const result = evaluatePunctuality(
      new Date("2026-07-31T20:00:00.000Z"),
      scheduledStart,
      15,
      15,
      15,
      expectedEnd,
    );
    assert.equal(result.punctualityStatus, "OUTSIDE_TIME_WINDOW");
    assert.equal(result.timeValidationStatus, "REJECTED");
  });

  it("ignores onTimeGraceMinutes in favor of lateTolerance for ON_TIME boundary", () => {
    const receivedAt = new Date("2026-07-31T12:01:00.000Z");
    const result = evaluatePunctuality(receivedAt, scheduledStart, 15, 15, 0, expectedEnd);
    assert.equal(result.punctualityStatus, "ON_TIME");
  });
});

describe("isWithinOperationWindow", () => {
  it("accepts mid-shift when expected end is provided", () => {
    const scheduledStart = new Date("2026-07-31T12:00:00.000Z");
    const expectedEnd = new Date("2026-07-31T20:00:00.000Z");
    const at = new Date("2026-07-31T14:41:51.000Z");
    assert.equal(isWithinOperationWindow(at, scheduledStart, 15, 15, expectedEnd), true);
  });

  it("rejects too early timestamp", () => {
    const scheduledStart = new Date("2026-07-31T12:00:00.000Z");
    const at = new Date("2026-07-31T11:30:00.000Z");
    assert.equal(isWithinOperationWindow(at, scheduledStart, 15, 15, null), false);
  });
});

describe("combineAttendanceValidation", () => {
  it("applies the most restrictive status", () => {
    const geo = evaluateGeofence(80, 150, 30);
    const time = evaluatePunctuality(
      new Date("2026-07-31T20:00:00.000Z"),
      new Date("2026-07-31T12:00:00.000Z"),
      15,
      15,
      15,
      new Date("2026-07-31T20:00:00.000Z"),
    );

    const result = combineAttendanceValidation(geo, time);
    assert.equal(result.validationStatus, "REJECTED");
  });
});
