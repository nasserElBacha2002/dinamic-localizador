import sql from "mssql";
import type { AssignmentConfirmationStatus } from "../constants/assignment-confirmation";
import { UPCOMING_ASSIGNMENTS_LIMIT } from "../constants/assignment-confirmation";
import { getPool } from "../database/connection";
import type { EmployeeAssignedOperation } from "../types/employee-assignment-query";
import { getOperationDayUtcBounds } from "../utils/absence-date";
import { mapEmployeeAssignedOperationRow } from "../utils/employee-assignment-row-mapper";

const ASSIGNED_OPERATION_SELECT = `
  SELECT
    ie.id AS assignment_id,
    i.id AS operation_id,
    i.scheduled_start,
    i.scheduled_end,
    i.status AS operation_status,
    s.name AS service_name,
    s.address AS service_address,
    s.locality AS service_locality,
    s.latitude AS service_latitude,
    s.longitude AS service_longitude,
    ie.confirmation_status,
    ar.received_at,
    ar.checkout_at,
    ar.punctuality_status
  FROM operation_assignments ie
  INNER JOIN scheduled_operations i
    ON i.id = ie.operation_id AND i.company_id = @companyId
  INNER JOIN operation_workdays ow
    ON ow.operation_id = i.id AND ow.company_id = i.company_id
   AND ow.work_date >= ie.valid_from
   AND (ie.valid_until IS NULL OR ow.work_date <= ie.valid_until)
  INNER JOIN operational_locations s
    ON s.id = i.service_id AND s.company_id = @companyId
  LEFT JOIN employee_workdays ew
    ON ew.operation_assignment_id = ie.id
   AND ew.company_id = ie.company_id
   AND ew.operation_workday_id = ow.id
  LEFT JOIN attendance_records ar
    ON ar.employee_workday_id = ew.id
   AND ar.company_id = @companyId
   AND ar.is_simulation = 0
  WHERE ie.company_id = @companyId
    AND ie.employee_id = @employeeId
    AND ie.cancelled_at IS NULL
    AND i.operation_kind = N'ONE_TIME'
    AND i.status NOT IN ('CANCELLED')
`;

export const employeeAssignmentQueryRepository = {
  async listTodayForEmployee(
    companyId: string,
    employeeId: string,
    at: Date,
    operationTimezone: string,
  ): Promise<EmployeeAssignedOperation[]> {
    const { dayStartUtc, nextDayStartUtc } = getOperationDayUtcBounds(at, operationTimezone);
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("dayStartUtc", sql.DateTime2, dayStartUtc)
      .input("nextDayStartUtc", sql.DateTime2, nextDayStartUtc)
      .query(`
        ${ASSIGNED_OPERATION_SELECT}
          AND i.scheduled_start >= @dayStartUtc
          AND i.scheduled_start < @nextDayStartUtc
        ORDER BY i.scheduled_start ASC
      `);

    return result.recordset.map((row) =>
      mapEmployeeAssignedOperationRow(row as Record<string, unknown>),
    );
  },

  async listUpcomingForEmployee(
    companyId: string,
    employeeId: string,
    at: Date,
    limit = UPCOMING_ASSIGNMENTS_LIMIT,
  ): Promise<EmployeeAssignedOperation[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("at", sql.DateTime2, at)
      .input("limit", sql.Int, limit)
      .query(`
        ${ASSIGNED_OPERATION_SELECT}
          AND i.scheduled_start >= @at
          AND i.status NOT IN ('COMPLETED', 'CANCELLED')
        ORDER BY i.scheduled_start ASC
        OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY
      `);

    return result.recordset.map((row) =>
      mapEmployeeAssignedOperationRow(row as Record<string, unknown>),
    );
  },

  async findByOperationForEmployee(
    companyId: string,
    employeeId: string,
    operationId: string,
  ): Promise<EmployeeAssignedOperation | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT TOP 1 *
        FROM (
          ${ASSIGNED_OPERATION_SELECT}
            AND ie.operation_id = @operationId
        ) assigned_operations
        ORDER BY scheduled_start ASC
      `);

    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapEmployeeAssignedOperationRow(row) : null;
  },

  async updateConfirmationStatus(
    companyId: string,
    assignmentId: string,
    status: AssignmentConfirmationStatus,
  ): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
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
            END,
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND id = @assignmentId
          AND cancelled_at IS NULL
      `);

    return (result.rowsAffected[0] ?? 0) > 0;
  },

  async resetConfirmationsForOperationScheduleChange(
    companyId: string,
    operationId: string,
    transaction?: sql.Transaction,
  ): Promise<number> {
    const request = transaction
      ? new sql.Request(transaction)
      : getPool().request();

    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        UPDATE operation_assignments
        SET confirmation_status = 'PENDING',
            confirmed_at = NULL,
            unavailable_at = NULL,
            confirmation_schedule_version = confirmation_schedule_version + 1
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND cancelled_at IS NULL
      `);

    return result.rowsAffected[0] ?? 0;
  },
};
