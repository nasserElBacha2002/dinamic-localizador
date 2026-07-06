import sql from "mssql";
import { getPool } from "../database/connection";
import { numberToWeekday, weekdayToNumber } from "../constants/weekday";
import type { CompanyWorkSchedule, WeeklyScheduleDay } from "../types/schedule";
import { parseSqlTimeToHHmm, toSqlTimeValue } from "../utils/sql-time";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapDayRow = (row: Record<string, unknown>): WeeklyScheduleDay => ({
  dayOfWeek: numberToWeekday(Number(row.day_of_week)),
  isEnabled: Boolean(row.is_enabled),
  startTime: row.start_time ? parseSqlTimeToHHmm(row.start_time) : null,
  endTime: row.end_time ? parseSqlTimeToHHmm(row.end_time) : null,
});

export const companyWorkScheduleRepository = {
  async findByCompanyId(companyId: string): Promise<CompanyWorkSchedule | null> {
    const pool = getPool();
    const scheduleResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT *
        FROM company_work_schedules
        WHERE company_id = @companyId
      `);

    const scheduleRow = scheduleResult.recordset[0] as Record<string, unknown> | undefined;
    if (!scheduleRow) {
      return null;
    }

    const daysResult = await pool
      .request()
      .input("scheduleId", sql.UniqueIdentifier, String(scheduleRow.id))
      .query(`
        SELECT *
        FROM company_work_schedule_days
        WHERE company_work_schedule_id = @scheduleId
        ORDER BY day_of_week ASC
      `);

    return {
      id: String(scheduleRow.id),
      companyId: String(scheduleRow.company_id),
      timezone: String(scheduleRow.timezone),
      version: Number(scheduleRow.version),
      days: daysResult.recordset.map((row) => mapDayRow(row as Record<string, unknown>)),
      createdAt: toIsoString(scheduleRow.created_at as Date | string),
      updatedAt: toIsoString(scheduleRow.updated_at as Date | string),
    };
  },

  async replaceInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: { timezone: string; days: WeeklyScheduleDay[]; nextVersion: number },
  ): Promise<CompanyWorkSchedule> {
    const request = new sql.Request(transaction);
    const scheduleResult = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT id, version
        FROM company_work_schedules
        WHERE company_id = @companyId
      `);

    let scheduleId = scheduleResult.recordset[0]?.id
      ? String(scheduleResult.recordset[0].id)
      : null;

    if (!scheduleId) {
      const insertResult = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("timezone", sql.NVarChar(80), input.timezone)
        .input("version", sql.Int, input.nextVersion)
        .query(`
          INSERT INTO company_work_schedules (company_id, timezone, version)
          OUTPUT INSERTED.*
          VALUES (@companyId, @timezone, @version)
        `);
      scheduleId = String(insertResult.recordset[0].id);
    } else {
      await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("timezone", sql.NVarChar(80), input.timezone)
        .input("version", sql.Int, input.nextVersion)
        .query(`
          UPDATE company_work_schedules
          SET timezone = @timezone,
              version = @version,
              updated_at = SYSUTCDATETIME()
          WHERE company_id = @companyId
        `);
    }

    await new sql.Request(transaction)
      .input("scheduleId", sql.UniqueIdentifier, scheduleId)
      .query(`DELETE FROM company_work_schedule_days WHERE company_work_schedule_id = @scheduleId`);

    for (const day of input.days) {
      await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("scheduleId", sql.UniqueIdentifier, scheduleId)
        .input("dayOfWeek", sql.TinyInt, weekdayToNumber(day.dayOfWeek))
        .input("isEnabled", sql.Bit, day.isEnabled ? 1 : 0)
        .input("startTime", sql.VarChar(8), toSqlTimeValue(day.startTime))
        .input("endTime", sql.VarChar(8), toSqlTimeValue(day.endTime))
        .query(`
          INSERT INTO company_work_schedule_days (
            company_id, company_work_schedule_id, day_of_week, is_enabled, start_time, end_time
          )
          VALUES (
            @companyId, @scheduleId, @dayOfWeek, @isEnabled, @startTime, @endTime
          )
        `);
    }

    const refreshed = await this.findByCompanyIdInTransaction(companyId, transaction);
    if (!refreshed) {
      throw new Error("COMPANY_WORK_SCHEDULE_REPLACE_FAILED");
    }
    return refreshed;
  },

  async findByCompanyIdInTransaction(
    companyId: string,
    transaction: sql.Transaction,
  ): Promise<CompanyWorkSchedule | null> {
    const scheduleResult = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT *
        FROM company_work_schedules
        WHERE company_id = @companyId
      `);

    const scheduleRow = scheduleResult.recordset[0] as Record<string, unknown> | undefined;
    if (!scheduleRow) {
      return null;
    }

    const daysResult = await new sql.Request(transaction)
      .input("scheduleId", sql.UniqueIdentifier, String(scheduleRow.id))
      .query(`
        SELECT *
        FROM company_work_schedule_days
        WHERE company_work_schedule_id = @scheduleId
        ORDER BY day_of_week ASC
      `);

    return {
      id: String(scheduleRow.id),
      companyId: String(scheduleRow.company_id),
      timezone: String(scheduleRow.timezone),
      version: Number(scheduleRow.version),
      days: daysResult.recordset.map((row) => mapDayRow(row as Record<string, unknown>)),
      createdAt: toIsoString(scheduleRow.created_at as Date | string),
      updatedAt: toIsoString(scheduleRow.updated_at as Date | string),
    };
  },
};
