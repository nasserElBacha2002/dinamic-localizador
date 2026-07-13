import sql from "mssql";
import type { StatisticsFilters } from "../schemas/statistics.schema";
import type { DerivedEmployeeWorkdayState } from "../types/employee-workday-state";
import { CANONICAL_PRODUCTION_ATTENDANCE_APPLY } from "./statistics-canonical-attendance";
import { normalizeStatisticsFilters } from "../utils/statistics-display-labels";
import { applySqlFilters, type SqlFilter } from "./sql-list-query";

export const EFFECTIVE_STATE_SQL = `
  CASE
    WHEN ew.expectation_status = N'CANCELLED' THEN N'CANCELLED'
    WHEN ew.expectation_status = N'JUSTIFIED' THEN N'JUSTIFIED'
    WHEN ar.id IS NOT NULL THEN N'PRESENT'
    WHEN @referenceAt <= DATEADD(
      MINUTE,
      ow.late_tolerance_minutes,
      COALESCE(ow.expected_end_at, ow.expected_start_at)
    ) THEN N'EXPECTED'
    ELSE N'ABSENT'
  END
`;

export const WORKED_MINUTES_SQL = `
  CASE
    WHEN ar.id IS NOT NULL AND ar.checkout_at IS NOT NULL
      THEN DATEDIFF(MINUTE, ar.received_at, ar.checkout_at)
    ELSE 0
  END
`;

export const OVERTIME_MINUTES_SQL = "COALESCE(ar.extra_worked_minutes, 0)";

export const ON_TIME_WORKDAY_SQL = `
  CASE
    WHEN ar.id IS NOT NULL AND ar.punctuality_status IN (N'ON_TIME', N'EARLY') THEN 1
    ELSE 0
  END
`;

export const LATE_WORKDAY_SQL = `
  CASE
    WHEN ar.id IS NOT NULL AND ar.punctuality_status = N'LATE' THEN 1
    ELSE 0
  END
`;

export const PUNCTUALITY_ELIGIBLE_SQL = `
  CASE
    WHEN ar.id IS NOT NULL AND ar.punctuality_status IN (N'ON_TIME', N'EARLY', N'LATE') THEN 1
    ELSE 0
  END
`;

export const EARLY_DEPARTURE_WORKDAY_SQL = `
  CASE
    WHEN ar.id IS NOT NULL AND ar.checkout_status = N'CHECKOUT_EARLY_REVIEW' THEN 1
    ELSE 0
  END
`;

export const OPEN_ATTENDANCE_WORKDAY_SQL = `
  CASE
    WHEN ar.id IS NOT NULL AND ar.checkout_at IS NULL THEN 1
    ELSE 0
  END
`;

const toDateOnly = (value: string): string => value.slice(0, 10);

export const buildEmployeeWorkdayStatisticsFilters = (
  companyId: string,
  filters: StatisticsFilters,
): SqlFilter[] => {
  const normalized = normalizeStatisticsFilters(filters);
  const sqlFilters: SqlFilter[] = [
    {
      clause: "ew.company_id = @companyId",
      apply: (request) => request.input("companyId", sql.UniqueIdentifier, companyId),
    },
  ];

  if (normalized.dateFrom) {
    sqlFilters.push({
      clause: "ow.work_date >= @dateFrom",
      apply: (request) => request.input("dateFrom", sql.Date, toDateOnly(normalized.dateFrom!)),
    });
  }

  if (normalized.dateTo) {
    sqlFilters.push({
      clause: "ow.work_date <= @dateTo",
      apply: (request) => request.input("dateTo", sql.Date, toDateOnly(normalized.dateTo!)),
    });
  }

  if (normalized.operationId) {
    sqlFilters.push({
      clause: "o.id = @operationId",
      apply: (request) => request.input("operationId", sql.UniqueIdentifier, normalized.operationId),
    });
  }

  if (normalized.serviceId) {
    sqlFilters.push({
      clause: "s.id = @serviceId",
      apply: (request) => request.input("serviceId", sql.UniqueIdentifier, normalized.serviceId),
    });
  }

  if (normalized.employeeId) {
    sqlFilters.push({
      clause: "e.id = @employeeId",
      apply: (request) => request.input("employeeId", sql.UniqueIdentifier, normalized.employeeId),
    });
  }

  if (normalized.operationKind) {
    sqlFilters.push({
      clause: "o.operation_kind = @operationKind",
      apply: (request) => request.input("operationKind", sql.NVarChar, normalized.operationKind),
    });
  }

  if (normalized.effectiveState) {
    sqlFilters.push({
      clause: `(${EFFECTIVE_STATE_SQL}) = @effectiveState`,
      apply: (request) =>
        request.input(
          "effectiveState",
          sql.NVarChar,
          normalized.effectiveState as DerivedEmployeeWorkdayState,
        ),
    });
  }

  if (normalized.validationStatus) {
    sqlFilters.push({
      clause: "ar.validation_status = @validationStatus",
      apply: (request) => request.input("validationStatus", sql.NVarChar, normalized.validationStatus),
    });
  }

  if (normalized.locationStatus) {
    sqlFilters.push({
      clause: "ar.location_status = @locationStatus",
      apply: (request) => request.input("locationStatus", sql.NVarChar, normalized.locationStatus),
    });
  }

  if (normalized.punctualityStatus) {
    sqlFilters.push({
      clause: "ar.punctuality_status = @punctualityStatus",
      apply: (request) => request.input("punctualityStatus", sql.NVarChar, normalized.punctualityStatus),
    });
  }

  return sqlFilters;
};

export const buildEmployeeWorkdayStatisticsCte = (additionalWhereClause = ""): string => `
  WITH employee_workday_statistics AS (
    SELECT
      ew.id AS employee_workday_id,
      ew.company_id,
      ew.employee_id,
      ew.operation_workday_id,
      ew.expectation_status,
      ew.absence_request_id,
      e.name AS employee_name,
      e.phone_number,
      e.employee_type,
      ow.work_date,
      ow.expected_start_at,
      ow.expected_end_at,
      ow.early_tolerance_minutes,
      ow.late_tolerance_minutes,
      o.id AS operation_id,
      o.operation_kind,
      o.status AS operation_status,
      o.scheduled_start AS operation_scheduled_start,
      s.id AS service_id,
      s.name AS service_name,
      s.address AS service_address,
      abs_type.name AS absence_type_name,
      ar.id AS attendance_record_id,
      ar.received_at AS check_in_at,
      ar.checkout_at AS check_out_at,
      ar.punctuality_status,
      ar.validation_status,
      ar.location_status,
      ar.checkout_status,
      ar.reviewed_at,
      (${WORKED_MINUTES_SQL}) AS worked_minutes,
      (${OVERTIME_MINUTES_SQL}) AS overtime_minutes,
      (${ON_TIME_WORKDAY_SQL}) AS is_on_time_workday,
      (${LATE_WORKDAY_SQL}) AS is_late_workday,
      (${PUNCTUALITY_ELIGIBLE_SQL}) AS is_punctuality_eligible,
      (${EARLY_DEPARTURE_WORKDAY_SQL}) AS is_early_departure_workday,
      (${OPEN_ATTENDANCE_WORKDAY_SQL}) AS is_open_attendance_workday,
      (${EFFECTIVE_STATE_SQL}) AS effective_state
    FROM employee_workdays ew
    INNER JOIN operation_workdays ow
      ON ow.id = ew.operation_workday_id
     AND ow.company_id = ew.company_id
    INNER JOIN scheduled_operations o
      ON o.id = ow.operation_id
     AND o.company_id = ow.company_id
    INNER JOIN operational_locations s
      ON s.id = o.service_id
     AND s.company_id = o.company_id
    INNER JOIN employees e
      ON e.id = ew.employee_id
     AND e.company_id = ew.company_id
    LEFT JOIN absence_requests abs_req
      ON abs_req.id = ew.absence_request_id
     AND abs_req.company_id = ew.company_id
    LEFT JOIN absence_types abs_type
      ON abs_type.id = abs_req.absence_type_id
    ${CANONICAL_PRODUCTION_ATTENDANCE_APPLY}
    WHERE 1 = 1
    ${additionalWhereClause}
  )
`;

export const applyEmployeeWorkdayStatisticsFilters = (
  request: sql.Request,
  filters: SqlFilter[],
  referenceAt: Date,
): void => {
  applySqlFilters(request, filters);
  request.input("referenceAt", sql.DateTimeOffset, referenceAt);
};

export const buildStatisticsWhereFromFilters = (filters: SqlFilter[]): string => {
  if (filters.length === 0) {
    return "";
  }

  return `AND ${filters.map((filter) => filter.clause).join(" AND ")}`;
};
