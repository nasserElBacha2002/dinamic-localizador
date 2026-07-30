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
  version: Number(row.version ?? 1),
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
  version: Number(row.version ?? 1),
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
    const calendarsResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT *
        FROM company_work_calendars
        WHERE company_id = @companyId
        ORDER BY is_default DESC, name ASC
      `);

    const weekdaysResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT *
        FROM company_work_calendar_weekdays
        WHERE company_id = @companyId
        ORDER BY calendar_id ASC, day_of_week ASC
      `);

    const weekdaysByCalendar = new Map<string, CompanyWorkCalendarWeekday[]>();
    for (const row of weekdaysResult.recordset) {
      const mapped = mapWeekdayRow(row as Record<string, unknown>);
      const list = weekdaysByCalendar.get(mapped.calendarId) ?? [];
      list.push(mapped);
      weekdaysByCalendar.set(mapped.calendarId, list);
    }

    return calendarsResult.recordset.map((row) => {
      const mapped = row as Record<string, unknown>;
      const id = String(mapped.id);
      return mapCalendarRow(mapped, weekdaysByCalendar.get(id) ?? []);
    });
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
      expectedVersion: number;
    },
    transaction: sql.Transaction,
  ): Promise<CompanyWorkCalendar | null> {
    const existing = await this.findCalendarById(companyId, calendarId, transaction);
    if (!existing) {
      return null;
    }

    if (input.isDefault === true) {
      await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("calendarId", sql.UniqueIdentifier, calendarId)
        .query(`
          UPDATE company_work_calendars
          SET is_default = 0, updated_at = SYSUTCDATETIME(), version = version + 1
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
      .input("expectedVersion", sql.Int, input.expectedVersion)
      .query(`
        UPDATE company_work_calendars
        SET
          name = @name,
          timezone = @timezone,
          is_default = @isDefault,
          is_active = @isActive,
          version = version + 1,
          updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @calendarId
          AND company_id = @companyId
          AND version = @expectedVersion
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
      const year = options.year;
      filters.push("[date] >= @yearStart AND [date] < @nextYearStart");
      request.input("yearStart", sql.Date, `${year}-01-01`);
      request.input("nextYearStart", sql.Date, `${year + 1}-01-01`);
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
      expectedVersion: number;
    },
    transaction: sql.Transaction,
  ): Promise<{ previous: CompanyCalendarDate; updated: CompanyCalendarDate } | null> {
    const existingResult = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("dateId", sql.UniqueIdentifier, dateId)
      .query(`
        SELECT TOP 1 *
        FROM company_calendar_dates
        WHERE id = @dateId AND company_id = @companyId
      `);
    const existingRow = existingResult.recordset[0] as Record<string, unknown> | undefined;
    if (!existingRow) {
      return null;
    }
    const previous = mapDateRow(existingRow);

    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("dateId", sql.UniqueIdentifier, dateId)
      .input("name", sql.NVarChar(200), input.name ?? previous.name)
      .input("dateType", sql.NVarChar(40), input.dateType ?? previous.dateType)
      .input(
        "isWorkingDay",
        sql.Bit,
        (input.isWorkingDay ?? previous.isWorkingDay) ? 1 : 0,
      )
      .input(
        "notes",
        sql.NVarChar(500),
        input.notes !== undefined ? input.notes : previous.notes,
      )
      .input("isActive", sql.Bit, (input.isActive ?? previous.isActive) ? 1 : 0)
      .input("expectedVersion", sql.Int, input.expectedVersion)
      .query(`
        UPDATE company_calendar_dates
        SET
          name = @name,
          date_type = @dateType,
          is_working_day = @isWorkingDay,
          notes = @notes,
          is_active = @isActive,
          version = version + 1,
          updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @dateId
          AND company_id = @companyId
          AND version = @expectedVersion
      `);

    if (!result.recordset[0]) {
      return null;
    }
    return {
      previous,
      updated: mapDateRow(result.recordset[0] as Record<string, unknown>),
    };
  },

  async countRequestsUsingCalendar(
    companyId: string,
    calendarId: string,
    transaction?: sql.Transaction,
  ): Promise<number> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("calendarId", sql.UniqueIdentifier, calendarId)
      .query(`
        SELECT COUNT(1) AS cnt
        FROM absence_requests
        WHERE company_id = @companyId AND calendar_id = @calendarId
      `);
    return Number(result.recordset[0]?.cnt ?? 0);
  },

  async countActiveTypesUsingCalendar(
    companyId: string,
    calendarId: string,
    transaction?: sql.Transaction,
  ): Promise<number> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("calendarId", sql.UniqueIdentifier, calendarId)
      .query(`
        SELECT COUNT(1) AS cnt
        FROM absence_types
        WHERE company_id = @companyId
          AND calendar_id = @calendarId
          AND is_active = 1
      `);
    return Number(result.recordset[0]?.cnt ?? 0);
  },

  async countActiveDefaultCalendars(
    companyId: string,
    transaction?: sql.Transaction,
  ): Promise<number> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT COUNT(1) AS cnt
        FROM company_work_calendars
        WHERE company_id = @companyId AND is_default = 1 AND is_active = 1
      `);
    return Number(result.recordset[0]?.cnt ?? 0);
  },
};
