import sql from "mssql";
import type { AssignmentConfirmationStatus } from "../constants/assignment-confirmation";
import { UPCOMING_ASSIGNMENTS_LIMIT } from "../constants/assignment-confirmation";
import { getPool } from "../database/connection";
import type { EmployeeAssignedInventory } from "../types/employee-assignment-query";
import { getOperationDayUtcBounds } from "../utils/absence-date";
import { mapEmployeeAssignedInventoryRow } from "../utils/employee-assignment-row-mapper";

const ASSIGNED_INVENTORY_SELECT = `
  SELECT
    i.id AS inventory_id,
    i.scheduled_start,
    i.scheduled_end,
    i.status AS inventory_status,
    s.name AS store_name,
    s.address AS store_address,
    s.latitude AS store_latitude,
    s.longitude AS store_longitude,
    ie.confirmation_status,
    ar.received_at,
    ar.checkout_at,
    ar.punctuality_status
  FROM operation_assignments ie
  INNER JOIN scheduled_operations i
    ON i.id = ie.inventory_id AND i.company_id = @companyId
  INNER JOIN operational_locations s
    ON s.id = i.store_id AND s.company_id = @companyId
  LEFT JOIN attendance_records ar
    ON ar.inventory_id = ie.inventory_id
   AND ar.employee_id = ie.employee_id
   AND ar.company_id = @companyId
   AND ar.is_simulation = 0
  WHERE ie.company_id = @companyId
    AND ie.employee_id = @employeeId
    AND i.status NOT IN ('CANCELLED')
`;

export const employeeAssignmentQueryRepository = {
  async listTodayForEmployee(
    companyId: string,
    employeeId: string,
    at: Date,
    operationTimezone: string,
  ): Promise<EmployeeAssignedInventory[]> {
    const { dayStartUtc, nextDayStartUtc } = getOperationDayUtcBounds(at, operationTimezone);
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("dayStartUtc", sql.DateTime2, dayStartUtc)
      .input("nextDayStartUtc", sql.DateTime2, nextDayStartUtc)
      .query(`
        ${ASSIGNED_INVENTORY_SELECT}
          AND i.scheduled_start >= @dayStartUtc
          AND i.scheduled_start < @nextDayStartUtc
        ORDER BY i.scheduled_start ASC
      `);

    return result.recordset.map((row) =>
      mapEmployeeAssignedInventoryRow(row as Record<string, unknown>),
    );
  },

  async listUpcomingForEmployee(
    companyId: string,
    employeeId: string,
    at: Date,
    limit = UPCOMING_ASSIGNMENTS_LIMIT,
  ): Promise<EmployeeAssignedInventory[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("at", sql.DateTime2, at)
      .input("limit", sql.Int, limit)
      .query(`
        ${ASSIGNED_INVENTORY_SELECT}
          AND i.scheduled_start >= @at
          AND i.status NOT IN ('COMPLETED', 'CANCELLED')
        ORDER BY i.scheduled_start ASC
        OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY
      `);

    return result.recordset.map((row) =>
      mapEmployeeAssignedInventoryRow(row as Record<string, unknown>),
    );
  },

  async findByInventoryForEmployee(
    companyId: string,
    employeeId: string,
    inventoryId: string,
  ): Promise<EmployeeAssignedInventory | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .query(`
        ${ASSIGNED_INVENTORY_SELECT}
          AND ie.inventory_id = @inventoryId
      `);

    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapEmployeeAssignedInventoryRow(row) : null;
  },

  async updateConfirmationStatus(
    companyId: string,
    employeeId: string,
    inventoryId: string,
    status: AssignmentConfirmationStatus,
  ): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .input("status", sql.NVarChar(20), status)
      .query(`
        UPDATE operation_assignments
        SET confirmation_status = @status,
            confirmed_at = CASE
              WHEN @status = 'CONFIRMED' THEN SYSUTCDATETIME()
              WHEN @status = 'UNAVAILABLE' THEN NULL
              ELSE confirmed_at
            END,
            unavailable_at = CASE
              WHEN @status = 'UNAVAILABLE' THEN SYSUTCDATETIME()
              WHEN @status = 'CONFIRMED' THEN NULL
              ELSE unavailable_at
            END
        WHERE company_id = @companyId
          AND employee_id = @employeeId
          AND inventory_id = @inventoryId
      `);

    return (result.rowsAffected[0] ?? 0) > 0;
  },
};
