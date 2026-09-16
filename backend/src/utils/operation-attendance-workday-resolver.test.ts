import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { getDateIsoInTimezone } from "./absence-date";
import { resolveAttendanceSummaryWorkday } from "./operation-attendance-workday-resolver";

const TIMEZONE = "America/Argentina/Buenos_Aires";

const baseWorkday = (overrides: Record<string, unknown> = {}) => ({
  id: "workday-1",
  companyId: "company-1",
  operationId: "operation-1",
  operationShiftId: null,
  shiftCodeSnapshot: null,
  shiftNameSnapshot: null,
  workDate: "2026-07-13",
  expectedStartAt: "2026-07-13T11:00:00.000Z",
  expectedEndAt: null,
  earlyToleranceMinutes: 0,
  lateToleranceMinutes: 0,
  scheduleVersion: 1,
  scheduleSourceSnapshot: null,
  scheduleTimezoneSnapshot: TIMEZONE,
  status: "ACTIVE",
  cancellationReason: null,
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
  ...overrides,
});

describe("resolveAttendanceSummaryWorkday", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("defaults RECURRING operations to today's workday, not the earliest materialized date", async () => {
    const today = getDateIsoInTimezone(new Date(), TIMEZONE);
    const companyId = "company-1";
    const operationId = "operation-1";
    const calls: string[] = [];

    const { companySettingsRepository } = await import(
      "../repositories/company-settings.repository"
    );
    const { operationWorkdayRepository } = await import(
      "../repositories/operation-workday.repository"
    );

    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: TIMEZONE,
    }));

    mock.method(
      operationWorkdayRepository,
      "findByOperationAndWorkDate",
      async (_companyId, _operationId, workDate) => {
        calls.push(workDate);
        if (workDate === today) {
          return baseWorkday({ id: "workday-today", workDate: today });
        }
        return null;
      },
    );

    mock.method(operationWorkdayRepository, "listByOperationId", async () => {
      throw new Error("listByOperationId should not be called for RECURRING default resolution");
    });

    const resolved = await resolveAttendanceSummaryWorkday(
      companyId,
      operationId,
      {
        id: operationId,
        companyId,
        operationKind: "RECURRING",
        scheduleMode: "SINGLE",
      } as Parameters<typeof resolveAttendanceSummaryWorkday>[2],
      {},
    );

    assert.deepEqual(resolved, {
      operationWorkdayId: "workday-today",
      workDate: today,
      operationShiftId: null,
      shiftNameSnapshot: null,
    });
    assert.deepEqual(calls, [today]);
  });

  it("resolves an explicit workDate without using the operation start date", async () => {
    const companyId = "company-1";
    const operationId = "operation-1";
    const targetDate = "2026-07-13";

    const { operationWorkdayRepository } = await import(
      "../repositories/operation-workday.repository"
    );

    mock.method(operationWorkdayRepository, "findByOperationAndWorkDate", async () =>
      baseWorkday({ id: "workday-13", workDate: targetDate }),
    );

    const resolved = await resolveAttendanceSummaryWorkday(
      companyId,
      operationId,
      { id: operationId, companyId, operationKind: "RECURRING", scheduleMode: "SINGLE" } as Parameters<
        typeof resolveAttendanceSummaryWorkday
      >[2],
      { workDate: targetDate },
    );

    assert.deepEqual(resolved, {
      operationWorkdayId: "workday-13",
      workDate: targetDate,
      operationShiftId: null,
      shiftNameSnapshot: null,
    });
  });

  it("MULTI_SHIFT without workdayId requires explicit workday", async () => {
    await assert.rejects(
      () =>
        resolveAttendanceSummaryWorkday(
          "company-1",
          "operation-1",
          {
            id: "operation-1",
            companyId: "company-1",
            operationKind: "ONE_TIME",
            scheduleMode: "MULTI_SHIFT",
          } as Parameters<typeof resolveAttendanceSummaryWorkday>[2],
          {},
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "MULTI_SHIFT_ATTENDANCE_SUMMARY_REQUIRES_WORKDAY",
    );
  });

  it("MULTI_SHIFT with ambiguous workDate requires workdayId", async () => {
    const { operationWorkdayRepository } = await import(
      "../repositories/operation-workday.repository"
    );
    mock.method(operationWorkdayRepository, "listByOperationAndWorkDate", async () => [
      baseWorkday({ id: "w1", operationShiftId: "s1", shiftNameSnapshot: "Mañana" }),
      baseWorkday({ id: "w2", operationShiftId: "s2", shiftNameSnapshot: "Tarde" }),
    ]);

    await assert.rejects(
      () =>
        resolveAttendanceSummaryWorkday(
          "company-1",
          "operation-1",
          {
            id: "operation-1",
            companyId: "company-1",
            scheduleMode: "MULTI_SHIFT",
          } as Parameters<typeof resolveAttendanceSummaryWorkday>[2],
          { workDate: "2026-07-13" },
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "MULTI_SHIFT_ATTENDANCE_SUMMARY_AMBIGUOUS",
    );
  });

  it("MULTI_SHIFT resolves explicit workdayId", async () => {
    const { operationWorkdayRepository } = await import(
      "../repositories/operation-workday.repository"
    );
    mock.method(operationWorkdayRepository, "findById", async () =>
      baseWorkday({
        id: "w-shift",
        operationShiftId: "s1",
        shiftNameSnapshot: "Mañana",
      }),
    );

    const resolved = await resolveAttendanceSummaryWorkday(
      "company-1",
      "operation-1",
      {
        id: "operation-1",
        companyId: "company-1",
        scheduleMode: "MULTI_SHIFT",
      } as Parameters<typeof resolveAttendanceSummaryWorkday>[2],
      { workdayId: "w-shift" },
    );

    assert.equal(resolved?.operationWorkdayId, "w-shift");
    assert.equal(resolved?.operationShiftId, "s1");
    assert.equal(resolved?.shiftNameSnapshot, "Mañana");
  });
});
