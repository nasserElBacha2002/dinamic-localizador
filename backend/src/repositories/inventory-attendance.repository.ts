import sql from "mssql";
import type { AssignmentConfirmationStatus } from "../constants/assignment-confirmation";
import { getPool } from "../database/connection";
import type { OperationalStatus } from "../types/auth";
import type { AttendanceRecord, Employee, Inventory, Store } from "../types/domain";
import { getPagination } from "../utils/pagination";
import { mapInventoryAttendanceSummaryRow } from "../utils/inventory-attendance-summary.mapper";
import { mapInventoryRow, mapStoreRow } from "../utils/row-mappers";

export interface InventoryAttendanceSummaryRow {
  employee: Employee;
  attendance: AttendanceRecord | null;
  operationalStatus: OperationalStatus;
  confirmationStatus: AssignmentConfirmationStatus;
  confirmedAt: string | null;
  unavailableAt: string | null;
}

export interface InventoryAttendanceSummaryCounts {
  assigned: number;
  checkedIn: number;
  valid: number;
  pendingReview: number;
  rejected: number;
  withoutCheckIn: number;
  confirmedEmployees: number;
  pendingConfirmationEmployees: number;
  unavailableEmployees: number;
}

const employeesBaseQuery = `
  FROM operation_assignments ie
  INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
  LEFT JOIN attendance_records ar
    ON ar.inventory_id = ie.inventory_id
   AND ar.employee_id = ie.employee_id
   AND ar.company_id = @companyId
   AND ar.is_simulation = 0
  WHERE ie.inventory_id = @inventoryId
    AND ie.company_id = @companyId
`;

export const inventoryAttendanceRepository = {
  async getAttendanceSummary(
    companyId: string,
    inventoryId: string,
    page = 1,
    limit = 10,
  ): Promise<{
    inventory: Inventory;
    store: Store;
    summary: InventoryAttendanceSummaryCounts;
    employees: InventoryAttendanceSummaryRow[];
    total: number;
  } | null> {
    const pool = getPool();
    const { offset } = getPagination(page, limit);

    const inventoryResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
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
        FROM scheduled_operations i
        INNER JOIN operational_locations s ON s.id = i.store_id AND s.company_id = i.company_id
        WHERE i.id = @inventoryId
          AND i.company_id = @companyId
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

    const summaryResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .query(`
        SELECT
          COUNT(*) AS assigned,
          SUM(CASE WHEN ar.id IS NOT NULL THEN 1 ELSE 0 END) AS checked_in,
          SUM(CASE WHEN ar.validation_status = 'VALID' THEN 1 ELSE 0 END) AS valid_count,
          SUM(CASE WHEN ar.validation_status = 'PENDING_REVIEW' THEN 1 ELSE 0 END) AS pending_review,
          SUM(CASE WHEN ar.validation_status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected,
          SUM(CASE WHEN ar.id IS NULL THEN 1 ELSE 0 END) AS without_check_in,
          SUM(CASE WHEN ie.confirmation_status = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed_employees,
          SUM(CASE WHEN ie.confirmation_status = 'PENDING' THEN 1 ELSE 0 END) AS pending_confirmation_employees,
          SUM(CASE WHEN ie.confirmation_status = 'UNAVAILABLE' THEN 1 ELSE 0 END) AS unavailable_employees
        ${employeesBaseQuery}
      `);

    const summaryRow = summaryResult.recordset[0] as Record<string, unknown>;
    const summary: InventoryAttendanceSummaryCounts = {
      assigned: Number(summaryRow.assigned ?? 0),
      checkedIn: Number(summaryRow.checked_in ?? 0),
      valid: Number(summaryRow.valid_count ?? 0),
      pendingReview: Number(summaryRow.pending_review ?? 0),
      rejected: Number(summaryRow.rejected ?? 0),
      withoutCheckIn: Number(summaryRow.without_check_in ?? 0),
      confirmedEmployees: Number(summaryRow.confirmed_employees ?? 0),
      pendingConfirmationEmployees: Number(summaryRow.pending_confirmation_employees ?? 0),
      unavailableEmployees: Number(summaryRow.unavailable_employees ?? 0),
    };

    const employeesResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .input("offset", sql.Int, offset)
      .input("limit", sql.Int, limit)
      .query(`
        SELECT
          e.*,
          ie.confirmation_status,
          ie.confirmed_at,
          ie.unavailable_at,
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
          ar.checkout_at,
          ar.checkout_latitude,
          ar.checkout_longitude,
          ar.checkout_distance_meters,
          ar.checkout_status,
          ar.checkout_review_reason,
          ar.early_departure_minutes,
          ar.extra_worked_minutes,
          ar.checkout_message_sid,
          ar.created_at AS attendance_created_at
        ${employeesBaseQuery}
        ORDER BY e.name ASC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    const employees = employeesResult.recordset.map((row) =>
      mapInventoryAttendanceSummaryRow(row as Record<string, unknown>),
    );

    return {
      inventory,
      store,
      summary,
      employees,
      total: summary.assigned,
    };
  },
};
