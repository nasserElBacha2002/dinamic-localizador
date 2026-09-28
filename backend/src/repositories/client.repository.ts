import sql from "mssql";
import { randomUUID } from "node:crypto";
import { getPool } from "../database/connection";
import type { ListClientsQuery } from "../schemas/client.schema";
import type { Client } from "../types/domain";
import { applySqlFilters, buildWhereClause, type SqlFilter } from "../utils/sql-list-query";
import { resolveSqlSort } from "../utils/sql-sort";

const CLIENT_LIST_SORT_COLUMNS = {
  name: "c.name",
  updatedAt: "c.updated_at",
} as const;

const mapClientRow = (row: Record<string, unknown>): Client => ({
  id: String(row.id),
  companyId: String(row.company_id),
  name: String(row.name),
  isActive: Boolean(row.is_active),
  createdAt: new Date(row.created_at as Date | string).toISOString(),
  updatedAt: new Date(row.updated_at as Date | string).toISOString(),
  createdBy: row.created_by ? String(row.created_by) : null,
  updatedBy: row.updated_by ? String(row.updated_by) : null,
});

const isDuplicateNameError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("UQ_clients_company_normalized_name");
};

export const clientRepository = {
  async create(
    companyId: string,
    input: {
      name: string;
      normalizedName: string;
      createdBy: string | null;
    },
    transaction?: sql.Transaction,
  ): Promise<Client> {
    const id = randomUUID();
    const request = transaction ? new sql.Request(transaction) : getPool().request();

    try {
      const result = await request
        .input("id", sql.UniqueIdentifier, id)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("name", sql.NVarChar(255), input.name)
        .input("normalizedName", sql.NVarChar(255), input.normalizedName)
        .input("createdBy", sql.UniqueIdentifier, input.createdBy)
        .input("updatedBy", sql.UniqueIdentifier, input.createdBy)
        .query(`
          INSERT INTO clients (
            id,
            company_id,
            name,
            normalized_name,
            created_by,
            updated_by
          )
          OUTPUT INSERTED.*
          VALUES (
            @id,
            @companyId,
            @name,
            @normalizedName,
            @createdBy,
            @updatedBy
          )
        `);

      return mapClientRow(result.recordset[0] as Record<string, unknown>);
    } catch (error) {
      if (isDuplicateNameError(error)) {
        throw Object.assign(new Error("CLIENT_NAME_ALREADY_EXISTS"), {
          code: "CLIENT_NAME_ALREADY_EXISTS",
        });
      }

      throw error;
    }
  },

  async findById(companyId: string, clientId: string): Promise<Client | null> {
    const pool = getPool();

    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("clientId", sql.UniqueIdentifier, clientId)
      .query(`
        SELECT *
        FROM clients
        WHERE id = @clientId
          AND company_id = @companyId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapClientRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByNormalizedName(
    companyId: string,
    normalizedName: string,
    excludeId?: string,
  ): Promise<Client | null> {
    const pool = getPool();

    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("normalizedName", sql.NVarChar(255), normalizedName);

    if (excludeId) {
      request.input("excludeId", sql.UniqueIdentifier, excludeId);
    }

    const result = await request.query(`
      SELECT TOP 1 *
      FROM clients
      WHERE company_id = @companyId
        AND normalized_name = @normalizedName
        ${excludeId ? "AND id <> @excludeId" : ""}
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapClientRow(result.recordset[0] as Record<string, unknown>);
  },

  async list(
    companyId: string,
    query: ListClientsQuery,
  ): Promise<{ items: Client[]; total: number }> {
    const pool = getPool();

    const filters: SqlFilter[] = [
      {
        clause: "c.company_id = @companyId",
        apply: (request) =>
          request.input("companyId", sql.UniqueIdentifier, companyId),
      },
    ];

    if (query.active !== undefined) {
      filters.push({
        clause: "c.is_active = @active",
        apply: (request) =>
          request.input("active", sql.Bit, query.active ? 1 : 0),
      });
    }

    if (query.search) {
      filters.push({
        clause: "c.name LIKE @search",
        apply: (request) =>
          request.input("search", sql.NVarChar(265), `%${query.search}%`),
      });
    }

    const whereClause = buildWhereClause(filters);

    const orderBy = resolveSqlSort(
      query.sortBy,
      CLIENT_LIST_SORT_COLUMNS,
      CLIENT_LIST_SORT_COLUMNS.updatedAt,
      query.sortDirection === "asc" ? "asc" : "desc",
    );

    const offset = (query.page - 1) * query.limit;

    const countRequest = pool.request();
    applySqlFilters(countRequest, filters);

    const countResult = await countRequest.query(`
      SELECT COUNT(*) AS total
      FROM clients c
      ${whereClause}
    `);

    const listRequest = pool.request();
    applySqlFilters(listRequest, filters);

    listRequest
      .input("offset", sql.Int, offset)
      .input("limit", sql.Int, query.limit);

    const listResult = await listRequest.query(`
      SELECT *
      FROM clients c
      ${whereClause}
      ORDER BY ${orderBy}, c.name ASC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);

    return {
      items: listResult.recordset.map((row) =>
        mapClientRow(row as Record<string, unknown>),
      ),
      total: Number(countResult.recordset[0]?.total ?? 0),
    };
  },

  async update(
    companyId: string,
    clientId: string,
    input: {
      name?: string;
      normalizedName?: string;
      isActive?: boolean;
      updatedBy: string | null;
    },
  ): Promise<Client | null> {
    const pool = getPool();

    const fields: string[] = [
      "updated_at = SYSUTCDATETIME()",
      "updated_by = @updatedBy",
    ];

    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("clientId", sql.UniqueIdentifier, clientId)
      .input("updatedBy", sql.UniqueIdentifier, input.updatedBy);

    if (input.name !== undefined) {
      fields.push("name = @name");
      request.input("name", sql.NVarChar(255), input.name);
    }

    if (input.normalizedName !== undefined) {
      fields.push("normalized_name = @normalizedName");
      request.input("normalizedName", sql.NVarChar(255), input.normalizedName);
    }

    if (input.isActive !== undefined) {
      fields.push("is_active = @isActive");
      request.input("isActive", sql.Bit, input.isActive ? 1 : 0);
    }

    try {
      const result = await request.query(`
        UPDATE clients
        SET ${fields.join(", ")}
        OUTPUT INSERTED.*
        WHERE id = @clientId
          AND company_id = @companyId
      `);

      if (!result.recordset[0]) {
        return null;
      }

      return mapClientRow(result.recordset[0] as Record<string, unknown>);
    } catch (error) {
      if (isDuplicateNameError(error)) {
        throw Object.assign(new Error("CLIENT_NAME_ALREADY_EXISTS"), {
          code: "CLIENT_NAME_ALREADY_EXISTS",
        });
      }

      throw error;
    }
  },

  async listByIds(companyId: string, clientIds: string[]): Promise<Client[]> {
    if (clientIds.length === 0) {
      return [];
    }

    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId);

    const idParams = clientIds.map((id, index) => {
      const param = `id${index}`;

      request.input(param, sql.UniqueIdentifier, id);

      return `@${param}`;
    });

    const result = await request.query(`
      SELECT *
      FROM clients
      WHERE company_id = @companyId
        AND id IN (${idParams.join(", ")})
    `);

    return result.recordset.map((row) =>
      mapClientRow(row as Record<string, unknown>),
    );
  },
};