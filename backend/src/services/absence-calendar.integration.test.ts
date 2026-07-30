import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { getPool } from "../database/connection";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { AppError } from "../errors/app-error";
import { absenceCalendarService } from "./absence-calendar.service";
import { absenceRequestService } from "./absence-request.service";

const uniqueCompanyName = (): string =>
  `Absence Cal ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const uniquePhone = (): string => `+54911${Date.now().toString().slice(-8)}`;

describeDatabaseIntegration("absence calendar phase 2 integration", () => {
  const createdCompanyIds: string[] = [];
  let actorUserId = "";

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    const pool = getPool();
    for (const companyId of createdCompanyIds) {
      await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
        DELETE FROM absence_request_events WHERE company_id = @companyId;
        DELETE FROM absence_workday_sync_jobs WHERE company_id = @companyId;
        DELETE FROM absence_requests WHERE company_id = @companyId;
        DELETE FROM employee_absence_balances WHERE company_id = @companyId;
        DELETE FROM employees WHERE company_id = @companyId;
        DELETE FROM employee_categories WHERE company_id = @companyId;
        DELETE FROM company_absence_settings WHERE company_id = @companyId;
        UPDATE absence_types SET calendar_id = NULL WHERE company_id = @companyId;
        DELETE FROM company_calendar_dates WHERE company_id = @companyId;
        DELETE FROM company_work_calendar_weekdays WHERE company_id = @companyId;
        DELETE FROM company_work_calendars WHERE company_id = @companyId;
        DELETE FROM absence_types WHERE company_id = @companyId;
        DELETE FROM user_company_memberships WHERE company_id = @companyId;
        DELETE FROM company_settings WHERE company_id = @companyId;
        DELETE FROM company_modules WHERE company_id = @companyId;
        DELETE FROM company_location_types WHERE company_id = @companyId;
        DELETE FROM company_work_schedule_days WHERE company_id = @companyId;
        DELETE FROM company_work_schedules WHERE company_id = @companyId;
        DELETE FROM user_invitations WHERE company_id = @companyId;
        DELETE FROM audit_logs WHERE company_id = @companyId;
        DELETE FROM companies WHERE id = @companyId;
      `);
    }
    await teardownDatabaseIntegration();
  });

  const seedCompany = async () => {
    const { userRepository } = await import("../repositories/user.repository");
    const admin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(admin);
    actorUserId = admin.id;

    const created = await createPlatformCompanyFixture({
      name: uniqueCompanyName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Cal Owner",
        email: `cal-owner-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@integration.test`,
      },
    });
    const companyId = created.data.company.id;
    createdCompanyIds.push(companyId);
    return companyId;
  };

  it("backfills default calendar and preserves calendar-day totals", async () => {
    const companyId = await seedCompany();
    const calendar = await absenceCalendarService.getDefaultCalendar(companyId);
    assert.equal(calendar.isDefault, true);
    assert.equal(calendar.weekdays.length, 7);

    const types = await absenceTypeRepository.listAll(companyId, true);
    const vacation = types.find((type) => type.code === "VACATION") ?? types[0];
    assert.ok(vacation);

    const employee = await employeeRepository.create(companyId, {
      name: "Cal Employee",
      phoneNumber: uniquePhone(),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
    });

    const preview = await absenceCalendarService.preview(companyId, {
      employeeId: employee.id,
      absenceTypeId: vacation.id,
      startDate: "2026-08-03",
      endDate: "2026-08-05",
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
    });
    assert.equal(preview.totalDays, 3);
    assert.equal(preview.countingMode, "CALENDAR_DAYS");

    const created = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employee.id,
        absenceTypeId: vacation.id,
        startDate: "2026-08-10",
        endDate: "2026-08-12",
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Viaje de prueba calendario",
      },
      actorUserId,
    );
    assert.equal(created.totalDays, 3);
    assert.equal(created.calculationMode, "CALENDAR_DAYS");
    assert.ok(created.calendarId);
  });

  it("applies business days after holiday override", async () => {
    const companyId = await seedCompany();
    const calendar = await absenceCalendarService.getDefaultCalendar(companyId);
    const types = await absenceTypeRepository.listAll(companyId, true);
    const vacation = types.find((type) => type.code === "VACATION") ?? types[0];
    assert.ok(vacation);

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("typeId", sql.UniqueIdentifier, vacation.id)
      .query(`
        UPDATE absence_types
        SET day_counting_mode = N'BUSINESS_DAYS'
        WHERE company_id = @companyId AND id = @typeId
      `);

    await absenceCalendarService.createDate(companyId, {
      calendarId: calendar.id,
      date: "2026-08-05",
      name: "Feriado prueba",
      dateType: "HOLIDAY",
      isWorkingDay: false,
    });

    const employee = await employeeRepository.create(companyId, {
      name: "Biz Employee",
      phoneNumber: uniquePhone(),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
    });

    const preview = await absenceCalendarService.preview(companyId, {
      employeeId: employee.id,
      absenceTypeId: vacation.id,
      startDate: "2026-08-03",
      endDate: "2026-08-07",
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
    });
    assert.equal(preview.totalDays, 4);
    assert.equal(preview.holidayDays, 1);
  });

  it("rejects cross-company calendar date access and duplicates", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    const calendarA = await absenceCalendarService.getDefaultCalendar(companyA);
    const calendarB = await absenceCalendarService.getDefaultCalendar(companyB);

    await absenceCalendarService.createDate(companyA, {
      calendarId: calendarA.id,
      date: "2026-09-01",
      name: "Feriado A",
      dateType: "HOLIDAY",
      isWorkingDay: false,
    });

    await assert.rejects(
      () =>
        absenceCalendarService.createDate(companyB, {
          calendarId: calendarA.id,
          date: "2026-09-02",
          name: "Intruso",
          dateType: "HOLIDAY",
          isWorkingDay: false,
        }),
      (error: unknown) => error instanceof AppError && error.code === "ABSENCE_CALENDAR_NOT_FOUND",
    );

    const datesB = await absenceCalendarService.listDates(companyB, calendarB.id, { year: 2026 });
    assert.equal(
      datesB.some((item) => item.date === "2026-09-01"),
      false,
    );

    await assert.rejects(
      () =>
        absenceCalendarService.createDate(companyA, {
          calendarId: calendarA.id,
          date: "2026.09.01".replace(/\./g, "-"),
          name: "Duplicado",
          dateType: "HOLIDAY",
          isWorkingDay: false,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "ABSENCE_CALENDAR_DATE_DUPLICATE",
    );
  });
});
