import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { getDateIsoInTimezone } from "./absence-date";
import { resolveAttendanceSummaryWorkday } from "./operation-attendance-workday-resolver";

const TIMEZONE = "America/Argentina/Buenos_Aires";

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
          return {
            id: "workday-today",
            companyId,
            operationId,
            workDate: today,
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
          };
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
      } as Parameters<typeof resolveAttendanceSummaryWorkday>[2],
      {},
    );

    assert.deepEqual(resolved, {
      operationWorkdayId: "workday-today",
      workDate: today,
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

    mock.method(operationWorkdayRepository, "findByOperationAndWorkDate", async () => ({
      id: "workday-13",
      companyId,
      operationId,
      workDate: targetDate,
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
    }));

    const resolved = await resolveAttendanceSummaryWorkday(
      companyId,
      operationId,
      { id: operationId, companyId, operationKind: "RECURRING" } as Parameters<
        typeof resolveAttendanceSummaryWorkday
      >[2],
      { workDate: targetDate },
    );

    assert.deepEqual(resolved, {
      operationWorkdayId: "workday-13",
      workDate: targetDate,
    });
  });
});
