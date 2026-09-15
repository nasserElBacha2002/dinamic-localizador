import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAssignEmployeePayload,
  buildAssignEmployeesBatchPayload,
  buildCreateOperationPayload,
  getCompanyWorkingIsoDays,
  isOvernightShift,
} from "./operation-shift-payload";
import type { OperationFormValues } from "../schemas/operation.schema";
import { createDefaultWeeklySchedule, type CompanyWorkSchedule } from "../types/schedule";

function baseForm(overrides: Partial<OperationFormValues> = {}): OperationFormValues {
  return {
    operationKind: "ONE_TIME",
    serviceId: "11111111-1111-1111-1111-111111111111",
    scheduledStart: "2026-09-20T08:00",
    scheduledEnd: "",
    validFrom: "2026-09-20",
    validUntil: "",
    scheduleSource: "COMPANY",
    scheduleDays: createDefaultWeeklySchedule("08:00", "16:00"),
    earlyToleranceMinutes: 10,
    lateToleranceMinutes: 10,
    earlyToleranceSource: "COMPANY_DEFAULT",
    lateToleranceSource: "COMPANY_DEFAULT",
    scheduleMode: "SINGLE",
    shifts: [],
    ...overrides,
  };
}

describe("operation-shift-payload", () => {
  it("maps company laborable days to ISO weekdays", () => {
    const schedule: CompanyWorkSchedule = {
      id: "sch-1",
      companyId: "co-1",
      timezone: "America/Argentina/Buenos_Aires",
      version: 1,
      days: createDefaultWeeklySchedule("09:00", "18:00").map((day) =>
        day.dayOfWeek === "FRIDAY"
          ? { ...day, isEnabled: false, startTime: null, endTime: null }
          : day,
      ),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    assert.deepEqual(getCompanyWorkingIsoDays(schedule), [1, 2, 3, 4]);
    assert.deepEqual(getCompanyWorkingIsoDays(null), [1, 2, 3, 4, 5]);
  });

  it("SINGLE assign omits operationShiftId", () => {
    const payload = buildAssignEmployeePayload("SINGLE", {
      employeeId: "e1",
      validFrom: "2026-07-13",
      operationShiftId: "shift-ignored",
    });
    assert.equal(payload.employeeId, "e1");
    assert.equal(payload.validFrom, "2026-07-13");
    assert.equal(payload.operationShiftId, undefined);
  });

  it("MULTI_SHIFT assign includes operationShiftId", () => {
    const payload = buildAssignEmployeePayload("MULTI_SHIFT", {
      employeeId: "e1",
      operationShiftId: "shift-1",
    });
    assert.equal(payload.operationShiftId, "shift-1");
  });

  it("MULTI_SHIFT batch includes operationShiftId", () => {
    const payload = buildAssignEmployeesBatchPayload("MULTI_SHIFT", {
      employeeIds: ["e1", "e2"],
      operationShiftId: "shift-1",
    });
    assert.deepEqual(payload.employeeIds, ["e1", "e2"]);
    assert.equal(payload.operationShiftId, "shift-1");
  });

  it("coverage payload sends asCoverage fields and omits operationShiftId by default", () => {
    const payload = buildAssignEmployeePayload("MULTI_SHIFT", {
      employeeId: "cover-1",
      asCoverage: true,
      replacedAssignmentId: "asn-1",
      replacedEmployeeId: "emp-replaced",
    });
    assert.equal(payload.asCoverage, true);
    assert.equal(payload.replacedAssignmentId, "asn-1");
    assert.equal(payload.replacedEmployeeId, "emp-replaced");
    assert.equal(payload.operationShiftId, undefined);
  });

  it("coverage payload includes operationShiftId only when provided", () => {
    const payload = buildAssignEmployeePayload("MULTI_SHIFT", {
      employeeId: "cover-1",
      asCoverage: true,
      replacedAssignmentId: "asn-1",
      operationShiftId: "shift-same",
    });
    assert.equal(payload.operationShiftId, "shift-same");
  });

  it("detects overnight when end is before start", () => {
    assert.equal(isOvernightShift("22:00", "06:00"), true);
    assert.equal(isOvernightShift("08:00", "16:00"), false);
    assert.equal(isOvernightShift("00:00", "08:00"), false);
  });

  it("SINGLE create omits scheduleMode MULTI fields and shifts", () => {
    const payload = buildCreateOperationPayload(baseForm());
    assert.equal(payload.operationKind, "ONE_TIME");
    assert.equal("scheduleMode" in payload, false);
    assert.equal("shifts" in payload, false);
  });

  it("MULTI create sends scheduleMode and shifts", () => {
    const payload = buildCreateOperationPayload(
      baseForm({
        scheduleMode: "MULTI_SHIFT",
        shifts: [
          {
            code: "MANANA",
            name: "Mañana",
            startTime: "08:00",
            endTime: "16:00",
          },
        ],
      }),
    );
    assert.equal(payload.scheduleMode, "MULTI_SHIFT");
    assert.equal(payload.shifts?.length, 1);
    assert.equal(payload.shifts?.[0]?.code, "MANANA");
  });
});
