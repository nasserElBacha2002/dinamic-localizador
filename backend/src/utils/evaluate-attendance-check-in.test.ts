import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateAttendanceCheckIn } from "./evaluate-attendance-check-in";

describe("evaluateAttendanceCheckIn", () => {
  const service = { latitude: -34.6037, longitude: -58.3816 };
  const scheduledStart = new Date("2026-09-21T12:00:00.000Z");

  it("marks INSIDE + ON_TIME for near coords within window", () => {
    const result = evaluateAttendanceCheckIn({
      coordinates: { latitude: service.latitude, longitude: service.longitude },
      serviceCoordinates: service,
      geofencePolicy: { radiusMeters: 150, marginMeters: 30 },
      authoritativeAt: new Date("2026-09-21T12:05:00.000Z"),
      scheduledStart,
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 30,
    });

    assert.equal(result.validation.locationStatus, "INSIDE_GEOFENCE");
    assert.equal(result.validation.punctualityStatus, "LATE");
    assert.equal(result.validation.validationStatus, "VALID");
    assert.ok(result.distanceMeters < 5);
  });

  it("rejects far location regardless of time", () => {
    const result = evaluateAttendanceCheckIn({
      coordinates: {
        latitude: service.latitude + 0.0045,
        longitude: service.longitude,
      },
      serviceCoordinates: service,
      geofencePolicy: { radiusMeters: 150, marginMeters: 30 },
      authoritativeAt: new Date("2026-09-21T12:05:00.000Z"),
      scheduledStart,
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 30,
    });

    assert.equal(result.validation.locationStatus, "OUTSIDE_GEOFENCE");
    assert.equal(result.validation.validationStatus, "REJECTED");
    assert.ok(result.distanceMeters > 400);
  });

  it("uses authoritativeAt for punctuality (not a separate client clock)", () => {
    const late = evaluateAttendanceCheckIn({
      coordinates: service,
      serviceCoordinates: service,
      geofencePolicy: { radiusMeters: 150, marginMeters: 30 },
      authoritativeAt: new Date("2026-09-21T12:45:00.000Z"),
      scheduledStart,
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 30,
    });
    assert.equal(late.validation.punctualityStatus, "OUTSIDE_TIME_WINDOW");
    assert.equal(late.validation.validationStatus, "REJECTED");
  });
});
