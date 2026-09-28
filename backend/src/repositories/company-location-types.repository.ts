import sql from "mssql";
import { LEGACY_COMPANY_LOCATION_TYPE_SEEDS } from "../constants/company-location-types";
import { getPool } from "../database/connection";
import type { CompanyLocationType } from "../types/company";
import type { ListClientLocationTypesQuery } from "../schemas/company-location-type.schema";
import { isDuplicateKeyError } from "../utils/sql-server-errors";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapRow = (row: Record<string, unknown>): CompanyLocationType => ({
  id: String(row.id),
  companyId: String(row.company_id),
  clientId: row.client_id ? String(row.client_id) : null,
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

  async findById(companyId: string, id: string): Promise<CompanyLocationType | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        SELECT TOP 1 *
        FROM company_location_types
        WHERE company_id = @companyId AND id = @id
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByCode(companyId: string, code: string): Promise<CompanyLocationType | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("code", sql.NVarChar(80), code)
      .query(`
        SELECT TOP 1 *
        FROM company_location_types
        WHERE company_id = @companyId AND code = @code
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapRow(result.recordset[0] as Record<string, unknown>);
  },

  async listByClientId(companyId: string, clientId: string, activeOnly = false): Promise<CompanyLocationType[]> {
    const result = await getPool().request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("clientId", sql.UniqueIdentifier, clientId)
      .query(`SELECT * FROM company_location_types
        WHERE company_id = @companyId AND client_id = @clientId
        ${activeOnly ? "AND is_active = 1" : ""}
        ORDER BY sort_order ASC, name ASC`);
    return result.recordset.map((row) => mapRow(row as Record<string, unknown>));
  },

  async listPageByClientId(
    companyId: string,
    clientId: string,
    query: ListClientLocationTypesQuery,
  ): Promise<{ items: CompanyLocationType[]; total: number }> {
    const request = getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("clientId", sql.UniqueIdentifier, clientId);
    const filters = ["company_id = @companyId", "client_id = @clientId"];

    if (query.active !== undefined) {
      filters.push("is_active = @active");
      request.input("active", sql.Bit, query.active ? 1 : 0);
    }
    if (query.search) {
      filters.push("(name LIKE @search OR code LIKE @search)");
      request.input("search", sql.NVarChar(200), `%${query.search}%`);
    }

    const whereClause = `WHERE ${filters.join(" AND ")}`;
    const countResult = await request.query(`
      SELECT COUNT(*) AS total
      FROM company_location_types
      ${whereClause}
    `);
    const offset = (query.page - 1) * query.limit;
    const listResult = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("clientId", sql.UniqueIdentifier, clientId)
      .input("offset", sql.Int, offset)
      .input("limit", sql.Int, query.limit)
      .input("active", sql.Bit, query.active === undefined ? null : query.active ? 1 : 0)
      .input("search", sql.NVarChar(200), query.search ? `%${query.search}%` : null)
      .query(`
        SELECT *
        FROM company_location_types
        ${whereClause}
        ORDER BY sort_order ASC, name ASC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    return {
      items: listResult.recordset.map((row) => mapRow(row as Record<string, unknown>)),
      total: Number(countResult.recordset[0]?.total ?? 0),
    };
  },

  async findByIdForClient(companyId: string, clientId: string, id: string): Promise<CompanyLocationType | null> {
    const result = await getPool().request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("clientId", sql.UniqueIdentifier, clientId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`SELECT TOP 1 * FROM company_location_types
        WHERE company_id = @companyId AND client_id = @clientId AND id = @id`);
    return result.recordset[0] ? mapRow(result.recordset[0] as Record<string, unknown>) : null;
  },

  async create(
    companyId: string,
    input: {
      code: string;
      name: string;
      sortOrder: number;
      isActive: boolean;
      clientId?: string | null;
    },
  ): Promise<CompanyLocationType> {
    const pool = getPool();
    try {
      const result = await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("code", sql.NVarChar(80), input.code)
        .input("name", sql.NVarChar(200), input.name)
        .input("sortOrder", sql.Int, input.sortOrder)
        .input("isActive", sql.Bit, input.isActive ? 1 : 0)
        .input("clientId", sql.UniqueIdentifier, input.clientId ?? null)
        .query(`
          INSERT INTO company_location_types (company_id, client_id, code, name, sort_order, is_active)
          OUTPUT INSERTED.*
          VALUES (@companyId, @clientId, @code, @name, @sortOrder, @isActive)
        `);

      return mapRow(result.recordset[0] as Record<string, unknown>);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw error;
      }
      throw error;
    }
  },

  async update(
    companyId: string,
    id: string,
    input: {
      code?: string;
      name?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ): Promise<CompanyLocationType | null> {
    const fields: string[] = [];
    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id);

    if (input.code !== undefined) {
      request.input("code", sql.NVarChar(80), input.code);
      fields.push("code = @code");
    }
    if (input.name !== undefined) {
      request.input("name", sql.NVarChar(200), input.name);
      fields.push("name = @name");
    }
    if (input.sortOrder !== undefined) {
      request.input("sortOrder", sql.Int, input.sortOrder);
      fields.push("sort_order = @sortOrder");
    }
    if (input.isActive !== undefined) {
      request.input("isActive", sql.Bit, input.isActive ? 1 : 0);
      fields.push("is_active = @isActive");
    }

    if (fields.length === 0) {
      return this.findById(companyId, id);
    }

    fields.push("updated_at = SYSUTCDATETIME()");

    const result = await request.query(`
      UPDATE company_location_types
      SET ${fields.join(", ")}
      OUTPUT INSERTED.*
      WHERE company_id = @companyId AND id = @id
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapRow(result.recordset[0] as Record<string, unknown>);
  },

  async ensureLegacyTypesForCompany(
    companyId: string,
    transaction?: sql.Transaction,
  ): Promise<void> {
    for (const seed of LEGACY_COMPANY_LOCATION_TYPE_SEEDS) {
      const request = transaction ? new sql.Request(transaction) : getPool().request();
      await request
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("code", sql.NVarChar(80), seed.code)
        .input("name", sql.NVarChar(200), seed.name)
        .input("sortOrder", sql.Int, seed.sortOrder)
        .query(`
          IF NOT EXISTS (
            SELECT 1
            FROM company_location_types
            WHERE company_id = @companyId AND code = @code
          )
          BEGIN
            INSERT INTO company_location_types (company_id, code, name, sort_order, is_active)
            VALUES (@companyId, @code, @name, @sortOrder, 1);
          END
        `);
    }
  },
};
