import sql from "mssql";
import { getPool } from "../database/connection";
import type { AbsenceType } from "../types/absence";
import { mapAbsenceTypeRow } from "../utils/row-mappers";

export const absenceTypeRepository = {
  async listActive(): Promise<AbsenceType[]> {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT *
      FROM absence_types
      WHERE is_active = 1
      ORDER BY name ASC
    `);

    return result.recordset.map((row) => mapAbsenceTypeRow(row as Record<string, unknown>));
  },

  async listAll(activeOnly: boolean): Promise<AbsenceType[]> {
    const pool = getPool();
    const request = pool.request();
    const whereClause = activeOnly ? "WHERE is_active = 1" : "";
    const result = await request.query(`
      SELECT *
      FROM absence_types
      ${whereClause}
      ORDER BY name ASC
    `);

    return result.recordset.map((row) => mapAbsenceTypeRow(row as Record<string, unknown>));
  },

  async findById(id: string): Promise<AbsenceType | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query(`SELECT TOP 1 * FROM absence_types WHERE id = @id`);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAbsenceTypeRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByCode(code: string): Promise<AbsenceType | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("code", sql.NVarChar(40), code)
      .query(`SELECT TOP 1 * FROM absence_types WHERE code = @code`);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAbsenceTypeRow(result.recordset[0] as Record<string, unknown>);
  },
};
