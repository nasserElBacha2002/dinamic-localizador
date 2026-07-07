import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { AppError } from "../errors/app-error";
import { companyWorkScheduleRepository } from "../repositories/company-work-schedule.repository";
import { operationScheduleRepository } from "../repositories/operation-schedule.repository";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { WEEKDAYS } from "../constants/weekday";

const COMPANY_ID = "company-1";

const companySchedule = {
  id: "cws-1",
  companyId: COMPANY_ID,
  timezone: "America/Argentina/Buenos_Aires",
  version: 3,
  days: WEEKDAYS.map((dayOfWeek) => ({
    dayOfWeek,
    isEnabled: dayOfWeek !== "SATURDAY" && dayOfWeek !== "SUNDAY",
    startTime: dayOfWeek !== "SATURDAY" && dayOfWeek !== "SUNDAY" ? "09:00" : null,
    endTime: dayOfWeek !== "SATURDAY" && dayOfWeek !== "SUNDAY" ? "18:00" : null,
  })),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("recurringScheduleService.resolveEffectiveSchedule", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("resolves COMPANY schedule from company aggregate only", async () => {
    setupUnitTestEnv();
    const { recurringScheduleService } = await import("./recurring-schedule.service");

    let loadCount = 0;
    mock.method(companyWorkScheduleRepository, "findByCompanyId", async () => {
      loadCount += 1;
      return companySchedule;
    });

    const effective = await recurringScheduleService.resolveEffectiveSchedule(COMPANY_ID, {
      id: "os-1",
      companyId: COMPANY_ID,
      operationId: "operation-1",
      scheduleSource: "COMPANY",
      timezone: null,
      validFrom: "2026-08-01",
      validUntil: null,
      version: 99,
      days: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    assert.equal(loadCount, 1);
    assert.equal(effective.scheduleSource, "COMPANY");
    assert.equal(effective.timezone, companySchedule.timezone);
    assert.equal(effective.version, companySchedule.version);
    assert.equal(effective.days.length, 7);
  });

  it("loads company schedule once per workDate resolution", async () => {
    setupUnitTestEnv();
    const { recurringScheduleService } = await import("./recurring-schedule.service");

    let loadCount = 0;
    mock.method(companyWorkScheduleRepository, "findByCompanyId", async () => {
      loadCount += 1;
      return companySchedule;
    });

    await recurringScheduleService.resolveForWorkDate(
      COMPANY_ID,
      {
        id: "os-1",
        companyId: COMPANY_ID,
        operationId: "operation-1",
        scheduleSource: "COMPANY",
        timezone: null,
        validFrom: "2026-08-01",
        validUntil: null,
        version: 99,
        days: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      "2026-08-03",
    );

    assert.equal(loadCount, 1);
  });
});

describe("operationService.createRecurring COMPANY validation", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("rejects COMPANY creation when company schedule is missing", async () => {
    setupUnitTestEnv();
    const { companyOperationalDefaultsResolver } = await import(
      "./company-operational-defaults.resolver"
    );
    const { operationService } = await import("./operation.service");
    const { serviceRepository } = await import("../repositories/service.repository");

    mock.method(companyOperationalDefaultsResolver, "getOperationDefaults", async () => ({
      companyId: COMPANY_ID,
      earlyToleranceMinutes: 15,
      lateToleranceMinutes: 20,
      source: "company_settings" as const,
    }));
    mock.method(serviceRepository, "findById", async () => ({
      id: "service-1",
      name: "Service 1",
      address: "Addr",
      neighborhood: null,
      locality: null,
      serviceFormat: null,
      latitude: -34.6,
      longitude: -58.38,
      allowedRadiusMeters: 150,
      googlePlaceId: null,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mock.method(companyWorkScheduleRepository, "findByCompanyId", async () => null);

    await assert.rejects(
      () =>
        operationService.create(COMPANY_ID, {
          operationKind: "RECURRING",
          serviceId: "00000000-0000-4000-8000-000000000001",
          validFrom: "2026-08-01",
          scheduleSource: "COMPANY",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "COMPANY_WORK_SCHEDULE_NOT_FOUND",
    );
  });
});

describe("companyWorkScheduleService.update no-op", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("returns current schedule without repository replace for identical payload", async () => {
    setupUnitTestEnv();
    const { companyWorkScheduleService } = await import("./company-work-schedule.service");
    const { companySettingsRepository } = await import("../repositories/company-settings.repository");

    mock.method(companySettingsRepository, "findByCompanyId", async () => ({
      operationTimezone: "America/Argentina/Buenos_Aires",
    }));
    mock.method(companyWorkScheduleRepository, "findByCompanyId", async () => companySchedule);

    let replaceCalls = 0;
    mock.method(companyWorkScheduleRepository, "replaceInTransaction", async () => {
      replaceCalls += 1;
      return companySchedule;
    });

    const result = await companyWorkScheduleService.update(COMPANY_ID, {
      timezone: companySchedule.timezone,
      days: companySchedule.days,
    });

    assert.equal(replaceCalls, 0);
    assert.equal(result.id, companySchedule.id);
    assert.equal(result.version, companySchedule.version);
  });
});

describe("operationScheduleSummaryService batch hydration", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("uses batched findByOperationIds instead of per-operation lookup", async () => {
    setupUnitTestEnv();
    const { operationScheduleSummaryService } = await import("./operation-schedule-summary.service");

    const recurringOps = [
      { id: "op-1", operationKind: "RECURRING" as const },
      { id: "op-2", operationKind: "RECURRING" as const },
    ];

    let batchCalls = 0;
    let singleCalls = 0;

    mock.method(operationScheduleRepository, "findByOperationIds", async () => {
      batchCalls += 1;
      return new Map([
        [
          "op-1",
          {
            id: "os-1",
            companyId: COMPANY_ID,
            operationId: "op-1",
            scheduleSource: "COMPANY",
            timezone: null,
            validFrom: "2026-08-01",
            validUntil: null,
            version: 1,
            days: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        [
          "op-2",
          {
            id: "os-2",
            companyId: COMPANY_ID,
            operationId: "op-2",
            scheduleSource: "COMPANY",
            timezone: null,
            validFrom: "2026-08-01",
            validUntil: null,
            version: 1,
            days: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      ]);
    });

    mock.method(operationScheduleRepository, "findByOperationId", async () => {
      singleCalls += 1;
      return null;
    });

    mock.method(companyWorkScheduleRepository, "findByCompanyId", async () => companySchedule);

    const summaries = await operationScheduleSummaryService.buildSummariesForOperations(
      COMPANY_ID,
      recurringOps as never,
    );

    assert.equal(batchCalls, 1);
    assert.equal(singleCalls, 0);
    assert.equal(summaries.size, 2);
  });
});
