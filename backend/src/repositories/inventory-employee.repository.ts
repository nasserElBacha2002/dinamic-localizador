import sql from "mssql";
import { getPool } from "../database/connection";
import type { InventoryEmployeeAssignment } from "../types/domain";
import { mapAssignmentRow } from "../utils/row-mappers";

export const inventoryEmployeeRepository = {
  async assign(inventoryId: string, employeeId: string): Promise<InventoryEmployeeAssignment> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        INSERT INTO inventory_employees (inventory_id, employee_id)
        OUTPUT INSERTED.*
        VALUES (@inventoryId, @employeeId)
      `);

    return mapAssignmentRow(result.recordset[0] as Record<string, unknown>);
  },

  async exists(inventoryId: string, employeeId: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT TOP 1 1 AS found
        FROM inventory_employees
        WHERE inventory_id = @inventoryId AND employee_id = @employeeId
      `);

    return Boolean(result.recordset[0]);
  },

  async listByInventory(inventoryId: string): Promise<InventoryEmployeeAssignment[]> {
    const pool = getPool();
    const result = await pool.request().input("inventoryId", sql.UniqueIdentifier, inventoryId).query(`
      SELECT
        ie.*,
        e.name AS employee_name,
        e.document_number AS employee_document_number,
        e.phone_number AS employee_phone_number,
        e.employee_type AS employee_type,
        e.active AS employee_active,
        e.created_at AS employee_created_at,
        e.updated_at AS employee_updated_at
      FROM inventory_employees ie
      INNER JOIN employees e ON e.id = ie.employee_id
      WHERE ie.inventory_id = @inventoryId
      ORDER BY ie.assigned_at ASC
    `);

    return result.recordset.map((row) => mapAssignmentRow(row as Record<string, unknown>));
  },

  async remove(inventoryId: string, employeeId: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        DELETE FROM inventory_employees
        WHERE inventory_id = @inventoryId AND employee_id = @employeeId
      `);

    return (result.rowsAffected[0] ?? 0) > 0;
  },

  async hasAttendanceRecord(inventoryId: string, employeeId: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT TOP 1 1 AS found
        FROM attendance_records
        WHERE inventory_id = @inventoryId AND employee_id = @employeeId
      `);

    return Boolean(result.recordset[0]);
  },
};
