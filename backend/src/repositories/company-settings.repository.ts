import sql from "mssql";
import { getPool } from "../database/connection";
import type { CompanySettings } from "../types/company";
import { isDuplicateKeyError } from "../utils/sql-server-errors";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export type CompanySettingsInput = {
  operationTimezone: string;
  defaultRadiusMeters: number;
  lateGraceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  requireCheckoutLocation: boolean;
  allowManualAttendanceCorrections: boolean;
};

const mapSettingsRow = (row: Record<string, unknown>): CompanySettings => ({
  id: String(row.id),
  companyId: String(row.company_id),
  operationTimezone: String(row.operation_timezone),
  defaultRadiusMeters: Number(row.default_radius_meters),
  lateGraceMinutes: Number(row.late_grace_minutes),
  earlyLeaveToleranceMinutes: Number(row.early_leave_tolerance_minutes),
  requireCheckoutLocation: Boolean(row.require_checkout_location),
  allowManualAttendanceCorrections: Boolean(row.allow_manual_attendance_corrections),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const companySettingsRepository = {
  async findByCompanyId(companyId: string): Promise<CompanySettings | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query("SELECT * FROM company_settings WHERE company_id = @companyId");

    if (!result.recordset[0]) {
      return null;
    }

    return mapSettingsRow(result.recordset[0] as Record<string, unknown>);
  },

  async create(
    companyId: string,
    input: CompanySettingsInput,
    transaction?: sql.Transaction,
  ): Promise<CompanySettings> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationTimezone", sql.NVarChar(80), input.operationTimezone)
      .input("defaultRadiusMeters", sql.Int, input.defaultRadiusMeters)
      .input("lateGraceMinutes", sql.Int, input.lateGraceMinutes)
      .input("earlyLeaveToleranceMinutes", sql.Int, input.earlyLeaveToleranceMinutes)
      .input("requireCheckoutLocation", sql.Bit, input.requireCheckoutLocation ? 1 : 0)
      .input(
        "allowManualAttendanceCorrections",
        sql.Bit,
        input.allowManualAttendanceCorrections ? 1 : 0,
      )
      .query(`
        INSERT INTO company_settings (
          company_id, operation_timezone, default_radius_meters,
          late_grace_minutes, early_leave_tolerance_minutes,
          require_checkout_location, allow_manual_attendance_corrections
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @operationTimezone, @defaultRadiusMeters,
          @lateGraceMinutes, @earlyLeaveToleranceMinutes,
          @requireCheckoutLocation, @allowManualAttendanceCorrections
        )
      `);

    return mapSettingsRow(result.recordset[0] as Record<string, unknown>);
  },

  async findOrCreateByCompanyId(
    companyId: string,
    defaults: CompanySettingsInput,
  ): Promise<CompanySettings> {
    const existing = await this.findByCompanyId(companyId);
    if (existing) {
      return existing;
    }

    try {
      return await this.create(companyId, defaults);
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const raced = await this.findByCompanyId(companyId);
      if (raced) {
        return raced;
      }

      throw error;
    }
  },

  async update(
    companyId: string,
    input: Partial<
      Pick<
        CompanySettings,
        | "operationTimezone"
        | "defaultRadiusMeters"
        | "lateGraceMinutes"
        | "earlyLeaveToleranceMinutes"
        | "requireCheckoutLocation"
        | "allowManualAttendanceCorrections"
      >
    >,
  ): Promise<CompanySettings | null> {
    const pool = getPool();
    const fields: string[] = [];
    const request = pool.request().input("companyId", sql.UniqueIdentifier, companyId);

    if (input.operationTimezone !== undefined) {
      request.input("operationTimezone", sql.NVarChar(80), input.operationTimezone);
      fields.push("operation_timezone = @operationTimezone");
    }
    if (input.defaultRadiusMeters !== undefined) {
      request.input("defaultRadiusMeters", sql.Int, input.defaultRadiusMeters);
      fields.push("default_radius_meters = @defaultRadiusMeters");
    }
    if (input.lateGraceMinutes !== undefined) {
      request.input("lateGraceMinutes", sql.Int, input.lateGraceMinutes);
      fields.push("late_grace_minutes = @lateGraceMinutes");
    }
    if (input.earlyLeaveToleranceMinutes !== undefined) {
      request.input(
        "earlyLeaveToleranceMinutes",
        sql.Int,
        input.earlyLeaveToleranceMinutes,
      );
      fields.push("early_leave_tolerance_minutes = @earlyLeaveToleranceMinutes");
    }
    if (input.requireCheckoutLocation !== undefined) {
      request.input("requireCheckoutLocation", sql.Bit, input.requireCheckoutLocation ? 1 : 0);
      fields.push("require_checkout_location = @requireCheckoutLocation");
    }
    if (input.allowManualAttendanceCorrections !== undefined) {
      request.input(
        "allowManualAttendanceCorrections",
        sql.Bit,
        input.allowManualAttendanceCorrections ? 1 : 0,
      );
      fields.push("allow_manual_attendance_corrections = @allowManualAttendanceCorrections");
    }

    if (fields.length === 0) {
      return this.findByCompanyId(companyId);
    }

    fields.push("updated_at = SYSUTCDATETIME()");

    const result = await request.query(`
      UPDATE company_settings
      SET ${fields.join(", ")}
      OUTPUT INSERTED.*
      WHERE company_id = @companyId
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapSettingsRow(result.recordset[0] as Record<string, unknown>);
  },
};
