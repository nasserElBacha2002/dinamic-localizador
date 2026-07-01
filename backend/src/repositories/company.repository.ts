import sql from "mssql";
import { getPool } from "../database/connection";
import type { Company, CompanyStatus } from "../types/company";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapCompanyRow = (row: Record<string, unknown>): Company => ({
  id: String(row.id),
  name: String(row.name),
  legalName: row.legal_name ? String(row.legal_name) : null,
  taxId: row.tax_id ? String(row.tax_id) : null,
  country: row.country ? String(row.country) : null,
  defaultTimezone: String(row.default_timezone),
  status: String(row.status) as CompanyStatus,
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const companyRepository = {
  async findById(id: string): Promise<Company | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query("SELECT * FROM companies WHERE id = @id");

    if (!result.recordset[0]) {
      return null;
    }

    return mapCompanyRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByName(name: string): Promise<Company | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("name", sql.NVarChar(200), name)
      .query("SELECT TOP 1 * FROM companies WHERE name = @name");

    if (!result.recordset[0]) {
      return null;
    }

    return mapCompanyRow(result.recordset[0] as Record<string, unknown>);
  },

  async listActive(): Promise<Company[]> {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT * FROM companies WHERE status = 'ACTIVE' ORDER BY name ASC
    `);

    return result.recordset.map((row) => mapCompanyRow(row as Record<string, unknown>));
  },

  async create(
    input: {
      name: string;
      defaultTimezone: string;
      status?: CompanyStatus;
    },
    transaction?: sql.Transaction,
  ): Promise<Company> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("name", sql.NVarChar(200), input.name.trim())
      .input("defaultTimezone", sql.NVarChar(80), input.defaultTimezone)
      .input("status", sql.NVarChar(30), input.status ?? "ACTIVE")
      .query(`
        INSERT INTO companies (name, default_timezone, status)
        OUTPUT INSERTED.*
        VALUES (@name, @defaultTimezone, @status)
      `);

    return mapCompanyRow(result.recordset[0] as Record<string, unknown>);
  },
};
