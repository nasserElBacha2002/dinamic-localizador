import sql from "mssql";
import { getPool } from "../database/connection";
import type { CompanyModule } from "../types/company";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapCompanyModuleRow = (row: Record<string, unknown>): CompanyModule => ({
  id: String(row.id),
  companyId: String(row.company_id),
  moduleKey: String(row.module_key),
  isEnabled: Boolean(row.is_enabled),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const companyModuleRepository = {
  async listByCompanyId(companyId: string): Promise<CompanyModule[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT *
        FROM company_modules
        WHERE company_id = @companyId
        ORDER BY module_key ASC
      `);

    return result.recordset.map((row) => mapCompanyModuleRow(row as Record<string, unknown>));
  },
};
