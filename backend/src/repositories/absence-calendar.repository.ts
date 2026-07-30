import sql from "mssql";
import { getPool } from "../database/connection";
import type { AbsenceCalendarDateType } from "../constants/absence-calendar";
import type { WeekdayNumber } from "../constants/weekday";
import type {
  CompanyCalendarDate,
  CompanyWorkCalendar,
  CompanyWorkCalendarWeekday,
} from "../types/absence-calendar";
import { toDateOnlyString } from "../utils/row-mappers";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapWeekdayRow = (row: Record<string, unknown>): CompanyWorkCalendarWeekday => ({
  id: String(row.id),
  companyId: String(row.company_id),
  calendarId: String(row.calendar_id),
  dayOfWeek: Number(row.day_of_week) as WeekdayNumber,
  isWorkingDay: Boolean(row.is_working_day),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

const mapCalendarRow = (
  row: Record<string, unknown>,
  weekdays: CompanyWorkCalendarWeekday[],
): CompanyWorkCalendar => ({
  id: String(row.id),
  companyId: String(row.company_id),
  name: String(row.name),
  isDefault: Boolean(row.is_default),
  timezone: String(row.timezone),
  isActive: Boolean(row.is_active),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
  weekdays,
});

const mapDateRow = (row: Record<string, unknown>): CompanyCalendarDate => ({
  id: String(row.id),
  companyId: String(row.company_id),
  calendarId: String(row.calendar_id),
  date: toDateOnlyString(row.date as Date | string),
  name: String(row.name),
  dateType: String(row.date_type) as AbsenceCalendarDateType,
  isWorkingDay: Boolean(row.is_working_day),
  notes: row.notes ? String(row.notes) : null,
  isActive: Boolean(row.is_active),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

const loadWeekdays = async (
  calendarId: string,
  transaction?: sql.Transaction,
): Promise<CompanyWorkCalendarWeekday[]> => {
  const request = transaction ? new sql.Request(transaction) : getPool().request();
  const result = await request
    .input("calendarId", sql.UniqueIdentifier, calendarId)
    .query(`
      SELECT *
      FROM company_work_calendar_weekdays
      WHERE calendar_id = @calendarId
      ORDER BY day_of_week ASC
    `);
  return result.recordset.map((row) => mapWeekdayRow(row as Record<string, unknown>));
};

export const absenceCalendarRepository = {
  async listCalendars(companyId: string): Promise<CompanyWorkCalendar[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT *
        FROM company_work_calendars
        WHERE company_id = @companyId
        ORDER BY is_default DESC, name ASC
      `);

    const calendars: CompanyWorkCalendar[] = [];
    for (const row of result.recordset) {
      const mapped = row as Record<string, unknown>;
      const weekdays = await loadWeekdays(String(mapped.id));
      calendars.push(mapCalendarRow(mapped, weekdays));
    }
    return calendars;
  },

  async findCalendarById(
    companyId: string,
    calendarId: string,
    transaction?: sql.Transaction,
  ): Promise<CompanyWorkCalendar | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("calendarId", sql.UniqueIdentifier, calendarId)
      .query(`
        SELECT TOP 1 *
        FROM company_work_calendars
        WHERE id = @calendarId AND company_id = @companyId
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    const weekdays = await loadWeekdays(calendarId, transaction);
    return mapCalendarRow(row, weekdays);
  },

  async findDefaultCalendar(
    companyId: string,
    transaction?: sql.Transaction,
  ): Promise<CompanyWorkCalendar | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 *
        FROM company_work_calendars
        WHERE company_id = @companyId AND is_default = 1 AND is_active = 1
        ORDER BY updated_at DESC
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    const weekdays = await loadWeekdays(String(row.id), transaction);
    return mapCalendarRow(row, weekdays);
  },

  async createCalendar(
    companyId: string,
    input: {
      name: string;
      timezone: string;
      isDefault: boolean;
      weekdays: Array<{ dayOfWeek: WeekdayNumber; isWorkingDay: boolean }>;
    },
    transaction: sql.Transaction,
  ): Promise<CompanyWorkCalendar> {
    if (input.isDefault) {
      await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          UPDATE company_work_calendars
          SET is_default = 0, updated_at = SYSUTCDATETIME()
          WHERE company_id = @companyId AND is_default = 1
        `);
    }

    const insert = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(120), input.name)
      .input("timezone", sql.NVarChar(80), input.timezone)
      .input("isDefault", sql.Bit, input.isDefault ? 1 : 0)
      .query(`
        INSERT INTO company_work_calendars (company_id, name, is_default, timezone, is_active)
        OUTPUT INSERTED.*
        VALUES (@companyId, @name, @isDefault, @timezone, 1)
      `);

    const calendarId = String(insert.recordset[0].id);
    for (const day of input.weekdays) {
      await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("calendarId", sql.UniqueIdentifier, calendarId)
        .input("dayOfWeek", sql.Int, day.dayOfWeek)
        .input("isWorkingDay", sql.Bit, day.isWorkingDay ? 1 : 0)
        .query(`
          INSERT INTO company_work_calendar_weekdays
            (company_id, calendar_id, day_of_week, is_working_day)
          VALUES (@companyId, @calendarId, @dayOfWeek, @isWorkingDay)
        `);
    }

    const created = await this.findCalendarById(companyId, calendarId, transaction);
    if (!created) {
      throw new Error("CALENDAR_CREATE_FAILED");
    }
    return created;
  },

  async updateCalendar(
    companyId: string,
    calendarId: string,
    input: {
      name?: string;
      timezone?: string;
      isDefault?: boolean;
      isActive?: boolean;
      weekdays?: Array<{ dayOfWeek: WeekdayNumber; isWorkingDay: boolean }>;
      expectedUpdatedAt: string;
    },
    transaction: sql.Transaction,
  ): Promise<CompanyWorkCalendar | null> {
    const existing = await this.findCalendarById(companyId, calendarId, transaction);
    if (!existing) {
      return null;
    }
    if (new Date(existing.updatedAt).toISOString() !== new Date(input.expectedUpdatedAt).toISOString()) {
      return null;
    }

    if (input.isDefault === true) {
      await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("calendarId", sql.UniqueIdentifier, calendarId)
        .query(`
          UPDATE company_work_calendars
          SET is_default = 0, updated_at = SYSUTCDATETIME()
          WHERE company_id = @companyId AND is_default = 1 AND id <> @calendarId
        `);
    }

    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("calendarId", sql.UniqueIdentifier, calendarId)
      .input("name", sql.NVarChar(120), input.name ?? existing.name)
      .input("timezone", sql.NVarChar(80), input.timezone ?? existing.timezone)
      .input("isDefault", sql.Bit, (input.isDefault ?? existing.isDefault) ? 1 : 0)
      .input("isActive", sql.Bit, (input.isActive ?? existing.isActive) ? 1 : 0)
      .input("expectedUpdatedAt", sql.DateTime2, new Date(input.expectedUpdatedAt))
      .query(`
        UPDATE company_work_calendars
        SET
          name = @name,
          timezone = @timezone,
          is_default = @isDefault,
          is_active = @isActive,
          updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @calendarId
          AND company_id = @companyId
          AND updated_at = @expectedUpdatedAt
      `);

    if (!result.recordset[0]) {
      return null;
    }

    if (input.weekdays) {
      for (const day of input.weekdays) {
        await new sql.Request(transaction)
          .input("calendarId", sql.UniqueIdentifier, calendarId)
          .input("dayOfWeek", sql.Int, day.dayOfWeek)
          .input("isWorkingDay", sql.Bit, day.isWorkingDay ? 1 : 0)
          .query(`
            UPDATE company_work_calendar_weekdays
            SET is_working_day = @isWorkingDay, updated_at = SYSUTCDATETIME()
            WHERE calendar_id = @calendarId AND day_of_week = @dayOfWeek
          `);
      }
    }

    return this.findCalendarById(companyId, calendarId, transaction);
  },

  async listDates(
    companyId: string,
    calendarId: string,
    options?: { year?: number; includeInactive?: boolean },
  ): Promise<CompanyCalendarDate[]> {
    const pool = getPool();
    const filters: string[] = ["company_id = @companyId", "calendar_id = @calendarId"];
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("calendarId", sql.UniqueIdentifier, calendarId);

    if (!options?.includeInactive) {
      filters.push("is_active = 1");
    }
    if (options?.year != null) {
      filters.push("YEAR([date]) = @year");
      request.input("year", sql.Int, options.year);
    }

    const result = await request.query(`
      SELECT *
      FROM company_calendar_dates
      WHERE ${filters.join(" AND ")}
      ORDER BY [date] ASC
    `);

    return result.recordset.map((row) => mapDateRow(row as Record<string, unknown>));
  },

  async listDatesInRange(
    companyId: string,
    calendarId: string,
    startDate: string,
    endDate: string,
    transaction?: sql.Transaction,
  ): Promise<CompanyCalendarDate[]> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("calendarId", sql.UniqueIdentifier, calendarId)
      .input("startDate", sql.Date, startDate)
      .input("endDate", sql.Date, endDate)
      .query(`
        SELECT *
        FROM company_calendar_dates
        WHERE company_id = @companyId
          AND calendar_id = @calendarId
          AND is_active = 1
          AND [date] >= @startDate
          AND [date] <= @endDate
        ORDER BY [date] ASC
      `);
    return result.recordset.map((row) => mapDateRow(row as Record<string, unknown>));
  },

  async createDate(
    companyId: string,
    input: {
      calendarId: string;
      date: string;
      name: string;
      dateType: AbsenceCalendarDateType;
      isWorkingDay: boolean;
      notes?: string | null;
    },
    transaction: sql.Transaction,
  ): Promise<CompanyCalendarDate> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("calendarId", sql.UniqueIdentifier, input.calendarId)
      .input("date", sql.Date, input.date)
      .input("name", sql.NVarChar(200), input.name)
      .input("dateType", sql.NVarChar(40), input.dateType)
      .input("isWorkingDay", sql.Bit, input.isWorkingDay ? 1 : 0)
      .input("notes", sql.NVarChar(500), input.notes ?? null)
      .query(`
        INSERT INTO company_calendar_dates (
          company_id, calendar_id, [date], name, date_type, is_working_day, notes, is_active
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @calendarId, @date, @name, @dateType, @isWorkingDay, @notes, 1
        )
      `);
    return mapDateRow(result.recordset[0] as Record<string, unknown>);
  },

  async updateDate(
    companyId: string,
    dateId: string,
    input: {
      name?: string;
      dateType?: AbsenceCalendarDateType;
      isWorkingDay?: boolean;
      notes?: string | null;
      isActive?: boolean;
      expectedUpdatedAt: string;
    },
    transaction: sql.Transaction,
  ): Promise<CompanyCalendarDate | null> {
    const existingResult = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("dateId", sql.UniqueIdentifier, dateId)
      .query(`
        SELECT TOP 1 *
        FROM company_calendar_dates
        WHERE id = @dateId AND company_id = @companyId
      `);
    const existing = existingResult.recordset[0] as Record<string, unknown> | undefined;
    if (!existing) {
      return null;
    }

    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("dateId", sql.UniqueIdentifier, dateId)
      .input("name", sql.NVarChar(200), input.name ?? String(existing.name))
      .input("dateType", sql.NVarChar(40), input.dateType ?? String(existing.date_type))
      .input(
        "isWorkingDay",
        sql.Bit,
        (input.isWorkingDay ?? Boolean(existing.is_working_day)) ? 1 : 0,
      )
      .input(
        "notes",
        sql.NVarChar(500),
        input.notes !== undefined
          ? input.notes
          : existing.notes
            ? String(existing.notes)
            : null,
      )
      .input("isActive", sql.Bit, (input.isActive ?? Boolean(existing.is_active)) ? 1 : 0)
      .input("expectedUpdatedAt", sql.DateTime2, new Date(input.expectedUpdatedAt))
      .query(`
        UPDATE company_calendar_dates
        SET
          name = @name,
          date_type = @dateType,
          is_working_day = @isWorkingDay,
          notes = @notes,
          is_active = @isActive,
          updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @dateId
          AND company_id = @companyId
          AND updated_at = @expectedUpdatedAt
      `);

    if (!result.recordset[0]) {
      return null;
    }
    return mapDateRow(result.recordset[0] as Record<string, unknown>);
  },

  async countRequestsUsingCalendar(companyId: string, calendarId: string): Promise<number> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("calendarId", sql.UniqueIdentifier, calendarId)
      .query(`
        SELECT COUNT(1) AS cnt
        FROM absence_requests
        WHERE company_id = @companyId AND calendar_id = @calendarId
      `);
    return Number(result.recordset[0]?.cnt ?? 0);
  },
};
