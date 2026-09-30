import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AttendanceRecordWithRelations } from "../types/attendance";
import {
  attendanceListDetailPath,
  attendanceListPunctualityLabel,
  attendanceListPunctualityTone,
  attendanceListRowKey,
  attendanceListValidationLabel,
  attendanceListValidationTone,
} from "./attendance-list-display";

const baseRow = {
  id: "att-1",
  operationId: "op-1",
  employeeId: "emp-1",
  employeeWorkdayId: "ew-1",
  receivedLatitude: null,
  receivedLongitude: null,
  distanceMeters: null,
  validationStatus: "VALID",
  locationStatus: "INSIDE_GEOFENCE",
  punctualityStatus: "ON_TIME",
  sourceMessageSid: null,
  validationReason: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewReason: null,
  receivedAt: "2026-09-30T11:00:00.000Z",
  checkoutAt: null,
  checkoutLatitude: null,
  checkoutLongitude: null,
  checkoutDistanceMeters: null,
  checkoutStatus: null,
  checkoutReviewReason: null,
  earlyDepartureMinutes: null,
  extraWorkedMinutes: null,
  checkoutMessageSid: null,
  arrivalSource: "WHATSAPP",
  checkoutSource: null,
  arrivalRegisteredBy: null,
  arrivalRegisteredAt: null,
  checkoutRegisteredBy: null,
  checkoutRegisteredAt: null,
  isSimulation: false,
  simulationSessionId: null,
  createdAt: "2026-09-30T11:00:00.000Z",
  employee: { id: "emp-1", name: "Juan", phoneNumber: "+1" },
  operation: {
    id: "op-1",
    status: "IN_PROGRESS",
    scheduledStart: "2026-09-30T11:00:00.000Z",
    scheduledEnd: null,
  },
  service: { id: "s-1", name: "S", address: null, active: true },
} as AttendanceRecordWithRelations;

describe("attendance-list-display", () => {
  it("uses punctuality tones for early / on-time / late punches", () => {
    assert.equal(
      attendanceListPunctualityTone({ ...baseRow, punctualityStatus: "EARLY" }),
      "info",
    );
    assert.equal(
      attendanceListPunctualityTone({ ...baseRow, punctualityStatus: "ON_TIME" }),
      "success",
    );
    assert.equal(
      attendanceListPunctualityTone({ ...baseRow, punctualityStatus: "LATE" }),
      "warning",
    );
  });

  it("uses effective-state labels and tones for no-punch expected vs absent", () => {
    const expected = {
      ...baseRow,
      hasAttendanceRecord: false,
      effectiveState: "EXPECTED" as const,
      punctualityStatus: "NOT_RECORDED" as const,
    };
    const absent = {
      ...baseRow,
      hasAttendanceRecord: false,
      effectiveState: "ABSENT" as const,
      punctualityStatus: "NOT_RECORDED" as const,
    };

    assert.equal(attendanceListValidationLabel(expected), "Pendiente / esperada");
    assert.equal(attendanceListPunctualityLabel(expected), "Pendiente / esperada");
    assert.equal(attendanceListValidationTone(expected), "neutral");
    assert.equal(attendanceListPunctualityTone(expected), "neutral");

    assert.equal(attendanceListValidationLabel(absent), "Ausente");
    assert.equal(attendanceListPunctualityLabel(absent), "Ausente");
    assert.equal(attendanceListValidationTone(absent), "danger");
    assert.equal(attendanceListPunctualityTone(absent), "danger");
  });

  it("routes detail by attendance id or employee workday id", () => {
    assert.equal(attendanceListDetailPath(baseRow), "/attendance/att-1");
    assert.equal(
      attendanceListDetailPath({
        ...baseRow,
        hasAttendanceRecord: false,
        id: "ew-1",
        listRowKey: "ew:ew-1",
      }),
      "/attendance/workdays/ew-1",
    );
    assert.equal(
      attendanceListRowKey({
        ...baseRow,
        isSimulation: true,
        listRowKey: undefined,
        id: "sim-1",
      }),
      "sim:sim-1",
    );
    assert.equal(
      attendanceListRowKey({
        ...baseRow,
        listRowKey: "ew:ew-1",
      }),
      "ew:ew-1",
    );
  });

  it("does not treat null validation as PENDING_REVIEW for no-punch rows", () => {
    const absent = {
      ...baseRow,
      hasAttendanceRecord: false,
      validationStatus: null,
      effectiveState: "ABSENT" as const,
      punctualityStatus: "NOT_RECORDED" as const,
    };
    assert.equal(attendanceListValidationLabel(absent), "Ausente");
    assert.notEqual(attendanceListValidationLabel(absent), "Pendiente");
  });
});
