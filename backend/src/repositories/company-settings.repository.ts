import sql from "mssql";
import { getPool } from "../database/connection";
import type { CompanySettings } from "../types/company";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

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
