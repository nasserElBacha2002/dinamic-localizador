import sql from "mssql";
import { getPool } from "../database/connection";
import type { AbsenceType } from "../types/absence";
import { mapAbsenceTypeRow } from "../utils/row-mappers";

export const absenceTypeRepository = {
  async listActive(companyId: string): Promise<AbsenceType[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
      SELECT *
      FROM absence_types
      WHERE is_active = 1 AND company_id = @companyId
      ORDER BY name ASC
    `);

    return result.recordset.map((row) => mapAbsenceTypeRow(row as Record<string, unknown>));
  },

  async listAll(companyId: string, activeOnly: boolean): Promise<AbsenceType[]> {
    const pool = getPool();
    const request = pool.request().input("companyId", sql.UniqueIdentifier, companyId);
    const whereClause = activeOnly
      ? "WHERE is_active = 1 AND company_id = @companyId"
      : "WHERE company_id = @companyId";
    const result = await request.query(`
      SELECT *
      FROM absence_types
      ${whereClause}
      ORDER BY name ASC
    `);

    return result.recordset.map((row) => mapAbsenceTypeRow(row as Record<string, unknown>));
  },

  async findById(companyId: string, id: string): Promise<AbsenceType | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`SELECT TOP 1 * FROM absence_types WHERE id = @id AND company_id = @companyId`);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAbsenceTypeRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByCode(companyId: string, code: string): Promise<AbsenceType | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("code", sql.NVarChar(40), code)
      .query(`SELECT TOP 1 * FROM absence_types WHERE code = @code AND company_id = @companyId`);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAbsenceTypeRow(result.recordset[0] as Record<string, unknown>);
  },
};
