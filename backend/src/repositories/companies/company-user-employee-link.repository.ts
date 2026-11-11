import sql from "mssql";
import { getPool } from "../../database/connection";
import type { CompanyUserEmployeeLink } from "../../types/operation-charge";
import {
  acquireTransactionAppLock,
  companyUserEmployeeLinkLockResource,
} from "../../utils/sql-app-lock";

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapRow = (row: Record<string, unknown>): CompanyUserEmployeeLink => ({
  companyId: String(row.company_id),
  userId: String(row.user_id),
  employeeId: String(row.employee_id),
  createdAt: toIso(row.created_at as Date | string),
  updatedAt: toIso(row.updated_at as Date | string),
  createdByUserId: row.created_by_user_id ? String(row.created_by_user_id) : null,
  previousEmployeeId: row.previous_employee_id ? String(row.previous_employee_id) : null,
  lastReplacedAt: row.last_replaced_at ? toIso(row.last_replaced_at as Date | string) : null,
  lastReplacedByUserId: row.last_replaced_by_user_id
    ? String(row.last_replaced_by_user_id)
    : null,
});

export const companyUserEmployeeLinkRepository = {
  async findByUserId(companyId: string, userId: string): Promise<CompanyUserEmployeeLink | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT TOP 1 *
        FROM company_user_employee_links
        WHERE company_id = @companyId AND user_id = @userId
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async findByEmployeeId(companyId: string, employeeId: string): Promise<CompanyUserEmployeeLink | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT TOP 1 *
        FROM company_user_employee_links
        WHERE company_id = @companyId AND employee_id = @employeeId
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async findByEmployeeIdInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    employeeId: string,
  ): Promise<CompanyUserEmployeeLink | null> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT TOP 1 *
        FROM company_user_employee_links
        WHERE company_id = @companyId AND employee_id = @employeeId
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async findByUserIdForUpdateInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    userId: string,
  ): Promise<CompanyUserEmployeeLink | null> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT TOP 1 *
        FROM company_user_employee_links WITH (UPDLOCK, ROWLOCK)
        WHERE company_id = @companyId AND user_id = @userId
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async createInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: {
      userId: string;
      employeeId: string;
      createdByUserId: string | null;
    },
  ): Promise<CompanyUserEmployeeLink> {
    await acquireTransactionAppLock(transaction, {
      resource: companyUserEmployeeLinkLockResource(companyId, input.userId),
    });

    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("userId", sql.UniqueIdentifier, input.userId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("createdByUserId", sql.UniqueIdentifier, input.createdByUserId)
      .query(`
        INSERT INTO company_user_employee_links (
          company_id, user_id, employee_id, created_by_user_id
        )
        OUTPUT INSERTED.*
        VALUES (@companyId, @userId, @employeeId, @createdByUserId)
      `);
    return mapRow(result.recordset[0] as Record<string, unknown>);
  },

  async replaceInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: {
      userId: string;
      employeeId: string;
      replacedByUserId: string | null;
    },
  ): Promise<CompanyUserEmployeeLink> {
    await acquireTransactionAppLock(transaction, {
      resource: companyUserEmployeeLinkLockResource(companyId, input.userId),
    });

    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("userId", sql.UniqueIdentifier, input.userId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("replacedByUserId", sql.UniqueIdentifier, input.replacedByUserId)
      .query(`
        UPDATE company_user_employee_links
        SET
          previous_employee_id = employee_id,
          employee_id = @employeeId,
          last_replaced_at = SYSUTCDATETIME(),
          last_replaced_by_user_id = @replacedByUserId,
          updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE company_id = @companyId AND user_id = @userId
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    if (!row) {
      throw new Error("USER_EMPLOYEE_LINK_REPLACE_MISSED");
    }
    return mapRow(row);
  },

  async deleteInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    userId: string,
  ): Promise<boolean> {
    await acquireTransactionAppLock(transaction, {
      resource: companyUserEmployeeLinkLockResource(companyId, userId),
    });

    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        DELETE FROM company_user_employee_links
        WHERE company_id = @companyId AND user_id = @userId
      `);
    return (result.rowsAffected[0] ?? 0) > 0;
  },
};
