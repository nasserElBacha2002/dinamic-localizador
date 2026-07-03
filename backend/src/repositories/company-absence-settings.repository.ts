import sql from "mssql";
import {
  buildDefaultCompanyAbsenceSettings,
  resolveDefaultCompanyAbsenceSetting,
} from "../constants/company-absence";
import { getPool } from "../database/connection";
import type { CompanyAbsenceSetting } from "../types/company";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapRow = (row: Record<string, unknown>): CompanyAbsenceSetting => ({
  id: String(row.id),
  companyId: String(row.company_id),
  absenceTypeCode: String(row.absence_type_code),
  defaultAnnualDays: Number(row.default_annual_days),
  autoAssignOnEmployeeCreate: Boolean(row.auto_assign_on_employee_create),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const companyAbsenceSettingsRepository = {
  async listByCompanyId(companyId: string): Promise<CompanyAbsenceSetting[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT *
        FROM company_absence_settings
        WHERE company_id = @companyId
        ORDER BY absence_type_code ASC
      `);

    return result.recordset.map((row) => mapRow(row as Record<string, unknown>));
  },

  async findByCompanyAndCode(
    companyId: string,
    absenceTypeCode: string,
  ): Promise<CompanyAbsenceSetting | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("absenceTypeCode", sql.NVarChar(50), absenceTypeCode)
      .query(`
        SELECT TOP 1 *
        FROM company_absence_settings
        WHERE company_id = @companyId
          AND absence_type_code = @absenceTypeCode
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapRow(result.recordset[0] as Record<string, unknown>);
  },

  async upsert(
    companyId: string,
    input: {
      absenceTypeCode: string;
      defaultAnnualDays: number;
      autoAssignOnEmployeeCreate: boolean;
    },
    transaction?: sql.Transaction,
  ): Promise<CompanyAbsenceSetting> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("absenceTypeCode", sql.NVarChar(50), input.absenceTypeCode)
      .input("defaultAnnualDays", sql.Decimal(5, 1), input.defaultAnnualDays)
      .input("autoAssignOnEmployeeCreate", sql.Bit, input.autoAssignOnEmployeeCreate ? 1 : 0)
      .query(`
        MERGE company_absence_settings AS target
        USING (
          SELECT
            @companyId AS company_id,
            @absenceTypeCode AS absence_type_code,
            @defaultAnnualDays AS default_annual_days,
            @autoAssignOnEmployeeCreate AS auto_assign_on_employee_create
        ) AS source
          ON target.company_id = source.company_id
         AND target.absence_type_code = source.absence_type_code
        WHEN MATCHED THEN
          UPDATE SET
            default_annual_days = source.default_annual_days,
            auto_assign_on_employee_create = source.auto_assign_on_employee_create,
            updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (
            company_id,
            absence_type_code,
            default_annual_days,
            auto_assign_on_employee_create
          )
          VALUES (
            source.company_id,
            source.absence_type_code,
            source.default_annual_days,
            source.auto_assign_on_employee_create
          )
        OUTPUT INSERTED.*;
      `);

    return mapRow(result.recordset[0] as Record<string, unknown>);
  },

  async ensureDefaultSettingsForCompany(
    companyId: string,
    transaction?: sql.Transaction,
  ): Promise<void> {
    for (const seed of buildDefaultCompanyAbsenceSettings()) {
      const defaults = resolveDefaultCompanyAbsenceSetting(seed.absenceTypeCode);
      const request = transaction ? new sql.Request(transaction) : getPool().request();
      await request
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("absenceTypeCode", sql.NVarChar(50), seed.absenceTypeCode)
        .input("defaultAnnualDays", sql.Decimal(5, 1), defaults.defaultAnnualDays)
        .input(
          "autoAssignOnEmployeeCreate",
          sql.Bit,
          defaults.autoAssignOnEmployeeCreate ? 1 : 0,
        )
        .query(`
          IF NOT EXISTS (
            SELECT 1
            FROM company_absence_settings
            WHERE company_id = @companyId
              AND absence_type_code = @absenceTypeCode
          )
          BEGIN
            INSERT INTO company_absence_settings (
              company_id,
              absence_type_code,
              default_annual_days,
              auto_assign_on_employee_create
            )
            VALUES (
              @companyId,
              @absenceTypeCode,
              @defaultAnnualDays,
              @autoAssignOnEmployeeCreate
            );
          END
        `);
    }
  },
};
