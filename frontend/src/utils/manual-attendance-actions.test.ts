import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveManualAttendanceActions,
  manualArrivalStatusLabel,
  manualCheckoutStatusLabel,
} from "./manual-attendance-actions";
import type { AttendanceRecord } from "../types/attendance";

function baseAttendance(
  overrides: Partial<AttendanceRecord> = {},
): AttendanceRecord {
  return {
    id: "att-1",
    operationId: "op-1",
    employeeId: "emp-1",
    receivedLatitude: null,
    receivedLongitude: null,
    distanceMeters: null,
    validationStatus: "VALID",
    locationStatus: "NOT_RECORDED",
    punctualityStatus: "ON_TIME",
    sourceMessageSid: null,
    validationReason: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewReason: null,
    receivedAt: null,
    checkoutAt: null,
    checkoutLatitude: null,
    checkoutLongitude: null,
    checkoutDistanceMeters: null,
    checkoutStatus: null,
    checkoutReviewReason: null,
    earlyDepartureMinutes: null,
    extraWorkedMinutes: null,
    checkoutMessageSid: null,
    arrivalSource: null,
    checkoutSource: null,
    arrivalRegisteredBy: null,
    arrivalRegisteredAt: null,
    checkoutRegisteredBy: null,
    checkoutRegisteredAt: null,
    isSimulation: false,
    simulationSessionId: null,
    createdAt: "2026-09-18T10:00:00.000Z",
    ...overrides,
  };
}

describe("resolveManualAttendanceActions", () => {
  it("shows register llegada when there is no arrival", () => {
    const actions = resolveManualAttendanceActions(null, {
      permissions: ["attendance:manual_create", "attendance:manual_edit"],
      allowManualAttendanceCorrections: true,
    });
    assert.deepEqual(
      actions.map((a) => a.key),
      ["register-check-in", "register-check-out"],
    );
  });

  it("shows edit llegada and register salida when arrival exists", () => {
    const actions = resolveManualAttendanceActions(
      baseAttendance({ receivedAt: "2026-09-18T11:00:00.000Z", arrivalSource: "WHATSAPP" }),
      {
        permissions: ["attendance:manual_create", "attendance:manual_edit"],
        allowManualAttendanceCorrections: true,
      },
    );
    assert.deepEqual(
      actions.map((a) => a.key),
      ["edit-check-in", "register-check-out"],
    );
  });

  it("shows edit both when arrival and checkout exist", () => {
    const actions = resolveManualAttendanceActions(
      baseAttendance({
        receivedAt: "2026-09-18T11:00:00.000Z",
        checkoutAt: "2026-09-18T20:00:00.000Z",
      }),
      {
        permissions: ["attendance:manual_create", "attendance:manual_edit"],
        allowManualAttendanceCorrections: true,
      },
    );
    assert.deepEqual(
      actions.map((a) => a.key),
      ["edit-check-in", "edit-check-out"],
    );
  });

  it("hides actions without permission", () => {
    const actions = resolveManualAttendanceActions(null, {
      permissions: ["attendance:read"],
      allowManualAttendanceCorrections: true,
    });
    assert.equal(actions.length, 0);
  });

  it("hides actions when company flag is off", () => {
    const actions = resolveManualAttendanceActions(null, {
      permissions: ["attendance:manual_create"],
      allowManualAttendanceCorrections: false,
    });
    assert.equal(actions.length, 0);
  });

  it("create-only permission does not show edit", () => {
    const actions = resolveManualAttendanceActions(
      baseAttendance({
        receivedAt: "2026-09-18T11:00:00.000Z",
        checkoutAt: "2026-09-18T20:00:00.000Z",
      }),
      {
        permissions: ["attendance:manual_create"],
        allowManualAttendanceCorrections: true,
      },
    );
    assert.equal(actions.length, 0);
  });
});

describe("manual status labels", () => {
  it("maps arrival punctuality", () => {
    assert.equal(manualArrivalStatusLabel("ON_TIME"), "En punto");
    assert.equal(manualArrivalStatusLabel("EARLY"), "En punto");
    assert.equal(manualArrivalStatusLabel("LATE"), "Tarde");
  });

  it("maps checkout status", () => {
    assert.equal(manualCheckoutStatusLabel("CHECKOUT_VALID"), "A horario");
    assert.equal(manualCheckoutStatusLabel("CHECKOUT_EARLY_REVIEW"), "Antes de hora");
  });
});
