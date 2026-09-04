import sql from "mssql";
import { getPool } from "../database/connection";
import type {
  EmployeeWorkdayCheckInCandidate,
  EmployeeWorkdayCheckoutCandidate,
} from "../types/employee-workday-availability";
import type { OperationKind } from "../constants/operation-kind";
import { toDateOnlyString } from "../utils/row-mappers";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const requestFrom = (transaction?: sql.Transaction): sql.Request =>
  transaction ? new sql.Request(transaction) : getPool().request();

const mapCheckInCandidateRow = (row: Record<string, unknown>): EmployeeWorkdayCheckInCandidate => ({
  employeeWorkdayId: String(row.employee_workday_id),
  operationWorkdayId: String(row.operation_workday_id),
  operationId: String(row.operation_id),
  serviceId: String(row.service_id),
  serviceName: String(row.service_name),
  serviceAddress: row.service_address ? String(row.service_address) : null,
  serviceLocality: row.service_locality ? String(row.service_locality) : null,
  serviceLatitude: Number(row.service_latitude),
  serviceLongitude: Number(row.service_longitude),
  allowedRadiusMeters: Number(row.allowed_radius_meters),
  operationKind: String(row.operation_kind) as OperationKind,
  workDate: toDateOnlyString(row.work_date as Date | string),
  expectedStartAt: toIsoString(row.expected_start_at as Date | string),
  expectedEndAt: row.expected_end_at
    ? toIsoString(row.expected_end_at as Date | string)
    : null,
  earlyToleranceMinutes: Number(row.early_tolerance_minutes),
  lateToleranceMinutes: Number(row.late_tolerance_minutes),
  scheduleTimezone: row.schedule_timezone_snapshot
    ? String(row.schedule_timezone_snapshot)
    : "America/Argentina/Buenos_Aires",
  expectationStatus:
    String(row.expectation_status) === "JUSTIFIED" ? "JUSTIFIED" : "EXPECTED",
  absenceRequestId: row.absence_request_id ? String(row.absence_request_id) : null,
  operationAssignmentId: row.operation_assignment_id
    ? String(row.operation_assignment_id)
    : null,
});

const mapCheckoutCandidateRow = (row: Record<string, unknown>): EmployeeWorkdayCheckoutCandidate => ({
  ...mapCheckInCandidateRow(row),
  attendanceRecordId: row.attendance_record_id ? String(row.attendance_record_id) : null,
  checkInAt: row.check_in_at ? toIsoString(row.check_in_at as Date | string) : null,
  checkoutWithoutArrival: Number(row.checkout_without_arrival ?? 0) === 1,
});

const simulationAttendanceFilter = (simulationSessionId: string | null): string => {
  if (simulationSessionId) {
    return "AND ar.is_simulation = 1 AND ar.simulation_session_id = @simulationSessionId";
  }
  return "AND ar.is_simulation = 0";
};

const CHECK_IN_CANDIDATE_SELECT = `
  ew.id AS employee_workday_id,
  ew.expectation_status,
  ew.absence_request_id,
  ew.operation_assignment_id,
  ow.id AS operation_workday_id,
  i.id AS operation_id,
  i.service_id,
  i.operation_kind,
  ow.work_date,
  ow.expected_start_at,
  ow.expected_end_at,
  ow.early_tolerance_minutes,
  ow.late_tolerance_minutes,
  ow.schedule_timezone_snapshot,
  s.name AS service_name,
  s.address AS service_address,
  s.locality AS service_locality,
  s.latitude AS service_latitude,
  s.longitude AS service_longitude,
  s.allowed_radius_meters
`;

const CHECK_IN_EXPECTATION_FILTER = `
  AND (
    ew.expectation_status = 'EXPECTED'
    OR (
      ew.expectation_status = 'JUSTIFIED'
      AND ew.absence_request_id IS NOT NULL
    )
  )
`;

export const employeeWorkdayAvailabilityRepository = {
  async listCheckInCandidates(
    companyId: string,
    employeeId: string,
    input: {
      candidateFrom: Date;
      candidateTo: Date;
      simulationSessionId?: string | null;
    },
  ): Promise<EmployeeWorkdayCheckInCandidate[]> {
    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("candidateFrom", sql.DateTime2, input.candidateFrom)
      .input("candidateTo", sql.DateTime2, input.candidateTo);

    const attendanceFilter = simulationAttendanceFilter(input.simulationSessionId ?? null);
    if (input.simulationSessionId) {
      request.input("simulationSessionId", sql.UniqueIdentifier, input.simulationSessionId);
    }

    const result = await request.query(`
      SELECT ${CHECK_IN_CANDIDATE_SELECT}
      FROM employee_workdays ew
      INNER JOIN operation_workdays ow
        ON ow.id = ew.operation_workday_id
       AND ow.company_id = ew.company_id
      INNER JOIN scheduled_operations i
        ON i.id = ow.operation_id
       AND i.company_id = ew.company_id
      INNER JOIN operational_locations s
        ON s.id = i.service_id
       AND s.company_id = ew.company_id
      LEFT JOIN attendance_records ar
        ON ar.employee_workday_id = ew.id
       AND ar.company_id = ew.company_id
       AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
       ${attendanceFilter}
      WHERE ew.company_id = @companyId
        AND ew.employee_id = @employeeId
        ${CHECK_IN_EXPECTATION_FILTER}
        AND ow.status = 'ACTIVE'
        AND i.status NOT IN ('COMPLETED', 'CANCELLED')
        AND s.active = 1
        AND ar.id IS NULL
        AND @candidateFrom < COALESCE(
          ow.expected_end_at,
          DATEADD(MINUTE, ow.late_tolerance_minutes, ow.expected_start_at)
        )
        AND @candidateTo >= DATEADD(MINUTE, -ow.early_tolerance_minutes, ow.expected_start_at)
      ORDER BY ow.expected_start_at ASC, s.name ASC, ew.id ASC
    `);

    return result.recordset.map((row) =>
      mapCheckInCandidateRow(row as Record<string, unknown>),
    );
  },

  async findCheckInCandidateById(
    companyId: string,
    employeeId: string,
    employeeWorkdayId: string,
    input?: { simulationSessionId?: string | null },
  ): Promise<EmployeeWorkdayCheckInCandidate | null> {
    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId);

    const attendanceFilter = simulationAttendanceFilter(input?.simulationSessionId ?? null);
    if (input?.simulationSessionId) {
      request.input("simulationSessionId", sql.UniqueIdentifier, input.simulationSessionId);
    }

    const result = await request.query(`
      SELECT ${CHECK_IN_CANDIDATE_SELECT}
      FROM employee_workdays ew
      INNER JOIN operation_workdays ow
        ON ow.id = ew.operation_workday_id
       AND ow.company_id = ew.company_id
      INNER JOIN scheduled_operations i
        ON i.id = ow.operation_id
       AND i.company_id = ew.company_id
      INNER JOIN operational_locations s
        ON s.id = i.service_id
       AND s.company_id = ew.company_id
      LEFT JOIN attendance_records ar
        ON ar.employee_workday_id = ew.id
       AND ar.company_id = ew.company_id
       AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
       ${attendanceFilter}
      WHERE ew.company_id = @companyId
        AND ew.employee_id = @employeeId
        AND ew.id = @employeeWorkdayId
        ${CHECK_IN_EXPECTATION_FILTER}
        AND ow.status = 'ACTIVE'
        AND i.status NOT IN ('COMPLETED', 'CANCELLED')
        AND s.active = 1
        AND ar.id IS NULL
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapCheckInCandidateRow(result.recordset[0] as Record<string, unknown>);
  },

  async hasJustifiedWorkdayInRange(
    companyId: string,
    employeeId: string,
    input: { candidateFrom: Date; candidateTo: Date },
  ): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("candidateFrom", sql.DateTime2, input.candidateFrom)
      .input("candidateTo", sql.DateTime2, input.candidateTo)
      .query(`
        SELECT TOP 1 1 AS found
        FROM employee_workdays ew
        INNER JOIN operation_workdays ow
          ON ow.id = ew.operation_workday_id
         AND ow.company_id = ew.company_id
        WHERE ew.company_id = @companyId
          AND ew.employee_id = @employeeId
          AND ew.expectation_status = 'JUSTIFIED'
          AND ow.status = 'ACTIVE'
          AND @candidateFrom <= COALESCE(ow.expected_end_at, ow.expected_start_at)
          AND @candidateTo >= ow.expected_start_at
      `);

    return Boolean(result.recordset[0]);
  },

  /**
   * Lightweight nearby-workday snapshot for empty check-in diagnostics.
   * Intentionally limited to ±7 days around `at` to avoid heavy scans.
   */
  async listNearbyWorkdayDiagnostics(
    companyId: string,
    employeeId: string,
    at: Date,
  ): Promise<
    Array<{
      operationId: string;
      operationKind: string;
      operationWorkdayId: string;
      employeeWorkdayId: string;
      workDate: string;
      expectedStartAt: string;
      expectedEndAt: string | null;
      expectationStatus: string;
      operationWorkdayStatus: string;
      operationStatus: string;
      locationActive: boolean;
      hasAttendance: boolean;
      priorAttendanceId: string | null;
      earlyToleranceMinutes: number;
      lateToleranceMinutes: number;
    }>
  > {
    const pool = getPool();
    const windowFrom = new Date(at.getTime() - 7 * 24 * 60 * 60 * 1000);
    const windowTo = new Date(at.getTime() + 7 * 24 * 60 * 60 * 1000);
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("windowFrom", sql.DateTime2, windowFrom)
      .input("windowTo", sql.DateTime2, windowTo)
      .query(`
        SELECT TOP 20
          i.id AS operation_id,
          i.operation_kind,
          ow.id AS operation_workday_id,
          ew.id AS employee_workday_id,
          ow.work_date,
          ow.expected_start_at,
          ow.expected_end_at,
          ew.expectation_status,
          ow.status AS operation_workday_status,
          i.status AS operation_status,
          s.active AS location_active,
          ow.early_tolerance_minutes,
          ow.late_tolerance_minutes,
          (
            SELECT TOP 1 CAST(ar.id AS NVARCHAR(36))
            FROM attendance_records ar
            WHERE ar.employee_workday_id = ew.id
              AND ar.company_id = ew.company_id
              AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
              AND ar.is_simulation = 0
            ORDER BY ar.received_at ASC
          ) AS prior_attendance_id
        FROM employee_workdays ew
        INNER JOIN operation_workdays ow
          ON ow.id = ew.operation_workday_id
         AND ow.company_id = ew.company_id
        INNER JOIN scheduled_operations i
          ON i.id = ow.operation_id
         AND i.company_id = ew.company_id
        INNER JOIN operational_locations s
          ON s.id = i.service_id
         AND s.company_id = ew.company_id
        WHERE ew.company_id = @companyId
          AND ew.employee_id = @employeeId
          AND ow.expected_start_at >= @windowFrom
          AND ow.expected_start_at <= @windowTo
        ORDER BY ow.expected_start_at ASC
      `);

    return result.recordset.map((row) => ({
      operationId: String(row.operation_id),
      operationKind: String(row.operation_kind),
      operationWorkdayId: String(row.operation_workday_id),
      employeeWorkdayId: String(row.employee_workday_id),
      workDate: toDateOnlyString(row.work_date as Date | string),
      expectedStartAt: toIsoString(row.expected_start_at as Date | string),
      expectedEndAt: row.expected_end_at
        ? toIsoString(row.expected_end_at as Date | string)
        : null,
      expectationStatus: String(row.expectation_status),
      operationWorkdayStatus: String(row.operation_workday_status),
      operationStatus: String(row.operation_status),
      locationActive: Boolean(row.location_active),
      hasAttendance: Boolean(row.prior_attendance_id),
      priorAttendanceId: row.prior_attendance_id ? String(row.prior_attendance_id) : null,
      earlyToleranceMinutes: Number(row.early_tolerance_minutes),
      lateToleranceMinutes: Number(row.late_tolerance_minutes),
    }));
  },

  /**
   * Today's materialized workdays for WhatsApp "Mi jornada" (ONE_TIME + RECURRING).
   */
  async listTodayWorkdaysForEmployee(
    companyId: string,
    employeeId: string,
    workDate: string,
  ): Promise<
    Array<{
      assignmentId: string;
      operationId: string;
      serviceName: string;
      serviceAddress: string | null;
      serviceLocality: string | null;
      serviceLatitude: number | null;
      serviceLongitude: number | null;
      scheduledStart: string;
      scheduledEnd: string;
      operationStatus: string;
      confirmationStatus: string;
      attendanceReceivedAt: string | null;
      attendanceCheckoutAt: string | null;
      punctualityStatus: string | null;
      employeeWorkdayId: string;
      operationWorkdayId: string;
      expectationStatus: string;
    }>
  > {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("workDate", sql.Date, workDate)
      .query(`
        SELECT
          COALESCE(CAST(ew.operation_assignment_id AS NVARCHAR(36)), CAST(ie.id AS NVARCHAR(36)), CAST(ew.id AS NVARCHAR(36))) AS assignment_id,
          i.id AS operation_id,
          ow.expected_start_at AS scheduled_start,
          ow.expected_end_at AS scheduled_end,
          i.status AS operation_status,
          s.name AS service_name,
          s.address AS service_address,
          s.locality AS service_locality,
          s.latitude AS service_latitude,
          s.longitude AS service_longitude,
          COALESCE(ie.confirmation_status, N'PENDING') AS confirmation_status,
          ar.received_at,
          ar.checkout_at,
          ar.punctuality_status,
          ew.id AS employee_workday_id,
          ow.id AS operation_workday_id,
          ew.expectation_status
        FROM employee_workdays ew
        INNER JOIN operation_workdays ow
          ON ow.id = ew.operation_workday_id
         AND ow.company_id = ew.company_id
        INNER JOIN scheduled_operations i
          ON i.id = ow.operation_id
         AND i.company_id = ew.company_id
        INNER JOIN operational_locations s
          ON s.id = i.service_id
         AND s.company_id = ew.company_id
        LEFT JOIN operation_assignments ie
          ON ie.company_id = ew.company_id
         AND ie.employee_id = ew.employee_id
         AND ie.operation_id = i.id
         AND ie.cancelled_at IS NULL
         AND (
           ew.operation_assignment_id IS NULL
           OR ie.id = ew.operation_assignment_id
         )
        LEFT JOIN attendance_records ar
          ON ar.employee_workday_id = ew.id
         AND ar.company_id = @companyId
         AND ar.is_simulation = 0
         AND ar.validation_status IN (N'VALID', N'PENDING_REVIEW')
        WHERE ew.company_id = @companyId
          AND ew.employee_id = @employeeId
          AND ow.work_date = @workDate
          AND ow.status = N'ACTIVE'
          AND i.status NOT IN (N'CANCELLED')
          AND ew.expectation_status IN (N'EXPECTED', N'JUSTIFIED')
          AND s.active = 1
          AND (
            ie.id IS NOT NULL
            OR ew.operation_assignment_id IS NOT NULL
            OR i.operation_kind = N'RECURRING'
          )
        ORDER BY ow.expected_start_at ASC, ow.expected_end_at ASC, ew.id ASC
      `);

    return result.recordset.map((row) => ({
      assignmentId: String(row.assignment_id),
      operationId: String(row.operation_id),
      serviceName: String(row.service_name),
      serviceAddress: row.service_address ? String(row.service_address) : null,
      serviceLocality: row.service_locality ? String(row.service_locality) : null,
      serviceLatitude:
        row.service_latitude === null || row.service_latitude === undefined
          ? null
          : Number(row.service_latitude),
      serviceLongitude:
        row.service_longitude === null || row.service_longitude === undefined
          ? null
          : Number(row.service_longitude),
      scheduledStart: toIsoString(row.scheduled_start as Date | string),
      scheduledEnd: row.scheduled_end
        ? toIsoString(row.scheduled_end as Date | string)
        : toIsoString(row.scheduled_start as Date | string),
      operationStatus: String(row.operation_status),
      confirmationStatus: String(row.confirmation_status ?? "PENDING"),
      attendanceReceivedAt: row.received_at
        ? toIsoString(row.received_at as Date | string)
        : null,
      attendanceCheckoutAt: row.checkout_at
        ? toIsoString(row.checkout_at as Date | string)
        : null,
      punctualityStatus: row.punctuality_status ? String(row.punctuality_status) : null,
      employeeWorkdayId: String(row.employee_workday_id),
      operationWorkdayId: String(row.operation_workday_id),
      expectationStatus: String(row.expectation_status),
    }));
  },

  /**
   * Starts from active ONE_TIME assignments (not a nearby time window) so
   * historical schedule drift outside ±7 days is still visible.
   */
  async listAssignedOneTimeDiagnostics(
    companyId: string,
    employeeId: string,
    at: Date,
  ): Promise<
    Array<{
      operationId: string;
      operationStatus: string;
      scheduledStart: string;
      scheduledEnd: string | null;
      assignmentId: string;
      validFrom: string;
      validUntil: string | null;
      locationActive: boolean;
      operationWorkdayId: string | null;
      workDate: string | null;
      expectedStartAt: string | null;
      expectedEndAt: string | null;
      operationWorkdayStatus: string | null;
      scheduleMatches: boolean;
      employeeWorkdayId: string | null;
      expectationStatus: string | null;
      hasAttendance: boolean;
    }>
  > {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("at", sql.DateTime2, at)
      .query(`
        SELECT TOP 30
          i.id AS operation_id,
          i.status AS operation_status,
          i.scheduled_start,
          i.scheduled_end,
          ie.id AS assignment_id,
          ie.valid_from,
          ie.valid_until,
          s.active AS location_active,
          ow.id AS operation_workday_id,
          ow.work_date,
          ow.expected_start_at,
          ow.expected_end_at,
          ow.status AS operation_workday_status,
          ew.id AS employee_workday_id,
          ew.expectation_status,
          CASE
            WHEN ow.id IS NULL THEN 0
            WHEN ow.expected_start_at = i.scheduled_start
             AND (
               (i.scheduled_end IS NULL AND ow.expected_end_at IS NULL)
               OR i.scheduled_end = ow.expected_end_at
             )
            THEN 1 ELSE 0
          END AS schedule_matches,
          CASE WHEN EXISTS (
            SELECT 1
            FROM attendance_records ar
            WHERE ar.employee_workday_id = ew.id
              AND ar.company_id = ew.company_id
              AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
          ) THEN 1 ELSE 0 END AS has_attendance
        FROM operation_assignments ie
        INNER JOIN scheduled_operations i
          ON i.id = ie.operation_id
         AND i.company_id = ie.company_id
        INNER JOIN operational_locations s
          ON s.id = i.service_id
         AND s.company_id = ie.company_id
        LEFT JOIN operation_workdays ow
          ON ow.operation_id = i.id
         AND ow.company_id = ie.company_id
        LEFT JOIN employee_workdays ew
          ON ew.operation_workday_id = ow.id
         AND ew.company_id = ie.company_id
         AND ew.employee_id = ie.employee_id
        WHERE ie.company_id = @companyId
          AND ie.employee_id = @employeeId
          AND ie.cancelled_at IS NULL
          AND i.operation_kind = N'ONE_TIME'
          AND i.status NOT IN (N'CANCELLED')
          AND i.scheduled_start >= DATEADD(DAY, -45, @at)
          AND i.scheduled_start <= DATEADD(DAY, 45, @at)
        ORDER BY i.scheduled_start ASC
      `);

    return result.recordset.map((row) => ({
      operationId: String(row.operation_id),
      operationStatus: String(row.operation_status),
      scheduledStart: toIsoString(row.scheduled_start as Date | string),
      scheduledEnd: row.scheduled_end
        ? toIsoString(row.scheduled_end as Date | string)
        : null,
      assignmentId: String(row.assignment_id),
      validFrom: String(row.valid_from).slice(0, 10),
      validUntil: row.valid_until ? String(row.valid_until).slice(0, 10) : null,
      locationActive: Boolean(row.location_active),
      operationWorkdayId: row.operation_workday_id ? String(row.operation_workday_id) : null,
      workDate: row.work_date ? toDateOnlyString(row.work_date as Date | string) : null,
      expectedStartAt: row.expected_start_at
        ? toIsoString(row.expected_start_at as Date | string)
        : null,
      expectedEndAt: row.expected_end_at
        ? toIsoString(row.expected_end_at as Date | string)
        : null,
      operationWorkdayStatus: row.operation_workday_status
        ? String(row.operation_workday_status)
        : null,
      scheduleMatches: Number(row.schedule_matches) === 1,
      employeeWorkdayId: row.employee_workday_id ? String(row.employee_workday_id) : null,
      expectationStatus: row.expectation_status ? String(row.expectation_status) : null,
      hasAttendance: Number(row.has_attendance) === 1,
    }));
  },

  async listCheckoutCandidates(
    companyId: string,
    employeeId: string,
    input: {
      now: Date;
      pendingOperationExpirationHours: number;
      simulationSessionId?: string | null;
    },
  ): Promise<EmployeeWorkdayCheckoutCandidate[]> {
    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("now", sql.DateTime2, input.now)
      .input(
        "pendingOperationExpirationHours",
        sql.Int,
        input.pendingOperationExpirationHours,
      );

    const simulationFilter = input.simulationSessionId
      ? "AND ar.is_simulation = 1 AND ar.simulation_session_id = @simulationSessionId"
      : "AND ar.is_simulation = 0";

    if (input.simulationSessionId) {
      request.input("simulationSessionId", sql.UniqueIdentifier, input.simulationSessionId);
    }

    const result = await request.query(`
      SELECT
        ar.id AS attendance_record_id,
        ar.received_at AS check_in_at,
        ${CHECK_IN_CANDIDATE_SELECT}
      FROM attendance_records ar
      INNER JOIN employee_workdays ew
        ON ew.id = ar.employee_workday_id
       AND ew.company_id = ar.company_id
      INNER JOIN operation_workdays ow
        ON ow.id = ew.operation_workday_id
       AND ow.company_id = ew.company_id
      INNER JOIN scheduled_operations i
        ON i.id = ow.operation_id
       AND i.company_id = ar.company_id
      INNER JOIN operational_locations s
        ON s.id = i.service_id
       AND s.company_id = ar.company_id
      WHERE ar.company_id = @companyId
        AND ar.employee_id = @employeeId
        AND ar.employee_workday_id IS NOT NULL
        AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
        AND ar.checkout_at IS NULL
        AND ar.received_at IS NOT NULL
        AND i.status <> 'CANCELLED'
        AND s.active = 1
        AND @now <= DATEADD(
          HOUR,
          @pendingOperationExpirationHours,
          COALESCE(ow.expected_end_at, ow.expected_start_at)
        )
        ${simulationFilter}
      ORDER BY ar.received_at ASC, s.name ASC, ew.id ASC
    `);

    return result.recordset.map((row) =>
      mapCheckoutCandidateRow({
        ...(row as Record<string, unknown>),
        checkout_without_arrival: 0,
      }),
    );
  },

  /**
   * Assignments eligible for checkout when no attendance (check-in) exists yet.
   * Sourced from employee_workdays — not from open attendance_records.
   */
  async listExitWithoutArrivalCandidates(
    companyId: string,
    employeeId: string,
    input: {
      now: Date;
      pendingOperationExpirationHours: number;
      simulationSessionId?: string | null;
    },
  ): Promise<EmployeeWorkdayCheckoutCandidate[]> {
    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("now", sql.DateTime2, input.now)
      .input(
        "pendingOperationExpirationHours",
        sql.Int,
        input.pendingOperationExpirationHours,
      );

    const attendanceFilter = simulationAttendanceFilter(input.simulationSessionId ?? null);
    if (input.simulationSessionId) {
      request.input("simulationSessionId", sql.UniqueIdentifier, input.simulationSessionId);
    }

    const result = await request.query(`
      SELECT
        CAST(NULL AS UNIQUEIDENTIFIER) AS attendance_record_id,
        CAST(NULL AS DATETIME2) AS check_in_at,
        CAST(1 AS BIT) AS checkout_without_arrival,
        ${CHECK_IN_CANDIDATE_SELECT}
      FROM employee_workdays ew
      INNER JOIN operation_workdays ow
        ON ow.id = ew.operation_workday_id
       AND ow.company_id = ew.company_id
      INNER JOIN scheduled_operations i
        ON i.id = ow.operation_id
       AND i.company_id = ew.company_id
      INNER JOIN operational_locations s
        ON s.id = i.service_id
       AND s.company_id = ew.company_id
      LEFT JOIN attendance_records ar
        ON ar.employee_workday_id = ew.id
       AND ar.company_id = ew.company_id
       AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
       ${attendanceFilter}
      WHERE ew.company_id = @companyId
        AND ew.employee_id = @employeeId
        ${CHECK_IN_EXPECTATION_FILTER}
        AND i.status <> 'CANCELLED'
        AND s.active = 1
        AND ar.id IS NULL
        AND ow.expected_start_at <= @now
        AND @now <= DATEADD(
          HOUR,
          @pendingOperationExpirationHours,
          COALESCE(ow.expected_end_at, ow.expected_start_at)
        )
      ORDER BY ow.expected_start_at DESC, s.name ASC, ew.id ASC
    `);

    return result.recordset.map((row) =>
      mapCheckoutCandidateRow(row as Record<string, unknown>),
    );
  },

  async findExitWithoutArrivalCandidateByWorkdayId(
    companyId: string,
    employeeId: string,
    employeeWorkdayId: string,
    input: {
      now: Date;
      pendingOperationExpirationHours: number;
      simulationSessionId?: string | null;
    },
    transaction?: sql.Transaction,
  ): Promise<EmployeeWorkdayCheckoutCandidate | null> {
    const request = requestFrom(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .input("now", sql.DateTime2, input.now)
      .input(
        "pendingOperationExpirationHours",
        sql.Int,
        input.pendingOperationExpirationHours,
      );

    const attendanceFilter = simulationAttendanceFilter(input.simulationSessionId ?? null);
    if (input.simulationSessionId) {
      request.input("simulationSessionId", sql.UniqueIdentifier, input.simulationSessionId);
    }

    // Serialize concurrent exit-only commits for the same workday when inside a TX.
    const workdayLockHint = transaction ? "WITH (UPDLOCK, ROWLOCK, HOLDLOCK)" : "";

    const result = await request.query(`
      SELECT
        CAST(NULL AS UNIQUEIDENTIFIER) AS attendance_record_id,
        CAST(NULL AS DATETIME2) AS check_in_at,
        CAST(1 AS BIT) AS checkout_without_arrival,
        ${CHECK_IN_CANDIDATE_SELECT}
      FROM employee_workdays ew ${workdayLockHint}
      INNER JOIN operation_workdays ow
        ON ow.id = ew.operation_workday_id
       AND ow.company_id = ew.company_id
      INNER JOIN scheduled_operations i
        ON i.id = ow.operation_id
       AND i.company_id = ew.company_id
      INNER JOIN operational_locations s
        ON s.id = i.service_id
       AND s.company_id = ew.company_id
      LEFT JOIN attendance_records ar
        ON ar.employee_workday_id = ew.id
       AND ar.company_id = ew.company_id
       AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
       ${attendanceFilter}
      WHERE ew.company_id = @companyId
        AND ew.employee_id = @employeeId
        AND ew.id = @employeeWorkdayId
        ${CHECK_IN_EXPECTATION_FILTER}
        AND i.status <> 'CANCELLED'
        AND s.active = 1
        AND ar.id IS NULL
        AND ow.expected_start_at <= @now
        AND @now <= DATEADD(
          HOUR,
          @pendingOperationExpirationHours,
          COALESCE(ow.expected_end_at, ow.expected_start_at)
        )
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapCheckoutCandidateRow(result.recordset[0] as Record<string, unknown>);
  },

  async findCheckoutCandidateByAttendanceId(
    companyId: string,
    employeeId: string,
    attendanceRecordId: string,
    input: {
      now: Date;
      pendingOperationExpirationHours: number;
      simulationSessionId?: string | null;
    },
  ): Promise<EmployeeWorkdayCheckoutCandidate | null> {
    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("attendanceRecordId", sql.UniqueIdentifier, attendanceRecordId)
      .input("now", sql.DateTime2, input.now)
      .input(
        "pendingOperationExpirationHours",
        sql.Int,
        input.pendingOperationExpirationHours,
      );

    const simulationFilter = input.simulationSessionId
      ? "AND ar.is_simulation = 1 AND ar.simulation_session_id = @simulationSessionId"
      : "AND ar.is_simulation = 0";

    if (input.simulationSessionId) {
      request.input("simulationSessionId", sql.UniqueIdentifier, input.simulationSessionId);
    }

    const result = await request.query(`
      SELECT
        ar.id AS attendance_record_id,
        ar.received_at AS check_in_at,
        ${CHECK_IN_CANDIDATE_SELECT}
      FROM attendance_records ar
      INNER JOIN employee_workdays ew
        ON ew.id = ar.employee_workday_id
       AND ew.company_id = ar.company_id
      INNER JOIN operation_workdays ow
        ON ow.id = ew.operation_workday_id
       AND ow.company_id = ew.company_id
      INNER JOIN scheduled_operations i
        ON i.id = ow.operation_id
       AND i.company_id = ar.company_id
      INNER JOIN operational_locations s
        ON s.id = i.service_id
       AND s.company_id = ar.company_id
      WHERE ar.company_id = @companyId
        AND ar.employee_id = @employeeId
        AND ar.id = @attendanceRecordId
        AND ar.employee_workday_id IS NOT NULL
        AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
        AND ar.checkout_at IS NULL
        AND ar.received_at IS NOT NULL
        AND i.status <> 'CANCELLED'
        AND s.active = 1
        AND @now <= DATEADD(
          HOUR,
          @pendingOperationExpirationHours,
          COALESCE(ow.expected_end_at, ow.expected_start_at)
        )
        ${simulationFilter}
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapCheckoutCandidateRow({
      ...(result.recordset[0] as Record<string, unknown>),
      checkout_without_arrival: 0,
    });
  },

  /**
   * Open checkout attendance context without pending-expiration filtering.
   * Used to distinguish expired vs otherwise unavailable candidates.
   */
  async findOpenCheckoutAttendanceContext(
    companyId: string,
    employeeId: string,
    attendanceRecordId: string,
    input?: { simulationSessionId?: string | null },
  ): Promise<EmployeeWorkdayCheckoutCandidate | null> {
    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("attendanceRecordId", sql.UniqueIdentifier, attendanceRecordId);

    const simulationFilter = input?.simulationSessionId
      ? "AND ar.is_simulation = 1 AND ar.simulation_session_id = @simulationSessionId"
      : "AND ar.is_simulation = 0";

    if (input?.simulationSessionId) {
      request.input("simulationSessionId", sql.UniqueIdentifier, input.simulationSessionId);
    }

    const result = await request.query(`
      SELECT
        ar.id AS attendance_record_id,
        ar.received_at AS check_in_at,
        ${CHECK_IN_CANDIDATE_SELECT}
      FROM attendance_records ar
      INNER JOIN employee_workdays ew
        ON ew.id = ar.employee_workday_id
       AND ew.company_id = ar.company_id
      INNER JOIN operation_workdays ow
        ON ow.id = ew.operation_workday_id
       AND ow.company_id = ew.company_id
      INNER JOIN scheduled_operations i
        ON i.id = ow.operation_id
       AND i.company_id = ar.company_id
      INNER JOIN operational_locations s
        ON s.id = i.service_id
       AND s.company_id = ar.company_id
      WHERE ar.company_id = @companyId
        AND ar.employee_id = @employeeId
        AND ar.id = @attendanceRecordId
        AND ar.employee_workday_id IS NOT NULL
        AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
        AND ar.checkout_at IS NULL
        AND ar.received_at IS NOT NULL
        AND i.status <> 'CANCELLED'
        AND s.active = 1
        ${simulationFilter}
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapCheckoutCandidateRow({
      ...(result.recordset[0] as Record<string, unknown>),
      checkout_without_arrival: 0,
    });
  },
};
