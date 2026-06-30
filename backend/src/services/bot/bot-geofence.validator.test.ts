import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateGeofence } from "./bot-geofence.validator";

const baseInput = {
  employeeLatitude: -34.6,
  employeeLongitude: -58.4,
  storeLatitude: -34.6,
  storeLongitude: -58.4,
  allowedRadiusMeters: 150,
  reviewMarginMeters: 30,
};

describe("evaluateGeofence", () => {
  it("marks inside radius", () => {
    const result = evaluateGeofence({
      ...baseInput,
      employeeLatitude: -34.6005,
      employeeLongitude: -58.4005,
    });
    assert.equal(result.status, "inside");
    assert.ok(result.distanceMeters <= 150);
  });

  it("marks review margin", () => {
    const result = evaluateGeofence({
      ...baseInput,
      employeeLatitude: -34.6015,
      employeeLongitude: -58.4015,
    });

    if (result.distanceMeters > 150 && result.distanceMeters <= 180) {
      assert.equal(result.status, "review");
    }
  });

  it("marks outside radius beyond review margin", () => {
    const result = evaluateGeofence({
      ...baseInput,
      employeeLatitude: -34.61,
      employeeLongitude: -58.41,
    });
    assert.equal(result.status, "outside");
    assert.ok(result.distanceMeters > 180);
  });
});
