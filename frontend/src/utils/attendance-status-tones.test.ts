import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attendanceEffectiveStateTone,
  locationStatusTone,
  punctualityStatusTone,
  validationStatusTone,
} from "./attendance-status-tones";

describe("attendanceEffectiveStateTone", () => {
  it("maps effective states to semantic tones", () => {
    assert.equal(attendanceEffectiveStateTone("EXPECTED"), "warning");
    assert.equal(attendanceEffectiveStateTone("ABSENT"), "danger");
    assert.equal(attendanceEffectiveStateTone("PRESENT"), "success");
    assert.equal(attendanceEffectiveStateTone("JUSTIFIED"), "info");
    assert.equal(attendanceEffectiveStateTone("CANCELLED"), "neutral");
  });
});

describe("punctualityStatusTone", () => {
  it("maps punctuality statuses to semantic tones", () => {
    assert.equal(punctualityStatusTone("EARLY"), "info");
    assert.equal(punctualityStatusTone("ON_TIME"), "success");
    assert.equal(punctualityStatusTone("LATE"), "warning");
    assert.equal(punctualityStatusTone("OUTSIDE_TIME_WINDOW"), "danger");
    assert.equal(punctualityStatusTone("NOT_RECORDED"), "neutral");
  });
});

describe("validationStatusTone", () => {
  it("maps validation statuses to semantic tones", () => {
    assert.equal(validationStatusTone("VALID"), "success");
    assert.equal(validationStatusTone("PENDING_REVIEW"), "warning");
    assert.equal(validationStatusTone("REJECTED"), "danger");
  });
});

describe("locationStatusTone", () => {
  it("keeps not-recorded neutral and geofence semantic", () => {
    assert.equal(locationStatusTone("NOT_RECORDED"), "neutral");
    assert.equal(locationStatusTone("INSIDE_GEOFENCE"), "success");
    assert.equal(locationStatusTone("OUTSIDE_GEOFENCE"), "danger");
    assert.equal(locationStatusTone("INVALID_LOCATION"), "warning");
  });
});
