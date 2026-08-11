import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMPANY_MODULE_KEYS } from "../../constants/company-modules";
import type {
  EmployeeWorkdayCheckInCandidate,
  EmployeeWorkdayCheckoutCandidate,
} from "../../types/employee-workday-availability";
import { resolveAttendanceLocationIntent } from "./attendance-location-intent";
import { applyCompanyModulesToLocationIntent } from "./direct-attendance-location.service";
import { MODULE_DISABLED_MESSAGE } from "./bot-response.builder";
import { resolvePendingLocationEventAt } from "./bot-workday.selector";
import { buildMixedAttendanceActionPrompt } from "./bot-response.builder";

const baseCheckIn = (
  overrides: Partial<EmployeeWorkdayCheckInCandidate> & { employeeWorkdayId: string },
): EmployeeWorkdayCheckInCandidate =>
  ({
    operationWorkdayId: "ow-1",
    operationId: "op-1",
    serviceId: "svc-1",
    serviceName: "Servicio A",
    serviceAddress: "Buenos Aires",
    serviceLocality: null,
    serviceLatitude: -34.6,
    serviceLongitude: -58.4,
    allowedRadiusMeters: 150,
    operationKind: "ONE_TIME",
    workDate: "2026-08-11",
    expectedStartAt: "2026-08-11T12:00:00.000Z",
    expectedEndAt: "2026-08-11T20:00:00.000Z",
    earlyToleranceMinutes: 30,
    lateToleranceMinutes: 15,
    scheduleTimezone: "America/Argentina/Buenos_Aires",
    expectationStatus: "EXPECTED",
    absenceRequestId: null,
    operationAssignmentId: null,
    ...overrides,
  }) as EmployeeWorkdayCheckInCandidate;

const baseCheckout = (
  overrides: Partial<EmployeeWorkdayCheckoutCandidate> & {
    employeeWorkdayId: string;
    attendanceRecordId: string;
  },
): EmployeeWorkdayCheckoutCandidate => ({
  ...baseCheckIn(overrides),
  attendanceRecordId: overrides.attendanceRecordId,
  checkInAt: overrides.checkInAt ?? "2026-08-11T12:05:00.000Z",
});

const moduleStates = (input: {
  attendance?: boolean;
  operations?: boolean;
}): Map<(typeof COMPANY_MODULE_KEYS)[keyof typeof COMPANY_MODULE_KEYS], boolean> => {
  const map = new Map();
  map.set(COMPANY_MODULE_KEYS.ATTENDANCE, input.attendance ?? true);
  map.set(COMPANY_MODULE_KEYS.OPERATIONS, input.operations ?? true);
  return map;
};

describe("applyCompanyModulesToLocationIntent", () => {
  it("blocks all LOCATION attendance when ATTENDANCE is disabled", () => {
    const intent = resolveAttendanceLocationIntent({
      checkInCandidates: [baseCheckIn({ employeeWorkdayId: "ew-1" })],
      checkoutCandidates: [
        baseCheckout({ employeeWorkdayId: "ew-2", attendanceRecordId: "att-1" }),
      ],
      hasJustifiedWorkdayInWindow: false,
    });
    const gated = applyCompanyModulesToLocationIntent({
      intent,
      moduleStates: moduleStates({ attendance: false, operations: true }),
      hasJustifiedWorkdayInWindow: false,
    });
    assert.equal(gated.blockedMessage, MODULE_DISABLED_MESSAGE);
  });

  it("keeps checkout when OPERATIONS is disabled on AMBIGUOUS_MIXED", () => {
    const checkout = baseCheckout({
      employeeWorkdayId: "ew-out",
      attendanceRecordId: "att-1",
      serviceName: "Servicio Salida",
    });
    const intent = resolveAttendanceLocationIntent({
      checkInCandidates: [baseCheckIn({ employeeWorkdayId: "ew-in" })],
      checkoutCandidates: [checkout],
      hasJustifiedWorkdayInWindow: false,
    });
    assert.equal(intent.kind, "AMBIGUOUS_MIXED");

    const gated = applyCompanyModulesToLocationIntent({
      intent,
      moduleStates: moduleStates({ attendance: true, operations: false }),
      hasJustifiedWorkdayInWindow: false,
    });
    assert.equal(gated.blockedMessage, null);
    assert.equal(gated.intent.kind, "CHECK_OUT");
    if (gated.intent.kind === "CHECK_OUT") {
      assert.equal(gated.intent.candidate.attendanceRecordId, "att-1");
    }
  });

  it("blocks check-in-only LOCATION when OPERATIONS is disabled", () => {
    const intent = resolveAttendanceLocationIntent({
      checkInCandidates: [baseCheckIn({ employeeWorkdayId: "ew-1" })],
      checkoutCandidates: [],
      hasJustifiedWorkdayInWindow: false,
    });
    const gated = applyCompanyModulesToLocationIntent({
      intent,
      moduleStates: moduleStates({ attendance: true, operations: false }),
      hasJustifiedWorkdayInWindow: false,
    });
    assert.equal(gated.blockedMessage, MODULE_DISABLED_MESSAGE);
  });

  it("allows checkout-only LOCATION when OPERATIONS is disabled", () => {
    const intent = resolveAttendanceLocationIntent({
      checkInCandidates: [],
      checkoutCandidates: [
        baseCheckout({ employeeWorkdayId: "ew-1", attendanceRecordId: "att-1" }),
      ],
      hasJustifiedWorkdayInWindow: false,
    });
    const gated = applyCompanyModulesToLocationIntent({
      intent,
      moduleStates: moduleStates({ attendance: true, operations: false }),
      hasJustifiedWorkdayInWindow: false,
    });
    assert.equal(gated.blockedMessage, null);
    assert.equal(gated.intent.kind, "CHECK_OUT");
  });
});

describe("buildMixedAttendanceActionPrompt", () => {
  it("lists salida then llegada without asking for Llegué/Me voy", () => {
    const message = buildMixedAttendanceActionPrompt({
      checkoutCandidates: [
        baseCheckout({
          employeeWorkdayId: "ew-out",
          attendanceRecordId: "att-1",
          serviceName: "Servicio A",
        }),
      ],
      checkInCandidates: [baseCheckIn({ employeeWorkdayId: "ew-in", serviceName: "Servicio B" })],
    });
    assert.match(message, /Encontré más de una acción posible/);
    assert.match(message, /Registrar salida/);
    assert.match(message, /Registrar llegada/);
    assert.doesNotMatch(message, /Escribí "Me voy"/);
    assert.doesNotMatch(message, /Escribí "Llegué"/);
  });
});

describe("resolvePendingLocationEventAt", () => {
  it("parses pending LOCATION receivedAt for delayed selection", () => {
    const eventAt = resolvePendingLocationEventAt({
      receivedAt: "2026-08-11T12:00:00.000Z",
    });
    assert.ok(eventAt);
    assert.equal(eventAt.toISOString(), "2026-08-11T12:00:00.000Z");
  });

  it("returns undefined for invalid receivedAt", () => {
    assert.equal(resolvePendingLocationEventAt({ receivedAt: "not-a-date" }), undefined);
  });
});
