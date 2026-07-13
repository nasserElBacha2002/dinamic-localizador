import sql from "mssql";
import { getPool } from "../database/connection";
import type { StatisticsFilters } from "../schemas/statistics.schema";
import type {
  AttendanceByEmployeeRow,
  AttendanceByOperationRow,
  AttendanceByServiceRow,
  AttendanceStatisticsSummary,
  AttendanceStatusDistributionItem,
  AttendanceTimelinePoint,
  AttendanceWorkdayDetailRow,
} from "../types/statistics";
import {
  calculateAbsenceRate,
  calculateAttendanceRate,
  calculatePunctualityRate,
} from "../utils/attendance-statistics-metrics";
import {
  applyEmployeeWorkdayStatisticsFilters,
  buildEmployeeWorkdayStatisticsCte,
  buildEmployeeWorkdayStatisticsFilters,
  buildStatisticsWhereFromFilters,
} from "../utils/employee-workday-statistics-projection";
import { toDateOnlyString } from "../utils/row-mappers";

const toNumber = (value: unknown): number => Number(value ?? 0);

const toIsoDate = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toDateKey = (value: unknown): string => {
  if (value instanceof Date || typeof value === "string") {
    return toDateOnlyString(value);
  }

  return String(value).slice(0, 10);
};

const STATUS_LABELS: Record<string, string> = {
  present: "Con asistencia",
  absent: "Ausente",
  justified: "Justificado",
  expected: "Pendiente / esperada",
  cancelled: "Cancelada",
};

const EMPLOYEE_SORT_FIELDS: Record<string, string> = {
  employeeName: "employee_name",
  phoneNumber: "phone_number",
  scheduledWorkdays: "scheduled_workdays",
  presentWorkdays: "present_workdays",
  absentWorkdays: "absent_workdays",
  justifiedWorkdays: "justified_workdays",
  expectedOpenWorkdays: "expected_open_workdays",
  attendanceRate: "attendance_rate",
  onTimeWorkdays: "on_time_workdays",
  lateWorkdays: "late_workdays",
  punctualityRate: "punctuality_rate",
  workedMinutes: "worked_minutes",
  overtimeMinutes: "overtime_minutes",
  earlyDepartureWorkdays: "early_departure_workdays",
  lastAttendanceDate: "last_attendance_date",
};

const OPERATION_SORT_FIELDS: Record<string, string> = {
  serviceName: "service_name",
  scheduledStart: "operation_scheduled_start",
  scheduledWorkdays: "scheduled_workdays",
  presentWorkdays: "present_workdays",
  absentWorkdays: "absent_workdays",
  justifiedWorkdays: "justified_workdays",
  expectedOpenWorkdays: "expected_open_workdays",
  attendanceRate: "attendance_rate",
  punctualityRate: "punctuality_rate",
  workedMinutes: "worked_minutes",
  overtimeMinutes: "overtime_minutes",
  operationalStatus: "operation_status",
  operationKind: "operation_kind",
};

const SERVICE_SORT_FIELDS: Record<string, string> = {
  serviceName: "service_name",
  address: "service_address",
  totalOperations: "total_operations",
  scheduledWorkdays: "scheduled_workdays",
  presentWorkdays: "present_workdays",
  absentWorkdays: "absent_workdays",
  justifiedWorkdays: "justified_workdays",
  expectedOpenWorkdays: "expected_open_workdays",
  attendanceRate: "attendance_rate",
  punctualityRate: "punctuality_rate",
  workedMinutes: "worked_minutes",
  overtimeMinutes: "overtime_minutes",
};

const resolveSort = (
  sortBy: string | undefined,
  whitelist: Record<string, string>,
  defaultField: string,
  sortDirection: "asc" | "desc",
): string => {
  const column = sortBy && whitelist[sortBy] ? whitelist[sortBy] : defaultField;
  const direction = sortDirection === "asc" ? "ASC" : "DESC";
  return `${column} ${direction}`;
};

const buildQueryContext = (companyId: string, filters: StatisticsFilters, referenceAt: Date) => {
  const sqlFilters = buildEmployeeWorkdayStatisticsFilters(companyId, filters);
  const whereClause = buildStatisticsWhereFromFilters(sqlFilters);
  const cte = buildEmployeeWorkdayStatisticsCte(whereClause);

  return { sqlFilters, cte, referenceAt };
};

const mapSummaryRow = (row: Record<string, unknown>): AttendanceStatisticsSummary => {
  const presentWorkdays = toNumber(row.present_workdays);
  const absentWorkdays = toNumber(row.absent_workdays);
  const onTimeWorkdays = toNumber(row.on_time_workdays);
  const lateWorkdays = toNumber(row.late_workdays);

  return {
    scheduledWorkdays: toNumber(row.scheduled_workdays),
    attendanceRequiredWorkdays: toNumber(row.attendance_required_workdays),
    presentWorkdays,
    absentWorkdays,
    justifiedWorkdays: toNumber(row.justified_workdays),
    expectedOpenWorkdays: toNumber(row.expected_open_workdays),
    cancelledWorkdays: toNumber(row.cancelled_workdays),
    attendanceRate: calculateAttendanceRate(presentWorkdays, absentWorkdays),
    absenceRate: calculateAbsenceRate(presentWorkdays, absentWorkdays),
    onTimeWorkdays,
    lateWorkdays,
    punctualityRate: calculatePunctualityRate(onTimeWorkdays, lateWorkdays),
    earlyDepartureWorkdays: toNumber(row.early_departure_workdays),
    workedMinutes: toNumber(row.worked_minutes),
    overtimeMinutes: toNumber(row.overtime_minutes),
    openAttendanceWorkdays: toNumber(row.open_attendance_workdays),
    outsideGeofenceCount: toNumber(row.outside_geofence_count),
    pendingReviewCount: toNumber(row.pending_review_count),
    rejectedCount: toNumber(row.rejected_count),
    manuallyAcceptedCount: toNumber(row.manually_accepted_count),
    totalOperations: toNumber(row.total_operations),
  };
};

const SUMMARY_AGGREGATE_SELECT = `
  SELECT
    SUM(CASE WHEN effective_state <> N'CANCELLED' THEN 1 ELSE 0 END) AS scheduled_workdays,
    SUM(CASE WHEN effective_state IN (N'PRESENT', N'ABSENT', N'EXPECTED') THEN 1 ELSE 0 END) AS attendance_required_workdays,
    SUM(CASE WHEN effective_state = N'PRESENT' THEN 1 ELSE 0 END) AS present_workdays,
    SUM(CASE WHEN effective_state = N'ABSENT' THEN 1 ELSE 0 END) AS absent_workdays,
    SUM(CASE WHEN effective_state = N'JUSTIFIED' THEN 1 ELSE 0 END) AS justified_workdays,
    SUM(CASE WHEN effective_state = N'EXPECTED' THEN 1 ELSE 0 END) AS expected_open_workdays,
    SUM(CASE WHEN effective_state = N'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_workdays,
    SUM(is_on_time_workday) AS on_time_workdays,
    SUM(is_late_workday) AS late_workdays,
    SUM(is_early_departure_workday) AS early_departure_workdays,
    SUM(worked_minutes) AS worked_minutes,
    SUM(overtime_minutes) AS overtime_minutes,
    SUM(is_open_attendance_workday) AS open_attendance_workdays,
    SUM(CASE WHEN location_status = N'OUTSIDE_GEOFENCE' THEN 1 ELSE 0 END) AS outside_geofence_count,
    SUM(CASE WHEN validation_status = N'PENDING_REVIEW' THEN 1 ELSE 0 END) AS pending_review_count,
    SUM(CASE WHEN validation_status = N'REJECTED' THEN 1 ELSE 0 END) AS rejected_count,
    SUM(CASE WHEN reviewed_at IS NOT NULL AND validation_status = N'VALID' THEN 1 ELSE 0 END) AS manually_accepted_count,
    COUNT(DISTINCT operation_id) AS total_operations
  FROM employee_workday_statistics
`;

export const statisticsRepository = {
  async getSummary(
    companyId: string,
    filters: StatisticsFilters,
    referenceAt: Date,
  ): Promise<AttendanceStatisticsSummary> {
    const pool = getPool();
    const { sqlFilters, cte } = buildQueryContext(companyId, filters, referenceAt);
    const request = pool.request();
    applyEmployeeWorkdayStatisticsFilters(request, sqlFilters, referenceAt);

    const result = await request.query(`
      ${cte}
      ${SUMMARY_AGGREGATE_SELECT}
    `);

    return mapSummaryRow(result.recordset[0] as Record<string, unknown>);
  },

  async getTimeline(
    companyId: string,
    filters: StatisticsFilters,
    referenceAt: Date,
  ): Promise<AttendanceTimelinePoint[]> {
    const pool = getPool();
    const { sqlFilters, cte } = buildQueryContext(companyId, filters, referenceAt);
    const request = pool.request();
    applyEmployeeWorkdayStatisticsFilters(request, sqlFilters, referenceAt);

    const result = await request.query(`
      ${cte}
      SELECT
        work_date AS event_date,
        SUM(CASE WHEN effective_state = N'PRESENT' THEN 1 ELSE 0 END) AS present_count,
        SUM(CASE WHEN effective_state = N'ABSENT' THEN 1 ELSE 0 END) AS absent_count,
        SUM(CASE WHEN effective_state = N'JUSTIFIED' THEN 1 ELSE 0 END) AS justified_count,
        SUM(CASE WHEN effective_state = N'EXPECTED' THEN 1 ELSE 0 END) AS expected_count,
        SUM(CASE WHEN effective_state <> N'CANCELLED' THEN 1 ELSE 0 END) AS scheduled_count,
        SUM(is_on_time_workday) AS on_time_count,
        SUM(is_late_workday) AS late_count,
        SUM(CASE WHEN location_status = N'OUTSIDE_GEOFENCE' THEN 1 ELSE 0 END) AS outside_geofence_count,
        SUM(CASE WHEN validation_status = N'PENDING_REVIEW' THEN 1 ELSE 0 END) AS pending_review_count,
        SUM(CASE WHEN validation_status = N'REJECTED' THEN 1 ELSE 0 END) AS rejected_count
      FROM employee_workday_statistics
      GROUP BY work_date
      ORDER BY work_date ASC
    `);

    return result.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        date: toDateKey(record.event_date),
        present: toNumber(record.present_count),
        absent: toNumber(record.absent_count),
        justified: toNumber(record.justified_count),
        expected: toNumber(record.expected_count),
        scheduled: toNumber(record.scheduled_count),
        onTime: toNumber(record.on_time_count),
        late: toNumber(record.late_count),
        outsideGeofence: toNumber(record.outside_geofence_count),
        pendingReview: toNumber(record.pending_review_count),
        rejected: toNumber(record.rejected_count),
      };
    });
  },

  async getStatusDistribution(
    companyId: string,
    filters: StatisticsFilters,
    referenceAt: Date,
  ): Promise<AttendanceStatusDistributionItem[]> {
    const summary = await this.getSummary(companyId, filters, referenceAt);

    const items: Array<{ status: string; count: number }> = [
      { status: "present", count: summary.presentWorkdays },
      { status: "absent", count: summary.absentWorkdays },
      { status: "justified", count: summary.justifiedWorkdays },
      { status: "expected", count: summary.expectedOpenWorkdays },
      { status: "cancelled", count: summary.cancelledWorkdays },
    ];

    return items
      .filter((item) => item.count > 0)
      .map((item) => ({
        status: item.status,
        label: STATUS_LABELS[item.status] ?? item.status,
        count: item.count,
      }));
  },

  async getByEmployee(
    companyId: string,
    filters: StatisticsFilters,
    page: number,
    limit: number,
    sortBy?: string,
    sortDirection: "asc" | "desc" = "desc",
    referenceAt: Date = new Date(),
  ): Promise<{ data: AttendanceByEmployeeRow[]; total: number }> {
    const pool = getPool();
    const { sqlFilters, cte } = buildQueryContext(companyId, filters, referenceAt);
    const orderBy = resolveSort(sortBy, EMPLOYEE_SORT_FIELDS, "employee_name", sortDirection);
    const offset = (page - 1) * limit;

    const countRequest = pool.request();
    applyEmployeeWorkdayStatisticsFilters(countRequest, sqlFilters, referenceAt);
    const countResult = await countRequest.query(`
      ${cte}
      SELECT COUNT(DISTINCT employee_id) AS total
      FROM employee_workday_statistics
    `);
    const total = toNumber((countResult.recordset[0] as Record<string, unknown>).total);

    const dataRequest = pool.request();
    applyEmployeeWorkdayStatisticsFilters(dataRequest, sqlFilters, referenceAt);
    dataRequest.input("offset", sql.Int, offset);
    dataRequest.input("limit", sql.Int, limit);

    const dataResult = await dataRequest.query(`
      ${cte}
      SELECT
        employee_id,
        employee_name,
        phone_number,
        SUM(CASE WHEN effective_state <> N'CANCELLED' THEN 1 ELSE 0 END) AS scheduled_workdays,
        SUM(CASE WHEN effective_state = N'PRESENT' THEN 1 ELSE 0 END) AS present_workdays,
        SUM(CASE WHEN effective_state = N'ABSENT' THEN 1 ELSE 0 END) AS absent_workdays,
        SUM(CASE WHEN effective_state = N'JUSTIFIED' THEN 1 ELSE 0 END) AS justified_workdays,
        SUM(CASE WHEN effective_state = N'EXPECTED' THEN 1 ELSE 0 END) AS expected_open_workdays,
        SUM(is_on_time_workday) AS on_time_workdays,
        SUM(is_late_workday) AS late_workdays,
        SUM(is_early_departure_workday) AS early_departure_workdays,
        SUM(worked_minutes) AS worked_minutes,
        SUM(overtime_minutes) AS overtime_minutes,
        SUM(CASE WHEN location_status = N'OUTSIDE_GEOFENCE' THEN 1 ELSE 0 END) AS outside_geofence_count,
        SUM(CASE WHEN validation_status = N'PENDING_REVIEW' THEN 1 ELSE 0 END) AS pending_review_count,
        MAX(check_in_at) AS last_attendance_date,
        CASE
          WHEN SUM(CASE WHEN effective_state IN (N'PRESENT', N'ABSENT') THEN 1 ELSE 0 END) = 0 THEN 0
          ELSE CAST(
            ROUND(
              CAST(SUM(CASE WHEN effective_state = N'PRESENT' THEN 1 ELSE 0 END) AS FLOAT)
              / CAST(SUM(CASE WHEN effective_state IN (N'PRESENT', N'ABSENT') THEN 1 ELSE 0 END) AS FLOAT) * 1000,
              0
            ) AS INT
          ) / 10.0
        END AS attendance_rate,
        CASE
          WHEN SUM(is_punctuality_eligible) = 0 THEN 0
          ELSE CAST(
            ROUND(
              CAST(SUM(is_on_time_workday) AS FLOAT)
              / CAST(SUM(is_punctuality_eligible) AS FLOAT) * 1000,
              0
            ) AS INT
          ) / 10.0
        END AS punctuality_rate
      FROM employee_workday_statistics
      GROUP BY employee_id, employee_name, phone_number
      ORDER BY ${orderBy}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const data = dataResult.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        employeeId: String(record.employee_id),
        employeeName: String(record.employee_name),
        phoneNumber: String(record.phone_number),
        scheduledWorkdays: toNumber(record.scheduled_workdays),
        presentWorkdays: toNumber(record.present_workdays),
        absentWorkdays: toNumber(record.absent_workdays),
        justifiedWorkdays: toNumber(record.justified_workdays),
        expectedOpenWorkdays: toNumber(record.expected_open_workdays),
        attendanceRate: Number(record.attendance_rate ?? 0),
        onTimeWorkdays: toNumber(record.on_time_workdays),
        lateWorkdays: toNumber(record.late_workdays),
        punctualityRate: Number(record.punctuality_rate ?? 0),
        workedMinutes: toNumber(record.worked_minutes),
        overtimeMinutes: toNumber(record.overtime_minutes),
        earlyDepartureWorkdays: toNumber(record.early_departure_workdays),
        outsideGeofenceCount: toNumber(record.outside_geofence_count),
        pendingReviewCount: toNumber(record.pending_review_count),
        lastAttendanceDate: toIsoDate(record.last_attendance_date),
      };
    });

    return { data, total };
  },

  async getByOperation(
    companyId: string,
    filters: StatisticsFilters,
    page: number,
    limit: number,
    sortBy?: string,
    sortDirection: "asc" | "desc" = "desc",
    referenceAt: Date = new Date(),
  ): Promise<{ data: AttendanceByOperationRow[]; total: number }> {
    const pool = getPool();
    const { sqlFilters, cte } = buildQueryContext(companyId, filters, referenceAt);
    const orderBy = resolveSort(sortBy, OPERATION_SORT_FIELDS, "operation_scheduled_start", sortDirection);
    const offset = (page - 1) * limit;

    const countRequest = pool.request();
    applyEmployeeWorkdayStatisticsFilters(countRequest, sqlFilters, referenceAt);
    const countResult = await countRequest.query(`
      ${cte}
      SELECT COUNT(DISTINCT operation_id) AS total
      FROM employee_workday_statistics
    `);
    const total = toNumber((countResult.recordset[0] as Record<string, unknown>).total);

    const dataRequest = pool.request();
    applyEmployeeWorkdayStatisticsFilters(dataRequest, sqlFilters, referenceAt);
    dataRequest.input("offset", sql.Int, offset);
    dataRequest.input("limit", sql.Int, limit);

    const dataResult = await dataRequest.query(`
      ${cte}
      SELECT
        operation_id,
        operation_kind,
        service_name,
        service_address,
        MIN(operation_scheduled_start) AS operation_scheduled_start,
        MAX(operation_status) AS operation_status,
        SUM(CASE WHEN effective_state <> N'CANCELLED' THEN 1 ELSE 0 END) AS scheduled_workdays,
        SUM(CASE WHEN effective_state = N'PRESENT' THEN 1 ELSE 0 END) AS present_workdays,
        SUM(CASE WHEN effective_state = N'ABSENT' THEN 1 ELSE 0 END) AS absent_workdays,
        SUM(CASE WHEN effective_state = N'JUSTIFIED' THEN 1 ELSE 0 END) AS justified_workdays,
        SUM(CASE WHEN effective_state = N'EXPECTED' THEN 1 ELSE 0 END) AS expected_open_workdays,
        SUM(is_on_time_workday) AS on_time_workdays,
        SUM(is_late_workday) AS late_workdays,
        SUM(worked_minutes) AS worked_minutes,
        SUM(overtime_minutes) AS overtime_minutes,
        CASE
          WHEN SUM(CASE WHEN effective_state IN (N'PRESENT', N'ABSENT') THEN 1 ELSE 0 END) = 0 THEN 0
          ELSE CAST(
            ROUND(
              CAST(SUM(CASE WHEN effective_state = N'PRESENT' THEN 1 ELSE 0 END) AS FLOAT)
              / CAST(SUM(CASE WHEN effective_state IN (N'PRESENT', N'ABSENT') THEN 1 ELSE 0 END) AS FLOAT) * 1000,
              0
            ) AS INT
          ) / 10.0
        END AS attendance_rate,
        CASE
          WHEN SUM(is_punctuality_eligible) = 0 THEN 0
          ELSE CAST(
            ROUND(
              CAST(SUM(is_on_time_workday) AS FLOAT)
              / CAST(SUM(is_punctuality_eligible) AS FLOAT) * 1000,
              0
            ) AS INT
          ) / 10.0
        END AS punctuality_rate
      FROM employee_workday_statistics
      GROUP BY operation_id, operation_kind, service_name, service_address
      ORDER BY ${orderBy}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const data = dataResult.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        operationId: String(record.operation_id),
        operationKind: String(record.operation_kind),
        serviceName: String(record.service_name),
        serviceAddress: record.service_address ? String(record.service_address) : null,
        scheduledStart: toIsoDate(record.operation_scheduled_start),
        scheduledWorkdays: toNumber(record.scheduled_workdays),
        presentWorkdays: toNumber(record.present_workdays),
        absentWorkdays: toNumber(record.absent_workdays),
        justifiedWorkdays: toNumber(record.justified_workdays),
        expectedOpenWorkdays: toNumber(record.expected_open_workdays),
        attendanceRate: Number(record.attendance_rate ?? 0),
        onTimeWorkdays: toNumber(record.on_time_workdays),
        lateWorkdays: toNumber(record.late_workdays),
        punctualityRate: Number(record.punctuality_rate ?? 0),
        workedMinutes: toNumber(record.worked_minutes),
        overtimeMinutes: toNumber(record.overtime_minutes),
        operationalStatus: String(record.operation_status),
      };
    });

    return { data, total };
  },

  async getByService(
    companyId: string,
    filters: StatisticsFilters,
    page: number,
    limit: number,
    sortBy?: string,
    sortDirection: "asc" | "desc" = "desc",
    referenceAt: Date = new Date(),
  ): Promise<{ data: AttendanceByServiceRow[]; total: number }> {
    const pool = getPool();
    const { sqlFilters, cte } = buildQueryContext(companyId, filters, referenceAt);
    const orderBy = resolveSort(sortBy, SERVICE_SORT_FIELDS, "service_name", sortDirection);
    const offset = (page - 1) * limit;

    const countRequest = pool.request();
    applyEmployeeWorkdayStatisticsFilters(countRequest, sqlFilters, referenceAt);
    const countResult = await countRequest.query(`
      ${cte}
      SELECT COUNT(DISTINCT service_id) AS total
      FROM employee_workday_statistics
    `);
    const total = toNumber((countResult.recordset[0] as Record<string, unknown>).total);

    const dataRequest = pool.request();
    applyEmployeeWorkdayStatisticsFilters(dataRequest, sqlFilters, referenceAt);
    dataRequest.input("offset", sql.Int, offset);
    dataRequest.input("limit", sql.Int, limit);

    const dataResult = await dataRequest.query(`
      ${cte}
      SELECT
        service_id,
        service_name,
        service_address,
        COUNT(DISTINCT operation_id) AS total_operations,
        SUM(CASE WHEN effective_state <> N'CANCELLED' THEN 1 ELSE 0 END) AS scheduled_workdays,
        SUM(CASE WHEN effective_state = N'PRESENT' THEN 1 ELSE 0 END) AS present_workdays,
        SUM(CASE WHEN effective_state = N'ABSENT' THEN 1 ELSE 0 END) AS absent_workdays,
        SUM(CASE WHEN effective_state = N'JUSTIFIED' THEN 1 ELSE 0 END) AS justified_workdays,
        SUM(CASE WHEN effective_state = N'EXPECTED' THEN 1 ELSE 0 END) AS expected_open_workdays,
        SUM(is_on_time_workday) AS on_time_workdays,
        SUM(is_late_workday) AS late_workdays,
        SUM(worked_minutes) AS worked_minutes,
        SUM(overtime_minutes) AS overtime_minutes,
        SUM(CASE WHEN location_status = N'OUTSIDE_GEOFENCE' THEN 1 ELSE 0 END) AS outside_geofence_count,
        SUM(CASE WHEN validation_status = N'PENDING_REVIEW' THEN 1 ELSE 0 END) AS pending_review_count,
        CASE
          WHEN SUM(CASE WHEN effective_state IN (N'PRESENT', N'ABSENT') THEN 1 ELSE 0 END) = 0 THEN 0
          ELSE CAST(
            ROUND(
              CAST(SUM(CASE WHEN effective_state = N'PRESENT' THEN 1 ELSE 0 END) AS FLOAT)
              / CAST(SUM(CASE WHEN effective_state IN (N'PRESENT', N'ABSENT') THEN 1 ELSE 0 END) AS FLOAT) * 1000,
              0
            ) AS INT
          ) / 10.0
        END AS attendance_rate,
        CASE
          WHEN SUM(is_punctuality_eligible) = 0 THEN 0
          ELSE CAST(
            ROUND(
              CAST(SUM(is_on_time_workday) AS FLOAT)
              / CAST(SUM(is_punctuality_eligible) AS FLOAT) * 1000,
              0
            ) AS INT
          ) / 10.0
        END AS punctuality_rate
      FROM employee_workday_statistics
      GROUP BY service_id, service_name, service_address
      ORDER BY ${orderBy}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const data = dataResult.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        serviceId: String(record.service_id),
        serviceName: String(record.service_name),
        address: record.service_address ? String(record.service_address) : null,
        totalOperations: toNumber(record.total_operations),
        scheduledWorkdays: toNumber(record.scheduled_workdays),
        presentWorkdays: toNumber(record.present_workdays),
        absentWorkdays: toNumber(record.absent_workdays),
        justifiedWorkdays: toNumber(record.justified_workdays),
        expectedOpenWorkdays: toNumber(record.expected_open_workdays),
        attendanceRate: Number(record.attendance_rate ?? 0),
        onTimeWorkdays: toNumber(record.on_time_workdays),
        lateWorkdays: toNumber(record.late_workdays),
        punctualityRate: Number(record.punctuality_rate ?? 0),
        workedMinutes: toNumber(record.worked_minutes),
        overtimeMinutes: toNumber(record.overtime_minutes),
        outsideGeofenceCount: toNumber(record.outside_geofence_count),
        pendingReviewCount: toNumber(record.pending_review_count),
      };
    });

    return { data, total };
  },

  async getWorkdayDetails(
    companyId: string,
    filters: StatisticsFilters,
    page: number,
    limit: number,
    referenceAt: Date,
  ): Promise<{ data: AttendanceWorkdayDetailRow[]; total: number }> {
    const pool = getPool();
    const { sqlFilters, cte } = buildQueryContext(companyId, filters, referenceAt);
    const offset = (page - 1) * limit;

    const countRequest = pool.request();
    applyEmployeeWorkdayStatisticsFilters(countRequest, sqlFilters, referenceAt);
    const countResult = await countRequest.query(`
      ${cte}
      SELECT COUNT(*) AS total
      FROM employee_workday_statistics
    `);
    const total = toNumber((countResult.recordset[0] as Record<string, unknown>).total);

    const dataRequest = pool.request();
    applyEmployeeWorkdayStatisticsFilters(dataRequest, sqlFilters, referenceAt);
    dataRequest.input("offset", sql.Int, offset);
    dataRequest.input("limit", sql.Int, limit);

    const dataResult = await dataRequest.query(`
      ${cte}
      SELECT
        work_date,
        employee_name,
        employee_type,
        service_name,
        operation_kind,
        expected_start_at,
        expected_end_at,
        effective_state,
        check_in_at,
        punctuality_status,
        check_out_at,
        checkout_status,
        worked_minutes,
        overtime_minutes,
        absence_type_name,
        CASE WHEN effective_state = N'JUSTIFIED' THEN 1 ELSE 0 END AS justified
      FROM employee_workday_statistics
      ORDER BY work_date DESC, employee_name ASC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const data = dataResult.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      const effectiveState = String(record.effective_state) as AttendanceWorkdayDetailRow["effectiveState"];
      return {
        workDate: toDateKey(record.work_date),
        employeeName: String(record.employee_name),
        employeeType: record.employee_type ? String(record.employee_type) : null,
        serviceName: String(record.service_name),
        operationKind: String(record.operation_kind) as AttendanceWorkdayDetailRow["operationKind"],
        expectedStartAt: toIsoDate(record.expected_start_at) ?? "",
        expectedEndAt: toIsoDate(record.expected_end_at),
        effectiveState,
        checkInAt: toIsoDate(record.check_in_at),
        arrivalStatus: record.punctuality_status
          ? (String(record.punctuality_status) as AttendanceWorkdayDetailRow["arrivalStatus"])
          : null,
        checkOutAt: toIsoDate(record.check_out_at),
        checkoutStatus: record.checkout_status
          ? (String(record.checkout_status) as AttendanceWorkdayDetailRow["checkoutStatus"])
          : null,
        workedMinutes: toNumber(record.worked_minutes),
        overtimeMinutes: toNumber(record.overtime_minutes),
        absenceTypeName: record.absence_type_name ? String(record.absence_type_name) : null,
        justified: effectiveState === "JUSTIFIED",
      };
    });

    return { data, total };
  },
};
