import sql from "mssql";
import { getPool } from "../database/connection";
import type { OperationalStatus } from "../types/auth";
import type { AttendanceRecord, Employee, Inventory, Store } from "../types/domain";
import { mapAttendanceRow, mapEmployeeRow, mapInventoryRow, mapStoreRow } from "../utils/row-mappers";

export interface InventoryAttendanceSummaryRow {
  employee: Employee;
  attendance: AttendanceRecord | null;
  operationalStatus: OperationalStatus;
}

const resolveOperationalStatus = (attendance: AttendanceRecord | null): OperationalStatus => {
  if (!attendance) {
    return "NO_CHECK_IN";
  }

  if (attendance.validationStatus === "VALID") {
    return "VALID";
  }

  if (attendance.validationStatus === "PENDING_REVIEW") {
    return "PENDING_REVIEW";
  }

  return "REJECTED";
};

export const inventoryAttendanceRepository = {
  async getAttendanceSummary(inventoryId: string): Promise<{
    inventory: Inventory;
    store: Store;
    employees: InventoryAttendanceSummaryRow[];
  } | null> {
    const pool = getPool();

    const inventoryResult = await pool
      .request()
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .query(`
        SELECT
          i.*,
          s.id AS store_ref_id,
          s.name AS store_name,
          s.address AS store_address,
          s.latitude AS store_latitude,
          s.longitude AS store_longitude,
          s.allowed_radius_meters AS store_allowed_radius_meters,
          s.google_place_id AS store_google_place_id,
          s.active AS store_active,
          s.created_at AS store_created_at,
          s.updated_at AS store_updated_at
        FROM inventories i
        INNER JOIN stores s ON s.id = i.store_id
        WHERE i.id = @inventoryId
      `);

    if (!inventoryResult.recordset[0]) {
      return null;
    }

    const inventoryRow = inventoryResult.recordset[0] as Record<string, unknown>;
    const inventory = mapInventoryRow(inventoryRow);
    const store = mapStoreRow({
      id: inventoryRow.store_ref_id,
      name: inventoryRow.store_name,
      address: inventoryRow.store_address,
      latitude: inventoryRow.store_latitude,
      longitude: inventoryRow.store_longitude,
      allowed_radius_meters: inventoryRow.store_allowed_radius_meters,
      google_place_id: inventoryRow.store_google_place_id,
      active: inventoryRow.store_active,
      created_at: inventoryRow.store_created_at,
      updated_at: inventoryRow.store_updated_at,
    });

    const employeesResult = await pool
      .request()
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .query(`
        SELECT
          e.*,
          ar.id AS attendance_id,
          ar.inventory_id AS attendance_inventory_id,
          ar.employee_id AS attendance_employee_id,
          ar.received_latitude,
          ar.received_longitude,
          ar.distance_meters,
          ar.validation_status,
          ar.location_status,
          ar.punctuality_status,
          ar.source_message_sid,
          ar.validation_reason,
          ar.reviewed_by,
          ar.reviewed_at,
          ar.review_reason,
          ar.received_at,
          ar.created_at AS attendance_created_at
        FROM inventory_employees ie
        INNER JOIN employees e ON e.id = ie.employee_id
        LEFT JOIN attendance_records ar
          ON ar.inventory_id = ie.inventory_id
         AND ar.employee_id = ie.employee_id
        WHERE ie.inventory_id = @inventoryId
        ORDER BY e.name ASC
      `);

    const employees = employeesResult.recordset.map((row) => {
      const employee = mapEmployeeRow(row as Record<string, unknown>);
      const attendance = row.attendance_id
        ? mapAttendanceRow({
            id: row.attendance_id,
            inventory_id: row.attendance_inventory_id,
            employee_id: row.attendance_employee_id,
            received_latitude: row.received_latitude,
            received_longitude: row.received_longitude,
            distance_meters: row.distance_meters,
            validation_status: row.validation_status,
            location_status: row.location_status,
            punctuality_status: row.punctuality_status,
            source_message_sid: row.source_message_sid,
            validation_reason: row.validation_reason,
            reviewed_by: row.reviewed_by,
            reviewed_at: row.reviewed_at,
            review_reason: row.review_reason,
            received_at: row.received_at,
            created_at: row.attendance_created_at,
          } as Record<string, unknown>)
        : null;

      return {
        employee,
        attendance,
        operationalStatus: resolveOperationalStatus(attendance),
      };
    });

    return { inventory, store, employees };
  },
};
