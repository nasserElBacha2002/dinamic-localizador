import sql from "mssql";
import { getPool } from "../database/connection";
import type {
  EmployeeWorkdayCheckInCandidate,
  EmployeeWorkdayCheckoutCandidate,
} from "../types/employee-workday-availability";
import type { OperationKind } from "../constants/operation-kind";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

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
  workDate: String(row.work_date).slice(0, 10),
  expectedStartAt: toIsoString(row.expected_start_at as Date | string),
  expectedEndAt: row.expected_end_at
    ? toIsoString(row.expected_end_at as Date | string)
    : null,
  earlyToleranceMinutes: Number(row.early_tolerance_minutes),
  lateToleranceMinutes: Number(row.late_tolerance_minutes),
  scheduleTimezone: row.schedule_timezone_snapshot
    ? String(row.schedule_timezone_snapshot)
    : "America/Argentina/Buenos_Aires",
});

const mapCheckoutCandidateRow = (row: Record<string, unknown>): EmployeeWorkdayCheckoutCandidate => ({
  ...mapCheckInCandidateRow(row),
  attendanceRecordId: String(row.attendance_record_id),
  checkInAt: toIsoString(row.check_in_at as Date | string),
});

const simulationAttendanceFilter = (simulationSessionId: string | null): string => {
  if (simulationSessionId) {
    return "AND ar.is_simulation = 1 AND ar.simulation_session_id = @simulationSessionId";
  }
  return "AND ar.is_simulation = 0";
};

const CHECK_IN_CANDIDATE_SELECT = `
  ew.id AS employee_workday_id,
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
        AND ew.expectation_status = 'EXPECTED'
        AND ow.status = 'ACTIVE'
        AND i.status NOT IN ('COMPLETED', 'CANCELLED')
        AND s.active = 1
        AND ar.id IS NULL
        AND @candidateFrom <= DATEADD(
          MINUTE,
          ow.late_tolerance_minutes,
          COALESCE(ow.expected_end_at, ow.expected_start_at)
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
        AND ew.expectation_status = 'EXPECTED'
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

  async listCheckoutCandidates(
    companyId: string,
    employeeId: string,
    input?: { simulationSessionId?: string | null },
  ): Promise<EmployeeWorkdayCheckoutCandidate[]> {
    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId);

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
        AND ar.employee_workday_id IS NOT NULL
        AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
        AND ar.checkout_at IS NULL
        AND i.status <> 'CANCELLED'
        AND s.active = 1
        ${simulationFilter}
      ORDER BY ar.received_at ASC, s.name ASC, ew.id ASC
    `);

    return result.recordset.map((row) =>
      mapCheckoutCandidateRow(row as Record<string, unknown>),
    );
  },

  async findCheckoutCandidateByAttendanceId(
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
        AND i.status <> 'CANCELLED'
        AND s.active = 1
        ${simulationFilter}
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapCheckoutCandidateRow(result.recordset[0] as Record<string, unknown>);
  },
};
