import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateAttendanceGeofence,
  evaluateGeofenceDistance,
} from "./bot-geofence.validator";

const allowedRadiusMeters = 150;
const reviewMarginMeters = 30;

describe("evaluateGeofenceDistance", () => {
  it("marks inside radius as inside", () => {
    const result = evaluateGeofenceDistance(80, allowedRadiusMeters, reviewMarginMeters);
    assert.equal(result.status, "inside");
    assert.equal(result.distanceMeters, 80);
  });

  it("marks exact allowed radius as inside (inclusive)", () => {
    const result = evaluateGeofenceDistance(150, allowedRadiusMeters, reviewMarginMeters);
    assert.equal(result.status, "inside");
    assert.equal(result.distanceMeters, 150);
  });

  it("marks review margin as review", () => {
    const result = evaluateGeofenceDistance(160, allowedRadiusMeters, reviewMarginMeters);
    assert.equal(result.status, "review");
    assert.ok(result.distanceMeters > allowedRadiusMeters);
    assert.ok(result.distanceMeters <= allowedRadiusMeters + reviewMarginMeters);
  });

  it("marks exact review margin boundary as review (inclusive)", () => {
    const result = evaluateGeofenceDistance(180, allowedRadiusMeters, reviewMarginMeters);
    assert.equal(result.status, "review");
    assert.equal(result.distanceMeters, 180);
  });

  it("marks beyond review margin as outside", () => {
    const result = evaluateGeofenceDistance(181, allowedRadiusMeters, reviewMarginMeters);
    assert.equal(result.status, "outside");
    assert.ok(result.distanceMeters > allowedRadiusMeters + reviewMarginMeters);
  });

  it("marks far distance as outside", () => {
    const result = evaluateGeofenceDistance(250, allowedRadiusMeters, reviewMarginMeters);
    assert.equal(result.status, "outside");
    assert.equal(result.distanceMeters, 250);
  });
});

describe("evaluateAttendanceGeofence", () => {
  it("marks same coordinates as distance zero and inside geofence", () => {
    const result = evaluateAttendanceGeofence({
      employeeLatitude: -34.6,
      employeeLongitude: -58.4,
      serviceLatitude: -34.6,
      serviceLongitude: -58.4,
      allowedRadiusMeters,
      reviewMarginMeters,
    });

    assert.equal(result.distanceMeters, 0);
    assert.equal(result.geoValidationStatus, "VALID");
    assert.equal(result.locationStatus, "INSIDE_GEOFENCE");
  });

  it("returns validation shape compatible with attendance/checkout combinators", () => {
    const result = evaluateAttendanceGeofence({
      employeeLatitude: -34.6005,
      employeeLongitude: -58.4005,
      serviceLatitude: -34.6,
      serviceLongitude: -58.4,
      allowedRadiusMeters,
      reviewMarginMeters,
    });

    assert.ok(result.distanceMeters >= 0);
    assert.ok(["INSIDE_GEOFENCE", "OUTSIDE_GEOFENCE"].includes(result.locationStatus));
    assert.ok(["VALID", "PENDING_REVIEW", "REJECTED"].includes(result.geoValidationStatus));
  });

  it("falls back to BOT_DEFAULT_RADIUS_METERS when allowed radius is zero", () => {
    const withDefault = evaluateAttendanceGeofence({
      employeeLatitude: -34.6,
      employeeLongitude: -58.4,
      serviceLatitude: -34.6,
      serviceLongitude: -58.4,
      allowedRadiusMeters: 0,
      reviewMarginMeters,
    });

    assert.equal(withDefault.distanceMeters, 0);
    assert.equal(withDefault.geoValidationStatus, "VALID");
  });
});
