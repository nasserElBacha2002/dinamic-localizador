import sql from "mssql";
import { getPool } from "../database/connection";
import type { OperationEmployeeAssignment } from "../types/domain";
import { mapAssignmentRow } from "../utils/row-mappers";

export const operationEmployeeRepository = {
  async assign(
    companyId: string,
    operationId: string,
    employeeId: string,
  ): Promise<OperationEmployeeAssignment> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        INSERT INTO operation_assignments (company_id, operation_id, employee_id)
        OUTPUT INSERTED.*
        VALUES (@companyId, @operationId, @employeeId)
      `);

    return mapAssignmentRow(result.recordset[0] as Record<string, unknown>);
  },

  async assignInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    operationId: string,
    employeeId: string,
  ): Promise<OperationEmployeeAssignment> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        INSERT INTO operation_assignments (company_id, operation_id, employee_id)
        OUTPUT INSERTED.*
        VALUES (@companyId, @operationId, @employeeId)
      `);

    return mapAssignmentRow(result.recordset[0] as Record<string, unknown>);
  },

  async findAssignment(
    companyId: string,
    operationId: string,
    employeeId: string,
  ): Promise<OperationEmployeeAssignment | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT TOP 1 *
        FROM operation_assignments
        WHERE operation_id = @operationId
          AND employee_id = @employeeId
          AND company_id = @companyId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAssignmentRow(result.recordset[0] as Record<string, unknown>);
  },

  async exists(companyId: string, operationId: string, employeeId: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT TOP 1 1 AS found
        FROM operation_assignments
        WHERE operation_id = @operationId
          AND employee_id = @employeeId
          AND company_id = @companyId
      `);

    return Boolean(result.recordset[0]);
  },

  async listByOperation(
    companyId: string,
    operationId: string,
  ): Promise<OperationEmployeeAssignment[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
      SELECT
        ie.*,
        e.name AS employee_name,
        e.document_number AS employee_document_number,
        e.phone_number AS employee_phone_number,
        e.employee_type AS employee_type,
        e.active AS employee_active,
        e.created_at AS employee_created_at,
        e.updated_at AS employee_updated_at
      FROM operation_assignments ie
      INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
      WHERE ie.operation_id = @operationId
        AND ie.company_id = @companyId
      ORDER BY ie.assigned_at ASC
    `);

    return result.recordset.map((row) => mapAssignmentRow(row as Record<string, unknown>));
  },

  async remove(companyId: string, operationId: string, employeeId: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        DELETE FROM operation_assignments
        WHERE operation_id = @operationId
          AND employee_id = @employeeId
          AND company_id = @companyId
      `);

    return (result.rowsAffected[0] ?? 0) > 0;
  },

  async hasAttendanceRecord(
    companyId: string,
    operationId: string,
    employeeId: string,
  ): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT TOP 1 1 AS found
        FROM attendance_records
        WHERE operation_id = @operationId
          AND employee_id = @employeeId
          AND company_id = @companyId
      `);

    return Boolean(result.recordset[0]);
  },
};
