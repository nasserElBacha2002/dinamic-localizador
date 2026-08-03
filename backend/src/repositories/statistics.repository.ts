import sql from "mssql";
import { getPool } from "../database/connection";
import { STATISTICS_MIN_SAMPLE_WORKDAYS } from "../constants/statistics";
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
  calculateConsolidatedCoverageRate,
  calculatePunctualityRate,
  hasSufficientSample,
} from "../utils/attendance-statistics-metrics";
import { buildActionExceptions } from "../utils/statistics-action-exceptions";
import type { StatisticsTimeContext } from "../utils/statistics-period";
import {
  applyEmployeeWorkdayStatisticsFilters,
  buildEmployeeWorkdayStatisticsCte,
  buildEmployeeWorkdayStatisticsFilters,
  buildStatisticsWhereFromFilters,
} from "../utils/employee-workday-statistics-projection";
import { toDateOnlyString } from "../utils/row-mappers";
import type { StatisticsRankingMode } from "../schemas/statistics.schema";

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

const resolvePrimaryIncidentLabel = (row: {
  absentWorkdays: number;
  lateWorkdays: number;
  openAttendanceWorkdays: number;
  outsideGeofenceCount: number;
  earlyDepartureWorkdays: number;
  pendingReviewCount: number;
}): string | null => {
  const candidates: Array<{ label: string; count: number }> = [
    { label: "Ausencias", count: row.absentWorkdays },
    { label: "Tardanzas", count: row.lateWorkdays },
    { label: "Sin cierre", count: row.openAttendanceWorkdays },
    { label: "Fuera de geocerca", count: row.outsideGeofenceCount },
    { label: "Salidas tempranas", count: row.earlyDepartureWorkdays },
    { label: "Pendiente revisión", count: row.pendingReviewCount },
  ];
  const top = candidates.sort((a, b) => b.count - a.count)[0];
  return top && top.count > 0 ? top.label : null;
};

const buildOperationDisplayLabel = (
  serviceName: string,
  scheduledStart: string | null,
): string => {
  const when = scheduledStart ? scheduledStart.slice(0, 16).replace("T", " ") : null;
  const parts = [serviceName, when].filter(Boolean);
  return parts.join(" · ");
};

const INCIDENT_COUNT_SQL = `(
  SUM(CASE WHEN effective_state = N'ABSENT' THEN 1 ELSE 0 END)
  + SUM(is_late_workday)
  + SUM(is_open_attendance_workday)
  + SUM(CASE WHEN location_status = N'OUTSIDE_GEOFENCE' THEN 1 ELSE 0 END)
  + SUM(is_early_departure_workday)
  + SUM(CASE WHEN validation_status = N'PENDING_REVIEW' THEN 1 ELSE 0 END)
)`;

const CONSOLIDATED_SAMPLE_SQL = `SUM(CASE WHEN effective_state IN (N'PRESENT', N'ABSENT') THEN 1 ELSE 0 END)`;

const employeeRankingHaving = (mode: StatisticsRankingMode | undefined): string => {
  if (mode === "attention_employees") {
    return `HAVING ${INCIDENT_COUNT_SQL} > 0`;
  }
  if (mode === "late_employees") {
    return `HAVING SUM(is_late_workday) > 0`;
  }
  return "";
};

const operationRankingHaving = (
  mode: StatisticsRankingMode | undefined,
  incompleteCoverage: boolean | undefined,
  minSample: number,
  referenceAtIso: string,
): string => {
  const consolidatedIncomplete = `
      SUM(CASE WHEN effective_state = N'EXPECTED' THEN 1 ELSE 0 END) = 0
      AND MIN(operation_scheduled_start) <= '${referenceAtIso}'
      AND ${CONSOLIDATED_SAMPLE_SQL} > 0
      AND SUM(CASE WHEN effective_state = N'PRESENT' THEN 1 ELSE 0 END)
        < ${CONSOLIDATED_SAMPLE_SQL}`;

  if (mode === "low_coverage_operations") {
    return `HAVING
      ${consolidatedIncomplete}
      AND ${CONSOLIDATED_SAMPLE_SQL} >= ${minSample}`;
  }

  // Table filter / deep-link: match incompleteCoverageOperations KPI (no min-sample gate).
  if (incompleteCoverage) {
    return `HAVING ${consolidatedIncomplete}`;
  }

  return "";
};

const serviceRankingHaving = (mode: StatisticsRankingMode | undefined, minSample: number): string => {
  if (mode === "incident_services") {
    return `HAVING ${INCIDENT_COUNT_SQL} > 0
      AND SUM(CASE WHEN effective_state <> N'CANCELLED' THEN 1 ELSE 0 END) >= ${minSample}`;
  }
  return "";
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
  openAttendanceWorkdays: "open_attendance_workdays",
  incidentCount: "incident_count",
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
  coverageRate: "coverage_rate",
  punctualityRate: "punctuality_rate",
  workedMinutes: "worked_minutes",
  overtimeMinutes: "overtime_minutes",
  incidentCount: "incident_count",
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
  coverageRate: "coverage_rate",
  punctualityRate: "punctuality_rate",
  workedMinutes: "worked_minutes",
  overtimeMinutes: "overtime_minutes",
  incidentCount: "incident_count",
  incidentRate: "incident_rate",
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
  const expectedOpenWorkdays = toNumber(row.expected_open_workdays);
  const attendanceRequiredWorkdays = toNumber(row.attendance_required_workdays);
  const openAttendanceWorkdays = toNumber(row.open_attendance_workdays);

  return {
    scheduledWorkdays: toNumber(row.scheduled_workdays),
    attendanceRequiredWorkdays,
    presentWorkdays,
    absentWorkdays,
    justifiedWorkdays: toNumber(row.justified_workdays),
    expectedOpenWorkdays,
    cancelledWorkdays: toNumber(row.cancelled_workdays),
    attendanceRate: calculateAttendanceRate(presentWorkdays, absentWorkdays),
    absenceRate: calculateAbsenceRate(presentWorkdays, absentWorkdays),
    onTimeWorkdays,
    lateWorkdays,
    punctualityRate: calculatePunctualityRate(onTimeWorkdays, lateWorkdays),
    earlyDepartureWorkdays: toNumber(row.early_departure_workdays),
    workedMinutes: toNumber(row.worked_minutes),
    overtimeMinutes: toNumber(row.overtime_minutes),
    openAttendanceWorkdays,
    outsideGeofenceCount: toNumber(row.outside_geofence_count),
    pendingReviewCount: toNumber(row.pending_review_count),
    rejectedCount: toNumber(row.rejected_count),
    manuallyAcceptedCount: toNumber(row.manually_accepted_count),
    totalOperations: toNumber(row.total_operations),
    incompleteCoverageOperations: toNumber(row.incomplete_coverage_operations),
    coverageRate: calculateConsolidatedCoverageRate(presentWorkdays, absentWorkdays),
    hoursDataIncomplete: openAttendanceWorkdays > 0,
    locationEvaluableWorkdays: toNumber(row.location_evaluable_workdays),
    validationEvaluableWorkdays: toNumber(row.validation_evaluable_workdays),
    checkoutEvaluableWorkdays: toNumber(row.checkout_evaluable_workdays),
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
    COUNT(DISTINCT operation_id) AS total_operations,
    SUM(CASE WHEN location_status IS NOT NULL THEN 1 ELSE 0 END) AS location_evaluable_workdays,
    SUM(CASE WHEN validation_status IS NOT NULL THEN 1 ELSE 0 END) AS validation_evaluable_workdays,
    SUM(CASE WHEN check_out_at IS NOT NULL THEN 1 ELSE 0 END) AS checkout_evaluable_workdays,
    (
      SELECT COUNT(*)
      FROM (
        SELECT ew_inner.operation_id
        FROM employee_workday_statistics ew_inner
        WHERE ew_inner.effective_state <> N'CANCELLED'
        GROUP BY ew_inner.operation_id
        HAVING
          SUM(CASE WHEN ew_inner.effective_state = N'EXPECTED' THEN 1 ELSE 0 END) = 0
          AND SUM(CASE WHEN ew_inner.effective_state IN (N'PRESENT', N'ABSENT') THEN 1 ELSE 0 END) > 0
          AND SUM(CASE WHEN ew_inner.effective_state = N'PRESENT' THEN 1 ELSE 0 END)
            < SUM(CASE WHEN ew_inner.effective_state IN (N'PRESENT', N'ABSENT') THEN 1 ELSE 0 END)
      ) incomplete_ops
    ) AS incomplete_coverage_operations
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
    companyLocalDate: string,
  ): Promise<AttendanceTimelinePoint[]> {
    const pool = getPool();
    const { sqlFilters, cte } = buildQueryContext(companyId, filters, referenceAt);
    const request = pool.request();
    applyEmployeeWorkdayStatisticsFilters(request, sqlFilters, referenceAt);
    request.input("companyLocalDate", sql.Date, companyLocalDate);

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
      WHERE work_date <= @companyLocalDate
      GROUP BY work_date
      ORDER BY work_date ASC
    `);

    return result.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      const present = toNumber(record.present_count);
      const absent = toNumber(record.absent_count);
      const onTime = toNumber(record.on_time_count);
      const late = toNumber(record.late_count);
      const date = toDateKey(record.event_date);
      return {
        date,
        present,
        absent,
        justified: toNumber(record.justified_count),
        expected: toNumber(record.expected_count),
        scheduled: toNumber(record.scheduled_count),
        onTime,
        late,
        outsideGeofence: toNumber(record.outside_geofence_count),
        pendingReview: toNumber(record.pending_review_count),
        rejected: toNumber(record.rejected_count),
        attendanceRate: calculateAttendanceRate(present, absent),
        punctualityRate: calculatePunctualityRate(onTime, late),
        isPartial: date === companyLocalDate,
      };
    });
  },

  async getStatusDistribution(
    companyId: string,
    filters: StatisticsFilters,
    referenceAt: Date,
  ): Promise<AttendanceStatusDistributionItem[]> {
    const summary = await this.getSummary(companyId, filters, referenceAt);
    const STATUS_LABELS: Record<string, string> = {
      present: "Con asistencia",
      absent: "Ausente",
      justified: "Justificado",
      expected: "Pendiente / esperada",
      cancelled: "Cancelada",
    };
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

  async getActionExceptions(
    companyId: string,
    filters: StatisticsFilters,
    referenceAt: Date,
  ): Promise<ReturnType<typeof buildActionExceptions>> {
    const summary = await this.getSummary(companyId, filters, referenceAt);
    return buildActionExceptions(summary);
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
    const minSample = STATISTICS_MIN_SAMPLE_WORKDAYS;
    const having = employeeRankingHaving(filters.rankingMode);

    const aggregatedCte = `
      ${cte},
      employee_statistics_ranked AS (
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
          SUM(is_open_attendance_workday) AS open_attendance_workdays,
          ${INCIDENT_COUNT_SQL} AS incident_count,
          MAX(check_in_at) AS last_attendance_date,
          CASE
            WHEN ${CONSOLIDATED_SAMPLE_SQL} = 0 THEN 0
            ELSE CAST(
              ROUND(
                CAST(SUM(CASE WHEN effective_state = N'PRESENT' THEN 1 ELSE 0 END) AS FLOAT)
                / CAST(${CONSOLIDATED_SAMPLE_SQL} AS FLOAT) * 1000,
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
        ${having}
      )
    `;

    const countRequest = pool.request();
    applyEmployeeWorkdayStatisticsFilters(countRequest, sqlFilters, referenceAt);
    const countResult = await countRequest.query(`
      ${aggregatedCte}
      SELECT COUNT(*) AS total FROM employee_statistics_ranked
    `);
    const total = toNumber((countResult.recordset[0] as Record<string, unknown>).total);

    const dataRequest = pool.request();
    applyEmployeeWorkdayStatisticsFilters(dataRequest, sqlFilters, referenceAt);
    dataRequest.input("offset", sql.Int, offset);
    dataRequest.input("limit", sql.Int, limit);

    const dataResult = await dataRequest.query(`
      ${aggregatedCte}
      SELECT *
      FROM employee_statistics_ranked
      ORDER BY ${orderBy}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const data = dataResult.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      const presentWorkdays = toNumber(record.present_workdays);
      const absentWorkdays = toNumber(record.absent_workdays);
      const consolidated = presentWorkdays + absentWorkdays;
      const mapped = {
        employeeId: String(record.employee_id),
        employeeName: String(record.employee_name),
        phoneNumber: String(record.phone_number),
        scheduledWorkdays: toNumber(record.scheduled_workdays),
        presentWorkdays,
        absentWorkdays,
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
        openAttendanceWorkdays: toNumber(record.open_attendance_workdays),
        incidentCount: toNumber(record.incident_count),
        sampleInsufficient: !hasSufficientSample(consolidated, minSample),
        primaryIncidentLabel: null as string | null,
        lastAttendanceDate: toIsoDate(record.last_attendance_date),
      };
      mapped.primaryIncidentLabel = resolvePrimaryIncidentLabel(mapped);
      return mapped;
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
    const minSample = STATISTICS_MIN_SAMPLE_WORKDAYS;
    const having = operationRankingHaving(
      filters.rankingMode,
      filters.incompleteCoverage,
      minSample,
      referenceAt.toISOString(),
    );

    const aggregatedCte = `
      ${cte},
      operation_statistics_ranked AS (
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
          ${CONSOLIDATED_SAMPLE_SQL} AS expected_staff_workdays,
          SUM(is_on_time_workday) AS on_time_workdays,
          SUM(is_late_workday) AS late_workdays,
          SUM(worked_minutes) AS worked_minutes,
          SUM(overtime_minutes) AS overtime_minutes,
          SUM(is_open_attendance_workday) AS open_attendance_workdays,
          (
            SUM(CASE WHEN effective_state = N'ABSENT' THEN 1 ELSE 0 END)
            + SUM(is_late_workday)
            + SUM(is_open_attendance_workday)
          ) AS incident_count,
          CASE
            WHEN ${CONSOLIDATED_SAMPLE_SQL} = 0 THEN 0
            ELSE CAST(
              ROUND(
                CAST(SUM(CASE WHEN effective_state = N'PRESENT' THEN 1 ELSE 0 END) AS FLOAT)
                / CAST(${CONSOLIDATED_SAMPLE_SQL} AS FLOAT) * 1000,
                0
              ) AS INT
            ) / 10.0
          END AS attendance_rate,
          CASE
            WHEN ${CONSOLIDATED_SAMPLE_SQL} = 0 THEN 0
            ELSE CAST(
              ROUND(
                CAST(SUM(CASE WHEN effective_state = N'PRESENT' THEN 1 ELSE 0 END) AS FLOAT)
                / CAST(${CONSOLIDATED_SAMPLE_SQL} AS FLOAT) * 1000,
                0
              ) AS INT
            ) / 10.0
          END AS coverage_rate,
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
        ${having}
      )
    `;

    const countRequest = pool.request();
    applyEmployeeWorkdayStatisticsFilters(countRequest, sqlFilters, referenceAt);
    const countResult = await countRequest.query(`
      ${aggregatedCte}
      SELECT COUNT(*) AS total FROM operation_statistics_ranked
    `);
    const total = toNumber((countResult.recordset[0] as Record<string, unknown>).total);

    const dataRequest = pool.request();
    applyEmployeeWorkdayStatisticsFilters(dataRequest, sqlFilters, referenceAt);
    dataRequest.input("offset", sql.Int, offset);
    dataRequest.input("limit", sql.Int, limit);

    const dataResult = await dataRequest.query(`
      ${aggregatedCte}
      SELECT *
      FROM operation_statistics_ranked
      ORDER BY ${orderBy}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const data = dataResult.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      const scheduledStart = toIsoDate(record.operation_scheduled_start);
      const serviceName = String(record.service_name);
      const operationKind = String(record.operation_kind);
      const presentWorkdays = toNumber(record.present_workdays);
      const absentWorkdays = toNumber(record.absent_workdays);
      const expectedStaffWorkdays = toNumber(record.expected_staff_workdays);
      return {
        operationId: String(record.operation_id),
        operationKind,
        displayLabel: buildOperationDisplayLabel(serviceName, scheduledStart),
        serviceName,
        serviceAddress: record.service_address ? String(record.service_address) : null,
        scheduledStart,
        scheduledWorkdays: toNumber(record.scheduled_workdays),
        presentWorkdays,
        absentWorkdays,
        justifiedWorkdays: toNumber(record.justified_workdays),
        expectedOpenWorkdays: toNumber(record.expected_open_workdays),
        expectedStaffWorkdays,
        attendanceRate: Number(record.attendance_rate ?? 0),
        coverageRate: Number(record.coverage_rate ?? 0),
        onTimeWorkdays: toNumber(record.on_time_workdays),
        lateWorkdays: toNumber(record.late_workdays),
        punctualityRate: Number(record.punctuality_rate ?? 0),
        workedMinutes: toNumber(record.worked_minutes),
        overtimeMinutes: toNumber(record.overtime_minutes),
        openAttendanceWorkdays: toNumber(record.open_attendance_workdays),
        incidentCount: toNumber(record.incident_count),
        sampleInsufficient: !hasSufficientSample(expectedStaffWorkdays, minSample),
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

    const minSample = STATISTICS_MIN_SAMPLE_WORKDAYS;
    const having = serviceRankingHaving(filters.rankingMode, minSample);

    const countRequest = pool.request();
    applyEmployeeWorkdayStatisticsFilters(countRequest, sqlFilters, referenceAt);
    const countResult = await countRequest.query(`
      ${cte}
      SELECT COUNT(*) AS total FROM (
        SELECT service_id
        FROM employee_workday_statistics
        GROUP BY service_id, service_name, service_address
        ${having}
      ) ranked_services
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
        ${CONSOLIDATED_SAMPLE_SQL} AS expected_staff_workdays,
        SUM(is_on_time_workday) AS on_time_workdays,
        SUM(is_late_workday) AS late_workdays,
        SUM(worked_minutes) AS worked_minutes,
        SUM(overtime_minutes) AS overtime_minutes,
        SUM(CASE WHEN location_status = N'OUTSIDE_GEOFENCE' THEN 1 ELSE 0 END) AS outside_geofence_count,
        SUM(CASE WHEN validation_status = N'PENDING_REVIEW' THEN 1 ELSE 0 END) AS pending_review_count,
        SUM(is_open_attendance_workday) AS open_attendance_workdays,
        ${INCIDENT_COUNT_SQL} AS incident_count,
        CASE
          WHEN ${CONSOLIDATED_SAMPLE_SQL} = 0 THEN 0
          ELSE CAST(
            ROUND(
              CAST(SUM(CASE WHEN effective_state = N'PRESENT' THEN 1 ELSE 0 END) AS FLOAT)
              / CAST(${CONSOLIDATED_SAMPLE_SQL} AS FLOAT) * 1000,
              0
            ) AS INT
          ) / 10.0
        END AS attendance_rate,
        CASE
          WHEN ${CONSOLIDATED_SAMPLE_SQL} = 0 THEN 0
          ELSE CAST(
            ROUND(
              CAST(SUM(CASE WHEN effective_state = N'PRESENT' THEN 1 ELSE 0 END) AS FLOAT)
              / CAST(${CONSOLIDATED_SAMPLE_SQL} AS FLOAT) * 1000,
              0
            ) AS INT
          ) / 10.0
        END AS coverage_rate,
        CASE
          WHEN SUM(is_punctuality_eligible) = 0 THEN 0
          ELSE CAST(
            ROUND(
              CAST(SUM(is_on_time_workday) AS FLOAT)
              / CAST(SUM(is_punctuality_eligible) AS FLOAT) * 1000,
              0
            ) AS INT
          ) / 10.0
        END AS punctuality_rate,
        CASE
          WHEN SUM(CASE WHEN effective_state <> N'CANCELLED' THEN 1 ELSE 0 END) = 0 THEN 0
          ELSE CAST(
            ROUND(
              CAST(${INCIDENT_COUNT_SQL} AS FLOAT)
              / CAST(SUM(CASE WHEN effective_state <> N'CANCELLED' THEN 1 ELSE 0 END) AS FLOAT) * 1000,
              0
            ) AS INT
          ) / 10.0
        END AS incident_rate
      FROM employee_workday_statistics
      GROUP BY service_id, service_name, service_address
      ${having}
      ORDER BY ${orderBy}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const data = dataResult.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      const scheduledWorkdays = toNumber(record.scheduled_workdays);
      return {
        serviceId: String(record.service_id),
        serviceName: String(record.service_name),
        address: record.service_address ? String(record.service_address) : null,
        totalOperations: toNumber(record.total_operations),
        scheduledWorkdays,
        presentWorkdays: toNumber(record.present_workdays),
        absentWorkdays: toNumber(record.absent_workdays),
        justifiedWorkdays: toNumber(record.justified_workdays),
        expectedOpenWorkdays: toNumber(record.expected_open_workdays),
        attendanceRate: Number(record.attendance_rate ?? 0),
        coverageRate: Number(record.coverage_rate ?? 0),
        onTimeWorkdays: toNumber(record.on_time_workdays),
        lateWorkdays: toNumber(record.late_workdays),
        punctualityRate: Number(record.punctuality_rate ?? 0),
        workedMinutes: toNumber(record.worked_minutes),
        overtimeMinutes: toNumber(record.overtime_minutes),
        outsideGeofenceCount: toNumber(record.outside_geofence_count),
        pendingReviewCount: toNumber(record.pending_review_count),
        openAttendanceWorkdays: toNumber(record.open_attendance_workdays),
        incidentCount: toNumber(record.incident_count),
        incidentRate: Number(record.incident_rate ?? 0),
        sampleInsufficient: !hasSufficientSample(scheduledWorkdays, minSample),
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
