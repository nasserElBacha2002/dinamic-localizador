import assert from "node:assert/strict";
import { after, before, it } from "node:test";
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
import { getTodayAbsenceDateIso } from "../utils/absence-date";
import { addDaysToDateIso } from "../utils/recurring-workday-instant";
import { absenceCalendarService } from "./absence-calendar.service";
import { absenceRequestService } from "./absence-request.service";

const COMPANY_TZ = "America/Argentina/Buenos_Aires";

const uniqueCompanyName = (): string =>
  `Absence Cal ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const uniquePhone = (): string => `+54911${Date.now().toString().slice(-8)}`;

/** Next Monday at least `minDaysAhead` days from company today (UTC weekday of ISO date). */
const futureMondayIso = (minDaysAhead = 14): string => {
  let iso = addDaysToDateIso(getTodayAbsenceDateIso(COMPANY_TZ), minDaysAhead);
  for (let i = 0; i < 7; i += 1) {
    const [year, month, day] = iso.split("-").map(Number);
    const dow = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
    if (dow === 1) {
      return iso;
    }
    iso = addDaysToDateIso(iso, 1);
  }
  return iso;
};

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
    await absenceCalendarService.bootstrapDefaultCalendar(companyId);
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

    const previewStart = futureMondayIso(14);
    const previewEnd = addDaysToDateIso(previewStart, 2);
    const preview = await absenceCalendarService.preview(companyId, {
      employeeId: employee.id,
      absenceTypeId: vacation.id,
      startDate: previewStart,
      endDate: previewEnd,
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
    });
    assert.equal(preview.totalDays, 3);
    assert.equal(preview.countingMode, "CALENDAR_DAYS");

    const createStart = addDaysToDateIso(previewStart, 7);
    const createEnd = addDaysToDateIso(createStart, 2);
    const created = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employee.id,
        absenceTypeId: vacation.id,
        startDate: createStart,
        endDate: createEnd,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Viaje de prueba calendario",
      },
      actorUserId,
    );
    assert.equal(created.totalDays, 3);
    assert.equal(created.calculationMode, "CALENDAR_DAYS");
    // Flag off → legacy path: no calendar snapshot (preserves pre–Phase 2 behavior).
    assert.equal(created.calendarId, null);
  });

  it("rejects stale expectedVersion on calendar update", async () => {
    const companyId = await seedCompany();
    await absenceCalendarService.bootstrapDefaultCalendar(companyId);
    const calendar = await absenceCalendarService.getDefaultCalendar(companyId);

    await absenceCalendarService.updateCalendar(
      companyId,
      calendar.id,
      {
        name: "Calendario v2",
        expectedVersion: calendar.version,
      },
      actorUserId,
    );

    await assert.rejects(
      () =>
        absenceCalendarService.updateCalendar(
          companyId,
          calendar.id,
          {
            name: "Stale",
            expectedVersion: calendar.version,
          },
          actorUserId,
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "ABSENCE_CALENDAR_CONFLICT",
    );

    const refreshed = await absenceCalendarService.getDefaultCalendar(companyId);
    assert.equal(refreshed.version, calendar.version + 1);
  });

  it("rejects deactivating a calendar referenced by an active type", async () => {
    const companyId = await seedCompany();
    await absenceCalendarService.bootstrapDefaultCalendar(companyId);
    const calendar = await absenceCalendarService.getDefaultCalendar(companyId);
    const types = await absenceTypeRepository.listAll(companyId, true);
    const vacation = types.find((type) => type.code === "VACATION");
    assert.ok(vacation);
    const { absenceTypeService } = await import("./absence-type.service");
    await absenceTypeService.update(
      companyId,
      vacation.id,
      { dayCountingMode: "BUSINESS_DAYS", calendarId: calendar.id },
      actorUserId,
    );

    await assert.rejects(
      () =>
        absenceCalendarService.updateCalendar(
          companyId,
          calendar.id,
          {
            isActive: false,
            expectedVersion: calendar.version,
          },
          actorUserId,
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "ABSENCE_CALENDAR_IN_USE",
    );
  });

  it("rejects invalid IANA timezone on calendar create", async () => {
    const companyId = await seedCompany();
    await assert.rejects(
      () =>
        absenceCalendarService.createCalendar(
          companyId,
          {
            name: "Bad TZ",
            timezone: "Not/A_Real_Zone",
            isDefault: false,
          },
          actorUserId,
        ),
      (error: unknown) => error instanceof AppError && error.code === "INVALID_TIMEZONE",
    );
  });

  it("applies business days after holiday override", async () => {
    const companyId = await seedCompany();
    await absenceCalendarService.bootstrapDefaultCalendar(companyId);
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE company_settings
        SET absence_advanced_calendar_enabled = 1
        WHERE company_id = @companyId
      `);
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

    const monday = futureMondayIso(14);
    const wednesday = addDaysToDateIso(monday, 2);
    const friday = addDaysToDateIso(monday, 4);

    await absenceCalendarService.createDate(companyId, {
      calendarId: calendar.id,
      date: wednesday,
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
      startDate: monday,
      endDate: friday,
      startPeriod: "FULL_DAY",
      endPeriod: "FULL_DAY",
    });
    assert.equal(preview.totalDays, 4);
    assert.equal(preview.holidayDays, 1);
  });

  it("rejects cross-company calendar date access and duplicates", async () => {
    const companyA = await seedCompany();
    const companyB = await seedCompany();
    await absenceCalendarService.bootstrapDefaultCalendar(companyA);
    await absenceCalendarService.bootstrapDefaultCalendar(companyB);
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

  it("GET default does not create calendars", async () => {
    const companyId = await seedCompany();
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        DELETE FROM company_calendar_dates WHERE company_id = @companyId;
        DELETE FROM company_work_calendar_weekdays WHERE company_id = @companyId;
        DELETE FROM company_work_calendars WHERE company_id = @companyId;
      `);

    await assert.rejects(
      () => absenceCalendarService.getDefaultCalendar(companyId),
      (error: unknown) => error instanceof AppError && error.code === "ABSENCE_CALENDAR_NOT_FOUND",
    );
    const listed = await absenceCalendarService.listCalendars(companyId);
    assert.equal(listed.length, 0);
  });

  it("configures BUSINESS_DAYS via type policy and creates request", async () => {
    const companyId = await seedCompany();
    await absenceCalendarService.bootstrapDefaultCalendar(companyId);
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE company_settings
        SET absence_advanced_calendar_enabled = 1
        WHERE company_id = @companyId
      `);

    const { absenceTypeService } = await import("./absence-type.service");
    const types = await absenceTypeRepository.listAll(companyId, true);
    const vacation = types.find((type) => type.code === "VACATION");
    assert.ok(vacation);
    const calendar = await absenceCalendarService.getDefaultCalendar(companyId);

    const updatedType = await absenceTypeService.update(
      companyId,
      vacation.id,
      { dayCountingMode: "BUSINESS_DAYS", calendarId: calendar.id },
      actorUserId,
    );
    assert.equal(updatedType.dayCountingMode, "BUSINESS_DAYS");
    assert.equal(updatedType.calendarId, calendar.id);

    const monday = futureMondayIso(21);
    const wednesday = addDaysToDateIso(monday, 2);
    const friday = addDaysToDateIso(monday, 4);

    await absenceCalendarService.createDate(companyId, {
      calendarId: calendar.id,
      date: wednesday,
      name: "Feriado policy",
      dateType: "HOLIDAY",
      isWorkingDay: false,
    });

    const employee = await employeeRepository.create(companyId, {
      name: "Policy Emp",
      phoneNumber: uniquePhone(),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
    });

    const created = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employee.id,
        absenceTypeId: vacation.id,
        startDate: monday,
        endDate: friday,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Prueba business days policy",
      },
      actorUserId,
    );
    assert.equal(created.totalDays, 4);
    assert.equal(created.calculationMode, "BUSINESS_DAYS");
    assert.ok(created.calculationInputHash);
  });
});
