import sql from "mssql";
import type { AssignmentConfirmationStatus } from "../constants/assignment-confirmation";
import { getPool } from "../database/connection";
import type { OperationalStatus } from "../types/auth";
import type { AttendanceRecord, Employee, Operation, Service } from "../types/domain";
import { getPagination } from "../utils/pagination";
import { mapOperationAttendanceSummaryRow } from "../utils/operation-attendance-summary.mapper";
import { mapOperationRow, mapServiceRow } from "../utils/row-mappers";
import { operationWorkdayRepository } from "./operation-workday.repository";

export interface OperationAttendanceSummaryRow {
  assignmentId: string;
  employee: Employee;
  attendance: AttendanceRecord | null;
  operationalStatus: OperationalStatus;
  confirmationStatus: AssignmentConfirmationStatus;
  confirmedAt: string | null;
  unavailableAt: string | null;
}

export interface OperationAttendanceSummaryCounts {
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
  FROM operation_assignments oa
  INNER JOIN operation_workdays ow
    ON ow.operation_id = oa.operation_id
   AND ow.company_id = oa.company_id
   AND ow.work_date = @workDate
  INNER JOIN employee_workdays ew
    ON ew.operation_assignment_id = oa.id
   AND ew.company_id = oa.company_id
   AND ew.operation_workday_id = ow.id
   AND ew.expectation_status <> 'CANCELLED'
  INNER JOIN employees e ON e.id = oa.employee_id AND e.company_id = @companyId
  LEFT JOIN attendance_records ar
    ON ar.employee_workday_id = ew.id
   AND ar.company_id = ew.company_id
   AND ar.is_simulation = 0
  WHERE oa.operation_id = @operationId
    AND oa.company_id = @companyId
    AND oa.cancelled_at IS NULL
    AND @workDate >= oa.valid_from
    AND (oa.valid_until IS NULL OR @workDate <= oa.valid_until)
`;

export const operationAttendanceRepository = {
  async getAttendanceSummary(
    companyId: string,
    operationId: string,
    page = 1,
    limit = 10,
  ): Promise<{
    operation: Operation;
    service: Service;
    summary: OperationAttendanceSummaryCounts;
    employees: OperationAttendanceSummaryRow[];
    total: number;
  } | null> {
    const pool = getPool();
    const { offset } = getPagination(page, limit);

    const operationResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT
          i.*,
          s.id AS service_ref_id,
          s.name AS service_name,
          s.address AS service_address,
          s.latitude AS service_latitude,
          s.longitude AS service_longitude,
          s.allowed_radius_meters AS service_allowed_radius_meters,
          s.google_place_id AS service_google_place_id,
          s.active AS service_active,
          s.created_at AS service_created_at,
          s.updated_at AS service_updated_at
        FROM scheduled_operations i
        INNER JOIN operational_locations s ON s.id = i.service_id AND s.company_id = i.company_id
        WHERE i.id = @operationId
          AND i.company_id = @companyId
      `);

    if (!operationResult.recordset[0]) {
      return null;
    }

    const operationRow = operationResult.recordset[0] as Record<string, unknown>;
    const operation = mapOperationRow(operationRow);
    const operationWorkdays = await operationWorkdayRepository.listByOperationId(
      companyId,
      operationId,
    );
    const workDate = operationWorkdays[0]?.workDate;
    if (!workDate) {
      return {
        operation,
        service: mapServiceRow({
          id: operationRow.service_ref_id,
          name: operationRow.service_name,
          address: operationRow.service_address,
          latitude: operationRow.service_latitude,
          longitude: operationRow.service_longitude,
          allowed_radius_meters: operationRow.service_allowed_radius_meters,
          google_place_id: operationRow.service_google_place_id,
          active: operationRow.service_active,
          created_at: operationRow.service_created_at,
          updated_at: operationRow.service_updated_at,
        }),
        summary: {
          assigned: 0,
          checkedIn: 0,
          valid: 0,
          pendingReview: 0,
          rejected: 0,
          withoutCheckIn: 0,
          confirmedEmployees: 0,
          pendingConfirmationEmployees: 0,
          unavailableEmployees: 0,
        },
        employees: [],
        total: 0,
      };
    }

    const service = mapServiceRow({
      id: operationRow.service_ref_id,
      name: operationRow.service_name,
      address: operationRow.service_address,
      latitude: operationRow.service_latitude,
      longitude: operationRow.service_longitude,
      allowed_radius_meters: operationRow.service_allowed_radius_meters,
      google_place_id: operationRow.service_google_place_id,
      active: operationRow.service_active,
      created_at: operationRow.service_created_at,
      updated_at: operationRow.service_updated_at,
    });

    const summaryResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("workDate", sql.Date, workDate)
      .query(`
        SELECT
          COUNT(*) AS assigned,
          SUM(CASE WHEN ar.id IS NOT NULL THEN 1 ELSE 0 END) AS checked_in,
          SUM(CASE WHEN ar.validation_status = 'VALID' THEN 1 ELSE 0 END) AS valid_count,
          SUM(CASE WHEN ar.validation_status = 'PENDING_REVIEW' THEN 1 ELSE 0 END) AS pending_review,
          SUM(CASE WHEN ar.validation_status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected,
          SUM(CASE WHEN ar.id IS NULL AND ew.expectation_status = 'EXPECTED' THEN 1 ELSE 0 END) AS without_check_in,
          SUM(CASE WHEN oa.confirmation_status = 'CONFIRMED' THEN 1 ELSE 0 END) AS confirmed_employees,
          SUM(CASE WHEN oa.confirmation_status = 'PENDING' THEN 1 ELSE 0 END) AS pending_confirmation_employees,
          SUM(CASE WHEN oa.confirmation_status = 'UNAVAILABLE' THEN 1 ELSE 0 END) AS unavailable_employees
        ${employeesBaseQuery}
      `);

    const summaryRow = summaryResult.recordset[0] as Record<string, unknown>;
    const summary: OperationAttendanceSummaryCounts = {
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
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("workDate", sql.Date, workDate)
      .input("offset", sql.Int, offset)
      .input("limit", sql.Int, limit)
      .query(`
        SELECT
          e.*,
          oa.id AS assignment_id,
          oa.confirmation_status,
          oa.confirmed_at,
          oa.unavailable_at,
          ew.id AS employee_workday_id,
          ar.id AS attendance_id,
          ar.operation_id AS attendance_operation_id,
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
      mapOperationAttendanceSummaryRow(row as Record<string, unknown>),
    );

    return {
      operation,
      service,
      summary,
      employees,
      total: summary.assigned,
    };
  },
};
