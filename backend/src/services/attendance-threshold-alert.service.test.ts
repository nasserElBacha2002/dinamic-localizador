import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculatePreciseAttendanceRate,
  classifyAttendanceThresholdTransition,
  formatAttendanceRateForDisplay,
  isCooldownElapsed,
  resolveAttendanceAlertBand,
} from "../utils/admin-alert/attendance-threshold";
import { buildAttendanceThresholdDedupKey } from "../utils/admin-alert/dedup-keys";
import { buildAdminOperationalAlertTemplateVariables } from "../utils/admin-alert/template-variables";
import { calculateAttendanceRate } from "../utils/attendance-statistics-metrics";

describe("attendance threshold formula alignment", () => {
  it("matches statistics rate for classic samples", () => {
    assert.equal(calculateAttendanceRate(8, 2), 80);
    assert.equal(calculateAttendanceRate(7, 3), 70);
    assert.equal(calculateAttendanceRate(0, 5), 0);
    assert.equal(calculateAttendanceRate(5, 0), 100);
    assert.equal(formatAttendanceRateForDisplay(8, 2), 80);
  });

  it("compares crossing with precise rate (79.99 / 80.00 / 80.01)", () => {
    // 7999/10000 = 79.99
    assert.ok(calculatePreciseAttendanceRate(7999, 2001) < 80);
    assert.equal(resolveAttendanceAlertBand({
      presentWorkdays: 8,
      absentWorkdays: 2,
      minimumWorkdays: 5,
      thresholdPercent: 80,
    }), "ABOVE_OR_EQUAL");
    assert.equal(resolveAttendanceAlertBand({
      presentWorkdays: 79,
      absentWorkdays: 21,
      minimumWorkdays: 5,
      thresholdPercent: 80,
    }), "BELOW");
    // 80.01 exact-ish: 8001 present of 10000
    assert.equal(resolveAttendanceAlertBand({
      presentWorkdays: 8001,
      absentWorkdays: 1999,
      minimumWorkdays: 5,
      thresholdPercent: 80,
    }), "ABOVE_OR_EQUAL");
  });

  it("enforces minimum sample (min-1 / min / min+1)", () => {
    assert.equal(
      resolveAttendanceAlertBand({
        presentWorkdays: 2,
        absentWorkdays: 2,
        minimumWorkdays: 5,
        thresholdPercent: 80,
      }),
      "INSUFFICIENT_SAMPLE",
    );
    assert.equal(
      resolveAttendanceAlertBand({
        presentWorkdays: 2,
        absentWorkdays: 3,
        minimumWorkdays: 5,
        thresholdPercent: 80,
      }),
      "BELOW",
    );
    assert.equal(
      resolveAttendanceAlertBand({
        presentWorkdays: 3,
        absentWorkdays: 3,
        minimumWorkdays: 5,
        thresholdPercent: 80,
      }),
      "BELOW",
    );
  });
});

describe("attendance threshold transitions", () => {
  it("baselines first evaluation and config mismatch", () => {
    assert.equal(
      classifyAttendanceThresholdTransition({
        priorBand: null,
        nextBand: "BELOW",
        configVersionMatch: true,
      }),
      "BASELINE",
    );
    assert.equal(
      classifyAttendanceThresholdTransition({
        priorBand: "ABOVE_OR_EQUAL",
        nextBand: "BELOW",
        configVersionMatch: false,
      }),
      "REBASELINE_CONFIG",
    );
    assert.equal(
      classifyAttendanceThresholdTransition({
        priorBand: "INSUFFICIENT_SAMPLE",
        nextBand: "BELOW",
        configVersionMatch: true,
      }),
      "REBASELINE_FIRST_SAMPLE",
    );
  });

  it("detects crossing and recovery", () => {
    assert.equal(
      classifyAttendanceThresholdTransition({
        priorBand: "ABOVE_OR_EQUAL",
        nextBand: "BELOW",
        configVersionMatch: true,
      }),
      "CROSSING_BELOW",
    );
    assert.equal(
      classifyAttendanceThresholdTransition({
        priorBand: "BELOW",
        nextBand: "BELOW",
        configVersionMatch: true,
      }),
      "STAY_BELOW",
    );
    assert.equal(
      classifyAttendanceThresholdTransition({
        priorBand: "BELOW",
        nextBand: "ABOVE_OR_EQUAL",
        configVersionMatch: true,
      }),
      "RECOVERED_ABOVE",
    );
  });

  it("cooldown boundary uses >= elapsed days", () => {
    const t0 = new Date("2026-08-01T12:00:00.000Z");
    assert.equal(isCooldownElapsed(t0, 7, new Date("2026-08-08T11:59:59.000Z")), false);
    assert.equal(isCooldownElapsed(t0, 7, new Date("2026-08-08T12:00:00.000Z")), true);
    assert.equal(isCooldownElapsed(null, 7, t0), true);
  });
});

describe("attendance threshold template + dedup", () => {
  it("builds factual operational copy without sensitive fields", () => {
    const vars = buildAdminOperationalAlertTemplateVariables("ATTENDANCE_THRESHOLD_CROSSED", {
      employeeName: "Juan Pérez",
      attendanceRatePercent: 78,
      attendanceThresholdPercent: 80,
      attendanceWindowDays: 30,
      attendanceEvaluatedWorkdays: 18,
    });
    assert.equal(vars["1"], "Asistencia baja");
    assert.equal(vars["2"], "Juan Pérez");
    assert.match(vars["3"]!, /78%/);
    assert.match(vars["3"]!, /80%/);
    assert.doesNotMatch(vars["3"]!, /faltando|incumple|mala/i);
    assert.match(vars["4"]!, /30 días/);
    assert.match(vars["4"]!, /18 jornadas/);
  });

  it("dedup key includes crossing sequence", () => {
    assert.equal(
      buildAttendanceThresholdDedupKey("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE", 2),
      "attendance-threshold:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:2",
    );
  });
});
