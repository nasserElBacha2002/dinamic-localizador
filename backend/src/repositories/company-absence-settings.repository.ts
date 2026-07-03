import sql from "mssql";
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
};
