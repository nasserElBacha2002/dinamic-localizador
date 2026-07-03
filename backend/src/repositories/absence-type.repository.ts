import sql from "mssql";
import { STANDARD_ABSENCE_TYPE_SEEDS } from "../constants/company-absence";
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

  async ensureStandardTypesForCompany(
    companyId: string,
    transaction?: sql.Transaction,
  ): Promise<void> {
    for (const seed of STANDARD_ABSENCE_TYPE_SEEDS) {
      const request = transaction ? new sql.Request(transaction) : getPool().request();
      await request
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("code", sql.NVarChar(40), seed.code)
        .input("name", sql.NVarChar(120), seed.name)
        .input("description", sql.NVarChar(500), seed.description)
        .input("requiresApproval", sql.Bit, seed.requiresApproval ? 1 : 0)
        .input("requiresAttachment", sql.Bit, seed.requiresAttachment ? 1 : 0)
        .input("deductsBalance", sql.Bit, seed.deductsBalance ? 1 : 0)
        .input("allowsHalfDay", sql.Bit, seed.allowsHalfDay ? 1 : 0)
        .query(`
          IF NOT EXISTS (
            SELECT 1
            FROM absence_types
            WHERE company_id = @companyId AND code = @code
          )
          BEGIN
            INSERT INTO absence_types (
              company_id, code, name, description,
              requires_approval, requires_attachment, deducts_balance, allows_half_day
            )
            VALUES (
              @companyId, @code, @name, @description,
              @requiresApproval, @requiresAttachment, @deductsBalance, @allowsHalfDay
            );
          END
        `);
    }
  },

  async listCodesForCompany(companyId: string): Promise<string[]> {
    const types = await this.listAll(companyId, false);
    return types.map((type) => type.code);
  },
};
