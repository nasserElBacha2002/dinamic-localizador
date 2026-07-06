import sql from "mssql";
import { getPool } from "../database/connection";
import type { ScheduleSource } from "../constants/schedule-source";
import { numberToWeekday, weekdayToNumber } from "../constants/weekday";
import type { OperationSchedule, WeeklyScheduleDay } from "../types/schedule";
import { parseSqlTimeToHHmm, toSqlTimeValue } from "../utils/sql-time";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapDayRow = (row: Record<string, unknown>): WeeklyScheduleDay => ({
  dayOfWeek: numberToWeekday(Number(row.day_of_week)),
  isEnabled: Boolean(row.is_enabled),
  startTime: row.start_time ? parseSqlTimeToHHmm(row.start_time) : null,
  endTime: row.end_time ? parseSqlTimeToHHmm(row.end_time) : null,
});

const mapScheduleRow = (
  row: Record<string, unknown>,
  days: WeeklyScheduleDay[],
): OperationSchedule => ({
  id: String(row.id),
  companyId: String(row.company_id),
  operationId: String(row.operation_id),
  scheduleSource: String(row.schedule_source) as ScheduleSource,
  timezone: String(row.timezone),
  validFrom: String(row.valid_from).slice(0, 10),
  validUntil: row.valid_until ? String(row.valid_until).slice(0, 10) : null,
  version: Number(row.version),
  days,
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const operationScheduleRepository = {
  async findByOperationId(companyId: string, operationId: string): Promise<OperationSchedule | null> {
    const pool = getPool();
    const scheduleResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT *
        FROM operation_schedules
        WHERE company_id = @companyId AND operation_id = @operationId
      `);

    const scheduleRow = scheduleResult.recordset[0] as Record<string, unknown> | undefined;
    if (!scheduleRow) {
      return null;
    }

    const days = await this.listDaysForSchedule(companyId, String(scheduleRow.id));
    return mapScheduleRow(scheduleRow, days);
  },

  async listDaysForSchedule(companyId: string, scheduleId: string): Promise<WeeklyScheduleDay[]> {
    const pool = getPool();
    const daysResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("scheduleId", sql.UniqueIdentifier, scheduleId)
      .query(`
        SELECT *
        FROM operation_schedule_days
        WHERE company_id = @companyId AND operation_schedule_id = @scheduleId
        ORDER BY day_of_week ASC
      `);

    return daysResult.recordset.map((row) => mapDayRow(row as Record<string, unknown>));
  },

  async findSummariesByOperationIds(
    companyId: string,
    operationIds: string[],
  ): Promise<Map<string, Pick<OperationSchedule, "scheduleSource" | "validFrom" | "validUntil" | "version">>> {
    if (operationIds.length === 0) {
      return new Map();
    }

    const pool = getPool();
    const request = pool.request().input("companyId", sql.UniqueIdentifier, companyId);
    const idParams = operationIds.map((id, index) => {
      request.input(`operationId${index}`, sql.UniqueIdentifier, id);
      return `@operationId${index}`;
    });

    const result = await request.query(`
      SELECT operation_id, schedule_source, valid_from, valid_until, version
      FROM operation_schedules
      WHERE company_id = @companyId
        AND operation_id IN (${idParams.join(", ")})
    `);

    const map = new Map<
      string,
      Pick<OperationSchedule, "scheduleSource" | "validFrom" | "validUntil" | "version">
    >();
    for (const row of result.recordset) {
      map.set(String(row.operation_id), {
        scheduleSource: String(row.schedule_source) as ScheduleSource,
        validFrom: String(row.valid_from).slice(0, 10),
        validUntil: row.valid_until ? String(row.valid_until).slice(0, 10) : null,
        version: Number(row.version),
      });
    }
    return map;
  },

  async createInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: {
      operationId: string;
      scheduleSource: ScheduleSource;
      timezone: string;
      validFrom: string;
      validUntil: string | null;
      days?: WeeklyScheduleDay[];
      version?: number;
    },
  ): Promise<OperationSchedule> {
    const insertResult = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, input.operationId)
      .input("scheduleSource", sql.NVarChar(20), input.scheduleSource)
      .input("timezone", sql.NVarChar(80), input.timezone)
      .input("validFrom", sql.Date, input.validFrom)
      .input("validUntil", sql.Date, input.validUntil)
      .input("version", sql.Int, input.version ?? 1)
      .query(`
        INSERT INTO operation_schedules (
          company_id, operation_id, schedule_source, timezone, valid_from, valid_until, version
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @operationId, @scheduleSource, @timezone, @validFrom, @validUntil, @version
        )
      `);

    const scheduleRow = insertResult.recordset[0] as Record<string, unknown>;
    const scheduleId = String(scheduleRow.id);

    if (input.scheduleSource === "CUSTOM" && input.days) {
      for (const day of input.days) {
        await new sql.Request(transaction)
          .input("companyId", sql.UniqueIdentifier, companyId)
          .input("scheduleId", sql.UniqueIdentifier, scheduleId)
          .input("dayOfWeek", sql.TinyInt, weekdayToNumber(day.dayOfWeek))
          .input("isEnabled", sql.Bit, day.isEnabled ? 1 : 0)
          .input("startTime", sql.VarChar(8), toSqlTimeValue(day.startTime))
          .input("endTime", sql.VarChar(8), toSqlTimeValue(day.endTime))
          .query(`
            INSERT INTO operation_schedule_days (
              company_id, operation_schedule_id, day_of_week, is_enabled, start_time, end_time
            )
            VALUES (
              @companyId, @scheduleId, @dayOfWeek, @isEnabled, @startTime, @endTime
            )
          `);
      }
    }

    const days =
      input.scheduleSource === "CUSTOM" && input.days
        ? input.days
        : await this.listDaysForScheduleInTransaction(companyId, transaction, scheduleId);

    return mapScheduleRow(scheduleRow, days);
  },

  async listDaysForScheduleInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    scheduleId: string,
  ): Promise<WeeklyScheduleDay[]> {
    const daysResult = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("scheduleId", sql.UniqueIdentifier, scheduleId)
      .query(`
        SELECT *
        FROM operation_schedule_days
        WHERE company_id = @companyId AND operation_schedule_id = @scheduleId
        ORDER BY day_of_week ASC
      `);

    return daysResult.recordset.map((row) => mapDayRow(row as Record<string, unknown>));
  },

  async updateInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    operationId: string,
    input: {
      scheduleSource: ScheduleSource;
      timezone: string;
      validFrom: string;
      validUntil: string | null;
      days?: WeeklyScheduleDay[];
      nextVersion: number;
    },
  ): Promise<OperationSchedule> {
    const current = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT id
        FROM operation_schedules
        WHERE company_id = @companyId AND operation_id = @operationId
      `);

    const scheduleId = current.recordset[0]?.id ? String(current.recordset[0].id) : null;
    if (!scheduleId) {
      throw new Error("OPERATION_SCHEDULE_NOT_FOUND");
    }

    await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("scheduleSource", sql.NVarChar(20), input.scheduleSource)
      .input("timezone", sql.NVarChar(80), input.timezone)
      .input("validFrom", sql.Date, input.validFrom)
      .input("validUntil", sql.Date, input.validUntil)
      .input("version", sql.Int, input.nextVersion)
      .query(`
        UPDATE operation_schedules
        SET schedule_source = @scheduleSource,
            timezone = @timezone,
            valid_from = @validFrom,
            valid_until = @validUntil,
            version = @version,
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId AND operation_id = @operationId
      `);

    await new sql.Request(transaction)
      .input("scheduleId", sql.UniqueIdentifier, scheduleId)
      .query(`DELETE FROM operation_schedule_days WHERE operation_schedule_id = @scheduleId`);

    if (input.scheduleSource === "CUSTOM" && input.days) {
      for (const day of input.days) {
        await new sql.Request(transaction)
          .input("companyId", sql.UniqueIdentifier, companyId)
          .input("scheduleId", sql.UniqueIdentifier, scheduleId)
          .input("dayOfWeek", sql.TinyInt, weekdayToNumber(day.dayOfWeek))
          .input("isEnabled", sql.Bit, day.isEnabled ? 1 : 0)
          .input("startTime", sql.VarChar(8), toSqlTimeValue(day.startTime))
          .input("endTime", sql.VarChar(8), toSqlTimeValue(day.endTime))
          .query(`
            INSERT INTO operation_schedule_days (
              company_id, operation_schedule_id, day_of_week, is_enabled, start_time, end_time
            )
            VALUES (
              @companyId, @scheduleId, @dayOfWeek, @isEnabled, @startTime, @endTime
            )
          `);
      }
    }

    const refreshed = await this.findByOperationIdInTransaction(companyId, transaction, operationId);
    if (!refreshed) {
      throw new Error("OPERATION_SCHEDULE_UPDATE_FAILED");
    }
    return refreshed;
  },

  async findByOperationIdInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    operationId: string,
  ): Promise<OperationSchedule | null> {
    const scheduleResult = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT *
        FROM operation_schedules
        WHERE company_id = @companyId AND operation_id = @operationId
      `);

    const scheduleRow = scheduleResult.recordset[0] as Record<string, unknown> | undefined;
    if (!scheduleRow) {
      return null;
    }

    const days = await this.listDaysForScheduleInTransaction(
      companyId,
      transaction,
      String(scheduleRow.id),
    );
    return mapScheduleRow(scheduleRow, days);
  },
};
