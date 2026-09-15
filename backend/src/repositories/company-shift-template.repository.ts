import sql from "mssql";
import { getPool } from "../database/connection";
import type { CompanyShiftTemplate } from "../types/operation-shift";
import { parseSqlTimeToHHmm } from "../utils/sql-time";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const requireTime = (value: unknown, field: string): string => {
  const parsed = parseSqlTimeToHHmm(value);
  if (!parsed) {
    throw new Error(`INVALID_SQL_TIME:${field}`);
  }
  return parsed;
};

export const mapCompanyShiftTemplateRow = (row: Record<string, unknown>): CompanyShiftTemplate => ({
  id: String(row.id),
  companyId: String(row.company_id),
  code: String(row.code),
  name: String(row.name),
  startTime: requireTime(row.start_time, "start_time"),
  endTime: requireTime(row.end_time, "end_time"),
  sortOrder: Number(row.sort_order),
  isActive: Boolean(row.is_active),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const companyShiftTemplateRepository = {
  async listByCompanyId(companyId: string, activeOnly = false): Promise<CompanyShiftTemplate[]> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT *
        FROM dbo.company_shift_templates
        WHERE company_id = @companyId
        ${activeOnly ? "AND is_active = 1" : ""}
        ORDER BY sort_order ASC, name ASC
      `);
    return result.recordset.map((row) => mapCompanyShiftTemplateRow(row as Record<string, unknown>));
  },

  async findById(companyId: string, id: string): Promise<CompanyShiftTemplate | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        SELECT TOP 1 *
        FROM dbo.company_shift_templates
        WHERE company_id = @companyId AND id = @id
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapCompanyShiftTemplateRow(row) : null;
  },

  async findByCode(companyId: string, code: string): Promise<CompanyShiftTemplate | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("code", sql.NVarChar(80), code)
      .query(`
        SELECT TOP 1 *
        FROM dbo.company_shift_templates
        WHERE company_id = @companyId AND code = @code
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapCompanyShiftTemplateRow(row) : null;
  },

  async create(
    companyId: string,
    input: {
      code: string;
      name: string;
      startTime: string;
      endTime: string;
      sortOrder: number;
      isActive: boolean;
    },
  ): Promise<CompanyShiftTemplate> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("code", sql.NVarChar(80), input.code)
      .input("name", sql.NVarChar(200), input.name)
      .input("startTime", sql.NVarChar(8), input.startTime)
      .input("endTime", sql.NVarChar(8), input.endTime)
      .input("sortOrder", sql.Int, input.sortOrder)
      .input("isActive", sql.Bit, input.isActive ? 1 : 0)
      .query(`
        INSERT INTO dbo.company_shift_templates (
          company_id, code, name, start_time, end_time, sort_order, is_active
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @code, @name, CAST(@startTime AS TIME), CAST(@endTime AS TIME),
          @sortOrder, @isActive
        )
      `);
    return mapCompanyShiftTemplateRow(result.recordset[0] as Record<string, unknown>);
  },

  async deactivate(companyId: string, id: string): Promise<CompanyShiftTemplate | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        UPDATE dbo.company_shift_templates
        SET is_active = 0, updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE company_id = @companyId AND id = @id
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapCompanyShiftTemplateRow(row) : null;
  },
};
