import sql from "mssql";
import { getPool } from "../database/connection";
import type { Client, Employee } from "../types/domain";
import { mapEmployeeRow } from "../utils/row-mappers";

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

export const employeeClientRepository = {
  async listAssociatedEmployeeIds(
    companyId: string,
    clientId: string,
    candidateEmployeeIds: string[],
  ): Promise<string[]> {
    if (candidateEmployeeIds.length === 0) {
      return [];
    }
    const result = await getPool().request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("clientId", sql.UniqueIdentifier, clientId)
      .input("candidateIds", sql.NVarChar(sql.MAX), JSON.stringify(candidateEmployeeIds))
      .query(`
        SELECT ec.employee_id
        FROM employee_clients ec
        INNER JOIN OPENJSON(@candidateIds) candidates
          ON TRY_CAST(candidates.[value] AS UNIQUEIDENTIFIER) = ec.employee_id
        WHERE ec.company_id = @companyId
          AND ec.client_id = @clientId
      `);
    return result.recordset.map((row) => String((row as { employee_id: string }).employee_id));
  },

  async listByClient(companyId: string, clientId: string): Promise<Employee[]> {
    const result = await getPool().request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("clientId", sql.UniqueIdentifier, clientId)
      .query(`
        SELECT e.*, CAST(NULL AS DATETIME2) AS last_worked_at
        FROM employee_clients ec
        INNER JOIN employees e ON e.id = ec.employee_id AND e.company_id = ec.company_id
        WHERE ec.company_id = @companyId AND ec.client_id = @clientId
        ORDER BY e.name ASC, e.id ASC
      `);
    return result.recordset.map((row) => mapEmployeeRow(row as Record<string, unknown>));
  },

  async listEmployeeIdsByClient(companyId: string, clientId: string): Promise<string[]> {
    const result = await getPool().request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("clientId", sql.UniqueIdentifier, clientId)
      .query(`SELECT employee_id FROM employee_clients WHERE company_id = @companyId AND client_id = @clientId`);
    return result.recordset.map((row) => String((row as { employee_id: string }).employee_id));
  },

  async listClientsByEmployee(companyId: string, employeeId: string): Promise<Client[]> {
    const result = await getPool().request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT c.*
        FROM employee_clients ec
        INNER JOIN clients c ON c.id = ec.client_id AND c.company_id = ec.company_id
        WHERE ec.company_id = @companyId AND ec.employee_id = @employeeId
        ORDER BY c.name ASC, c.id ASC
      `);
    return result.recordset.map((row) => mapClientRow(row as Record<string, unknown>));
  },

  async listClientIdsByEmployee(companyId: string, employeeId: string): Promise<string[]> {
    const result = await getPool().request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`SELECT client_id FROM employee_clients WHERE company_id = @companyId AND employee_id = @employeeId`);
    return result.recordset.map((row) => String((row as { client_id: string }).client_id));
  },

  async replaceForClient(
    transaction: sql.Transaction,
    companyId: string,
    clientId: string,
    employeeIds: string[],
    createdBy: string | null,
  ): Promise<void> {
    const request = new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("clientId", sql.UniqueIdentifier, clientId)
      .input("createdBy", sql.UniqueIdentifier, createdBy)
      .input("employeeIds", sql.NVarChar(sql.MAX), JSON.stringify(employeeIds));
    await request.query(`
      DELETE ec FROM employee_clients ec
      WHERE ec.company_id = @companyId AND ec.client_id = @clientId
        AND NOT EXISTS (SELECT 1 FROM OPENJSON(@employeeIds) j WHERE TRY_CAST(j.value AS UNIQUEIDENTIFIER) = ec.employee_id);
      INSERT INTO employee_clients (company_id, employee_id, client_id, created_by)
      SELECT @companyId, TRY_CAST(j.value AS UNIQUEIDENTIFIER), @clientId, @createdBy
      FROM OPENJSON(@employeeIds) j
      WHERE NOT EXISTS (
        SELECT 1 FROM employee_clients ec
        WHERE ec.company_id = @companyId AND ec.client_id = @clientId
          AND ec.employee_id = TRY_CAST(j.value AS UNIQUEIDENTIFIER)
      );
    `);
  },

  async replaceForEmployee(
    transaction: sql.Transaction,
    companyId: string,
    employeeId: string,
    clientIds: string[],
    createdBy: string | null,
  ): Promise<void> {
    const request = new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("createdBy", sql.UniqueIdentifier, createdBy)
      .input("clientIds", sql.NVarChar(sql.MAX), JSON.stringify(clientIds));
    await request.query(`
      DELETE ec FROM employee_clients ec
      WHERE ec.company_id = @companyId AND ec.employee_id = @employeeId
        AND NOT EXISTS (SELECT 1 FROM OPENJSON(@clientIds) j WHERE TRY_CAST(j.value AS UNIQUEIDENTIFIER) = ec.client_id);
      INSERT INTO employee_clients (company_id, employee_id, client_id, created_by)
      SELECT @companyId, @employeeId, TRY_CAST(j.value AS UNIQUEIDENTIFIER), @createdBy
      FROM OPENJSON(@clientIds) j
      WHERE NOT EXISTS (
        SELECT 1 FROM employee_clients ec
        WHERE ec.company_id = @companyId AND ec.employee_id = @employeeId
          AND ec.client_id = TRY_CAST(j.value AS UNIQUEIDENTIFIER)
      );
    `);
  },

  async remove(companyId: string, clientId: string, employeeId: string): Promise<boolean> {
    const result = await getPool().request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("clientId", sql.UniqueIdentifier, clientId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`DELETE FROM employee_clients WHERE company_id = @companyId AND client_id = @clientId AND employee_id = @employeeId`);
    return (result.rowsAffected[0] ?? 0) > 0;
  },
};
