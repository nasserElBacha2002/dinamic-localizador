import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AttendanceRecordWithRelations } from "../types/attendance";
import {
  attendanceListCheckoutLocationStatus,
  attendanceListDetailPath,
  attendanceListEventStatusesLabel,
  attendanceListLocationEvents,
  attendanceListLocationTone,
  attendanceListPunctualityEvents,
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
      locationStatus: "NOT_RECORDED" as const,
      validationStatus: null,
    };
    const absent = {
      ...baseRow,
      hasAttendanceRecord: false,
      effectiveState: "ABSENT" as const,
      punctualityStatus: "NOT_RECORDED" as const,
      locationStatus: "NOT_RECORDED" as const,
      validationStatus: null,
    };

    assert.equal(attendanceListValidationLabel(expected), "Pendiente / esperada");
    assert.equal(attendanceListPunctualityLabel(expected), "Pendiente / esperada");
    assert.equal(attendanceListValidationTone(expected), "warning");
    assert.equal(attendanceListPunctualityTone(expected), "warning");
    assert.equal(attendanceListLocationTone(expected), "neutral");

    assert.equal(attendanceListValidationLabel(absent), "Ausente");
    assert.equal(attendanceListPunctualityLabel(absent), "Ausente");
    assert.equal(attendanceListValidationTone(absent), "danger");
    assert.equal(attendanceListPunctualityTone(absent), "danger");
    assert.equal(attendanceListLocationTone(absent), "neutral");
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

  it("shows arrival and checkout location without dropping either event", () => {
    const both = {
      ...baseRow,
      checkoutAt: "2026-09-30T19:00:00.000Z",
      checkoutLatitude: -34.6,
      checkoutLongitude: -58.4,
      checkoutDistanceMeters: 8,
      checkoutStatus: "CHECKOUT_VALID" as const,
    };
    const outsideCheckout = {
      ...both,
      checkoutStatus: "CHECKOUT_LOCATION_REVIEW" as const,
    };
    const exitOnly = {
      ...baseRow,
      receivedAt: null,
      locationStatus: "NOT_RECORDED" as const,
      punctualityStatus: "NOT_RECORDED" as const,
      checkoutAt: "2026-09-30T19:00:00.000Z",
      checkoutLatitude: -34.6,
      checkoutLongitude: -58.4,
      checkoutDistanceMeters: 400,
      checkoutStatus: "CHECKOUT_REJECTED" as const,
    };
    const checkoutWithoutCoords = {
      ...both,
      checkoutLatitude: null,
      checkoutLongitude: null,
      checkoutDistanceMeters: null,
      checkoutStatus: "CHECKOUT_EARLY_REVIEW" as const,
    };

    const bothEvents = attendanceListLocationEvents(both);
    assert.equal(bothEvents.length, 2);
    assert.equal(bothEvents[0]?.event, "arrival");
    assert.equal(bothEvents[0]?.label, "Dentro del radio");
    assert.equal(bothEvents[1]?.event, "checkout");
    assert.equal(bothEvents[1]?.label, "Dentro del radio");
    assert.match(attendanceListEventStatusesLabel(bothEvents), /Entrada: Dentro del radio/);
    assert.match(attendanceListEventStatusesLabel(bothEvents), /Salida: Dentro del radio/);

    assert.equal(attendanceListCheckoutLocationStatus(outsideCheckout), "OUTSIDE_GEOFENCE");
    assert.equal(attendanceListLocationEvents(outsideCheckout)[1]?.label, "Fuera del radio");
    assert.equal(attendanceListLocationEvents(exitOnly)[0]?.event, "checkout");
    assert.equal(attendanceListLocationEvents(exitOnly)[0]?.label, "Fuera del radio");
    assert.equal(attendanceListCheckoutLocationStatus(checkoutWithoutCoords), "NOT_RECORDED");
    assert.equal(attendanceListLocationEvents(checkoutWithoutCoords)[1]?.label, "Sin registrar");
  });

  it("shows arrival punctuality and checkout status when both events exist", () => {
    const both = {
      ...baseRow,
      punctualityStatus: "LATE" as const,
      checkoutAt: "2026-09-30T18:00:00.000Z",
      checkoutStatus: "CHECKOUT_EARLY_REVIEW" as const,
    };
    const events = attendanceListPunctualityEvents(both);
    assert.equal(events.length, 2);
    assert.equal(events[0]?.label, "Tarde");
    assert.equal(events[1]?.label, "Salida anticipada (revisión)");
    assert.equal(events[0]?.event, "arrival");
    assert.equal(events[1]?.event, "checkout");

    const arrivalOnly = attendanceListPunctualityEvents(baseRow);
    assert.equal(arrivalOnly.length, 1);
    assert.equal(arrivalOnly[0]?.label, "A tiempo");
  });
});
