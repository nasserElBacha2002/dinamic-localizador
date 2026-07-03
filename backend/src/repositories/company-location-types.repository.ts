import sql from "mssql";
import { getPool } from "../database/connection";
import type { CompanyLocationType } from "../types/company";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapRow = (row: Record<string, unknown>): CompanyLocationType => ({
  id: String(row.id),
  companyId: String(row.company_id),
  code: String(row.code),
  name: String(row.name),
  isActive: Boolean(row.is_active),
  sortOrder: Number(row.sort_order),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const companyLocationTypesRepository = {
  async listByCompanyId(companyId: string, activeOnly = false): Promise<CompanyLocationType[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT *
        FROM company_location_types
        WHERE company_id = @companyId
        ${activeOnly ? "AND is_active = 1" : ""}
        ORDER BY sort_order ASC, name ASC
      `);

    return result.recordset.map((row) => mapRow(row as Record<string, unknown>));
  },
};
