import sql from "mssql";
import { getPool } from "../database/connection";
import type { OperationShift } from "../types/operation-shift";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export const mapOperationShiftRow = (row: Record<string, unknown>): OperationShift => ({
  id: String(row.id),
  companyId: String(row.company_id),
  operationId: String(row.operation_id),
  templateId: row.template_id ? String(row.template_id) : null,
  code: String(row.code),
  name: String(row.name),
  sortOrder: Number(row.sort_order),
  isActive: Boolean(row.is_active),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

type CreateOperationShiftIdentityRowInput = {
  operationId: string;
  templateId: string | null;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

type UpdateOperationShiftIdentityRowInput = {
  name?: string;
  sortOrder?: number;
};

export const operationShiftRepository = {
  async listByOperationId(
    companyId: string,
    operationId: string,
    activeOnly = false,
  ): Promise<OperationShift[]> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT *
        FROM dbo.operation_shifts
        WHERE company_id = @companyId
          AND operation_id = @operationId
          ${activeOnly ? "AND is_active = 1" : ""}
        ORDER BY sort_order ASC, code ASC
      `);
    return result.recordset.map((row) => mapOperationShiftRow(row as Record<string, unknown>));
  },

  async findById(companyId: string, id: string): Promise<OperationShift | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        SELECT TOP 1 *
        FROM dbo.operation_shifts
        WHERE company_id = @companyId AND id = @id
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapOperationShiftRow(row) : null;
  },

  async findByIdForOperation(
    companyId: string,
    operationId: string,
    id: string,
  ): Promise<OperationShift | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        SELECT TOP 1 *
        FROM dbo.operation_shifts
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND id = @id
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapOperationShiftRow(row) : null;
  },

  async findByCode(
    companyId: string,
    operationId: string,
    code: string,
  ): Promise<OperationShift | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("code", sql.NVarChar(80), code)
      .query(`
        SELECT TOP 1 *
        FROM dbo.operation_shifts
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND code = @code
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapOperationShiftRow(row) : null;
  },

  async createIdentity(
    companyId: string,
    input: CreateOperationShiftIdentityRowInput,
  ): Promise<OperationShift> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, input.operationId)
      .input("templateId", sql.UniqueIdentifier, input.templateId)
      .input("code", sql.NVarChar(80), input.code)
      .input("name", sql.NVarChar(200), input.name)
      .input("sortOrder", sql.Int, input.sortOrder)
      .input("isActive", sql.Bit, input.isActive ? 1 : 0)
      .query(`
        INSERT INTO dbo.operation_shifts (
          company_id, operation_id, template_id, code, name, sort_order, is_active
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @operationId, @templateId, @code, @name, @sortOrder, @isActive
        )
      `);
    return mapOperationShiftRow(result.recordset[0] as Record<string, unknown>);
  },

  async createIdentityInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: CreateOperationShiftIdentityRowInput,
  ): Promise<OperationShift> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, input.operationId)
      .input("templateId", sql.UniqueIdentifier, input.templateId)
      .input("code", sql.NVarChar(80), input.code)
      .input("name", sql.NVarChar(200), input.name)
      .input("sortOrder", sql.Int, input.sortOrder)
      .input("isActive", sql.Bit, input.isActive ? 1 : 0)
      .query(`
        INSERT INTO dbo.operation_shifts (
          company_id, operation_id, template_id, code, name, sort_order, is_active
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @operationId, @templateId, @code, @name, @sortOrder, @isActive
        )
      `);
    return mapOperationShiftRow(result.recordset[0] as Record<string, unknown>);
  },

  async updateIdentity(
    companyId: string,
    id: string,
    input: UpdateOperationShiftIdentityRowInput,
  ): Promise<OperationShift | null> {
    const existing = await this.findById(companyId, id);
    if (!existing) {
      return null;
    }

    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .input("name", sql.NVarChar(200), input.name ?? existing.name)
      .input("sortOrder", sql.Int, input.sortOrder ?? existing.sortOrder)
      .query(`
        UPDATE dbo.operation_shifts
        SET name = @name,
            sort_order = @sortOrder,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE company_id = @companyId AND id = @id
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapOperationShiftRow(row) : null;
  },

  async deactivate(companyId: string, id: string): Promise<OperationShift | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        UPDATE dbo.operation_shifts
        SET is_active = 0, updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE company_id = @companyId AND id = @id
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapOperationShiftRow(row) : null;
  },
};
