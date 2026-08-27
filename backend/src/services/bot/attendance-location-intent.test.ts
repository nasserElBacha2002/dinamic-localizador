import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  EmployeeWorkdayCheckInCandidate,
  EmployeeWorkdayCheckoutCandidate,
} from "../../types/employee-workday-availability";
import { resolveAttendanceLocationIntent } from "./attendance-location-intent";

const baseCheckIn = (
  overrides: Partial<EmployeeWorkdayCheckInCandidate> & { employeeWorkdayId: string },
): EmployeeWorkdayCheckInCandidate =>
  ({
    operationWorkdayId: "ow-1",
    operationId: "op-1",
    serviceId: "svc-1",
    serviceName: "Formosa 456",
    serviceAddress: "Buenos Aires",
    serviceLocality: null,
    serviceLatitude: -34.6,
    serviceLongitude: -58.4,
    allowedRadiusMeters: 150,
    operationKind: "ONE_TIME",
    workDate: "2026-08-11",
    expectedStartAt: "2026-08-11T13:00:00.000Z",
    expectedEndAt: "2026-08-11T21:00:00.000Z",
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
  checkInAt: overrides.checkInAt ?? "2026-08-11T13:05:00.000Z",
});

describe("resolveAttendanceLocationIntent", () => {
  it("resolves single check-in candidate as CHECK_IN", () => {
    const candidate = baseCheckIn({ employeeWorkdayId: "ew-1" });
    const intent = resolveAttendanceLocationIntent({
      checkInCandidates: [candidate],
      checkoutCandidates: [],
      hasJustifiedWorkdayInWindow: false,
    });
    assert.deepEqual(intent, { kind: "CHECK_IN", candidate });
  });

  it("does not auto-checkout for a single open checkout (needs Me voy)", () => {
    const candidate = baseCheckout({
      employeeWorkdayId: "ew-1",
      attendanceRecordId: "att-1",
    });
    const intent = resolveAttendanceLocationIntent({
      checkInCandidates: [],
      checkoutCandidates: [candidate],
      hasJustifiedWorkdayInWindow: false,
    });
    assert.deepEqual(intent, { kind: "NEEDS_CHECKOUT_INTENT", candidates: [candidate] });
  });

  it("returns NONE when no candidates", () => {
    const intent = resolveAttendanceLocationIntent({
      checkInCandidates: [],
      checkoutCandidates: [],
      hasJustifiedWorkdayInWindow: true,
    });
    assert.deepEqual(intent, { kind: "NONE", hasJustifiedWorkdayInWindow: true });
  });

  it("returns AMBIGUOUS_CHECK_IN for multiple check-in candidates and never picks first", () => {
    const candidates = [
      baseCheckIn({ employeeWorkdayId: "ew-1", operationId: "op-1" }),
      baseCheckIn({ employeeWorkdayId: "ew-2", operationId: "op-2" }),
      baseCheckIn({ employeeWorkdayId: "ew-3", operationId: "op-3" }),
    ];
    const intent = resolveAttendanceLocationIntent({
      checkInCandidates: candidates,
      checkoutCandidates: [],
      hasJustifiedWorkdayInWindow: false,
    });
    assert.equal(intent.kind, "AMBIGUOUS_CHECK_IN");
    assert.notEqual(intent.kind, "CHECK_IN");
    if (intent.kind === "AMBIGUOUS_CHECK_IN") {
      assert.equal(intent.candidates.length, 3);
      assert.equal(intent.candidates[0]?.employeeWorkdayId, "ew-1");
      assert.equal(intent.candidates[2]?.employeeWorkdayId, "ew-3");
    }
  });

  it("returns NEEDS_CHECKOUT_INTENT for multiple checkout candidates", () => {
    const candidates = [
      baseCheckout({ employeeWorkdayId: "ew-1", attendanceRecordId: "att-1" }),
      baseCheckout({ employeeWorkdayId: "ew-2", attendanceRecordId: "att-2", operationId: "op-2" }),
    ];
    const intent = resolveAttendanceLocationIntent({
      checkInCandidates: [],
      checkoutCandidates: candidates,
      hasJustifiedWorkdayInWindow: false,
    });
    assert.equal(intent.kind, "NEEDS_CHECKOUT_INTENT");
    if (intent.kind === "NEEDS_CHECKOUT_INTENT") {
      assert.equal(intent.candidates.length, 2);
    }
  });

  it("returns AMBIGUOUS_MIXED when both check-in and checkout exist", () => {
    const intent = resolveAttendanceLocationIntent({
      checkInCandidates: [baseCheckIn({ employeeWorkdayId: "ew-in" })],
      checkoutCandidates: [
        baseCheckout({ employeeWorkdayId: "ew-out", attendanceRecordId: "att-1" }),
      ],
      hasJustifiedWorkdayInWindow: false,
    });
    assert.equal(intent.kind, "AMBIGUOUS_MIXED");
  });
});
