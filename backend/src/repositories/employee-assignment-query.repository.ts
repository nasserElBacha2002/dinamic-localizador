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
    i.operation_kind,
    ow.id AS operation_workday_id,
    ew.id AS employee_workday_id,
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

const EMPLOYEE_WORKDAY_OPERATIONS_SELECT = `
  SELECT
    ie.id AS assignment_id,
    i.id AS operation_id,
    i.operation_kind,
    ow.id AS operation_workday_id,
    ew.id AS employee_workday_id,
    ow.expected_start_at AS scheduled_start,
    ow.expected_end_at AS scheduled_end,
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
   AND ow.status = N'ACTIVE'
  INNER JOIN operational_locations s
    ON s.id = i.service_id AND s.company_id = @companyId
  LEFT JOIN employee_workdays ew
    ON ew.operation_assignment_id = ie.id
   AND ew.company_id = ie.company_id
   AND ew.operation_workday_id = ow.id
   AND ew.employee_id = ie.employee_id
  LEFT JOIN attendance_records ar
    ON ar.employee_workday_id = ew.id
   AND ar.company_id = @companyId
   AND ar.is_simulation = 0
  WHERE ie.company_id = @companyId
    AND ie.employee_id = @employeeId
    AND ie.cancelled_at IS NULL
    AND i.status NOT IN (N'CANCELLED')
    AND (ew.id IS NULL OR ew.expectation_status NOT IN (N'CANCELLED'))
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

  async listEmployeeOperations(
    companyId: string,
    employeeId: string,
    segment: "active" | "past",
    at: Date,
    pagination: { offset: number; limit: number },
    dateFrom?: Date | null,
    dateTo?: Date | null,
  ): Promise<{ rows: EmployeeAssignedOperation[]; total: number }> {
    const segmentClause =
      segment === "active"
        ? `
          AND (
            ow.expected_end_at IS NULL
            OR ow.expected_end_at >= @at
          )`
        : `
          AND ow.expected_end_at IS NOT NULL
          AND ow.expected_end_at < @at`;

    const dateClause = `
      AND (@dateFrom IS NULL OR ow.expected_start_at >= @dateFrom)
      AND (@dateTo IS NULL OR ow.expected_start_at <= @dateTo)
    `;

    const orderClause =
      segment === "active"
        ? "ORDER BY scheduled_start ASC, operation_workday_id ASC, assignment_id ASC"
        : "ORDER BY scheduled_start DESC, operation_workday_id DESC, assignment_id DESC";

    const pool = getPool();
    const countResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("at", sql.DateTime2, at)
      .input("dateFrom", sql.DateTime2, dateFrom ?? null)
      .input("dateTo", sql.DateTime2, dateTo ?? null)
      .query(`
        SELECT COUNT(*) AS total
        FROM (
          ${EMPLOYEE_WORKDAY_OPERATIONS_SELECT}
            ${segmentClause}
            ${dateClause}
        ) employee_workday_operations
      `);

    const total = Number((countResult.recordset[0] as { total: number }).total ?? 0);
    if (total === 0) {
      return { rows: [], total: 0 };
    }

    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("at", sql.DateTime2, at)
      .input("dateFrom", sql.DateTime2, dateFrom ?? null)
      .input("dateTo", sql.DateTime2, dateTo ?? null)
      .input("offset", sql.Int, pagination.offset)
      .input("limit", sql.Int, pagination.limit)
      .query(`
        SELECT *
        FROM (
          ${EMPLOYEE_WORKDAY_OPERATIONS_SELECT}
            ${segmentClause}
            ${dateClause}
        ) employee_workday_operations
        ${orderClause}
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    return {
      rows: result.recordset.map((row) =>
        mapEmployeeAssignedOperationRow(row as Record<string, unknown>),
      ),
      total,
    };
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

  /**
   * Atomic confirmation transition (CAS).
   * Requires `onlyIfStatusIn` so concurrent confirm/unavailable cannot both succeed.
   */
  async updateConfirmationStatus(
    companyId: string,
    assignmentId: string,
    status: AssignmentConfirmationStatus,
    onlyIfStatusIn: readonly AssignmentConfirmationStatus[],
  ): Promise<boolean> {
    if (onlyIfStatusIn.length === 0) {
      throw new Error("updateConfirmationStatus requires onlyIfStatusIn");
    }

    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .input("status", sql.NVarChar(20), status);

    const statusParams = onlyIfStatusIn.map((value, index) => {
      const name = `expectedStatus${index}`;
      request.input(name, sql.NVarChar(20), value);
      return `@${name}`;
    });

    const result = await request.query(`
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
          AND confirmation_status IN (${statusParams.join(", ")})
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
