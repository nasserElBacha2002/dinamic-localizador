import sql from "mssql";
import type { ListAttendanceQuery } from "../schemas/attendance.schema";
import {
  assertWithinMultiFilterLimit,
  mergeLegacySingularId,
} from "../schemas/uuid-id-list";
import type { DerivedEmployeeWorkdayState } from "../types/employee-workday-state";
import type {
  AttendanceRecord,
  AttendanceRecordWithRelations,
} from "../types/domain";
import { CANONICAL_ATTENDANCE_ORDER_BY } from "./statistics-canonical-attendance";
import { EFFECTIVE_STATE_SQL, OPEN_ATTENDANCE_WORKDAY_SQL } from "./employee-workday-statistics-projection";
import { mapAttendanceWithRelationsRow } from "./row-mappers";
import { applySqlFilters, buildWhereClause, type SqlFilter } from "./sql-list-query";
import { createUuidInFilter } from "./sql-uuid-in-filter";
import { toIsoOrNull } from "./operation-attendance-summary.mapper";

/**
 * Company-wide attendance list grain: expected employee_workdays LEFT JOIN
 * canonical production attendance. Reuses EFFECTIVE_STATE_SQL for EXPECTED vs ABSENT.
 */
export const ATTENDANCE_LIST_CANONICAL_APPLY = `
  OUTER APPLY (
    SELECT TOP 1
      ar.id,
      ar.company_id,
      ar.operation_id,
      ar.employee_id,
      ar.employee_workday_id,
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
      ar.arrival_source,
      ar.checkout_source,
      ar.arrival_registered_by,
      ar.arrival_registered_at,
      ar.checkout_registered_by,
      ar.checkout_registered_at,
      ar.is_simulation,
      ar.simulation_session_id,
      ar.created_at
    FROM attendance_records ar
    WHERE ar.employee_workday_id = ew.id
      AND ar.company_id = ew.company_id
      AND ar.is_simulation = 0
    ORDER BY ${CANONICAL_ATTENDANCE_ORDER_BY}
  ) ar
`;

export type AttendanceListRowKind = "expected_workday" | "simulation" | "legacy_orphan";

export interface AttendanceListItem extends Omit<AttendanceRecordWithRelations, "validationStatus"> {
  /** Null when the row is expected without a persisted punch (never treat as PENDING_REVIEW). */
  validationStatus: AttendanceRecord["validationStatus"] | null;
  /** False when the row is an expected workday with no production punch. */
  hasAttendanceRecord: boolean;
  effectiveState: DerivedEmployeeWorkdayState;
  expectedStartAt: string;
  expectedEndAt: string | null;
  shiftNameSnapshot: string | null;
  workDate: string;
  listRowKind: AttendanceListRowKind;
  /** Stable unique list identity (not an array index). */
  listRowKey: string;
}

export type NormalizedAttendanceListIds = {
  operationIds: string[];
  employeeIds: string[];
  serviceIds: string[];
};

/** Merge singular + plural id filters with dedupe (schema-independent). */
export const normalizeAttendanceListIdFilters = (
  query: Pick<
    ListAttendanceQuery,
    | "operationId"
    | "operationIds"
    | "employeeId"
    | "employeeIds"
    | "serviceId"
    | "serviceIds"
  >,
): NormalizedAttendanceListIds => ({
  operationIds: assertWithinMultiFilterLimit(
    mergeLegacySingularId(query.operationIds ?? [], query.operationId),
  ),
  employeeIds: assertWithinMultiFilterLimit(
    mergeLegacySingularId(query.employeeIds ?? [], query.employeeId),
  ),
  serviceIds: assertWithinMultiFilterLimit(
    mergeLegacySingularId(query.serviceIds ?? [], query.serviceId),
  ),
});

const toDateOnly = (value: string): string => value.slice(0, 10);

const pushIdFilters = (
  filters: SqlFilter[],
  ids: NormalizedAttendanceListIds,
  columns: { operation: string; employee: string; service: string },
): void => {
  const operationFilter = createUuidInFilter({
    column: columns.operation,
    parameterPrefix: "operationId",
    values: ids.operationIds,
  });
  if (operationFilter) {
    filters.push(operationFilter);
  }

  const employeeFilter = createUuidInFilter({
    column: columns.employee,
    parameterPrefix: "employeeId",
    values: ids.employeeIds,
  });
  if (employeeFilter) {
    filters.push(employeeFilter);
  }

  const serviceFilter = createUuidInFilter({
    column: columns.service,
    parameterPrefix: "serviceId",
    values: ids.serviceIds,
  });
  if (serviceFilter) {
    filters.push(serviceFilter);
  }
};

const pushAttendanceStatusFilters = (
  filters: SqlFilter[],
  query: ListAttendanceQuery,
  options?: { allowNullAttendanceForNotRecorded?: boolean },
): void => {
  const allowNull = options?.allowNullAttendanceForNotRecorded ?? false;

  if (query.validationStatus) {
    filters.push({
      clause: "ar.validation_status = @validationStatus",
      apply: (request) => request.input("validationStatus", sql.NVarChar(30), query.validationStatus),
    });
  }

  if (query.locationStatus) {
    if (allowNull && query.locationStatus === "NOT_RECORDED") {
      filters.push({
        clause: "(ar.id IS NULL OR ar.location_status = N'NOT_RECORDED')",
        apply: () => undefined,
      });
    } else {
      filters.push({
        clause: "ar.location_status = @locationStatus",
        apply: (request) => request.input("locationStatus", sql.NVarChar(30), query.locationStatus),
      });
    }
  }

  if (query.punctualityStatus) {
    if (allowNull && query.punctualityStatus === "NOT_RECORDED") {
      filters.push({
        clause: "(ar.id IS NULL OR ar.punctuality_status = N'NOT_RECORDED')",
        apply: () => undefined,
      });
    } else {
      filters.push({
        clause: "ar.punctuality_status = @punctualityStatus",
        apply: (request) =>
          request.input("punctualityStatus", sql.NVarChar(30), query.punctualityStatus),
      });
    }
  }

  if (query.checkoutStatus) {
    filters.push({
      clause: "ar.checkout_status = @checkoutStatus",
      apply: (request) =>
        request.input("checkoutStatus", sql.NVarChar(40), query.checkoutStatus),
    });
  }
};

export const buildExpectedAttendanceListFilters = (
  companyId: string,
  query: ListAttendanceQuery,
): SqlFilter[] => {
  const ids = normalizeAttendanceListIdFilters(query);
  const filters: SqlFilter[] = [
    {
      clause: "ew.company_id = @companyId",
      apply: (request) => request.input("companyId", sql.UniqueIdentifier, companyId),
    },
    {
      clause: "ew.expectation_status <> N'CANCELLED'",
      apply: () => undefined,
    },
  ];

  pushIdFilters(filters, ids, {
    operation: "i.id",
    employee: "e.id",
    service: "s.id",
  });
  pushAttendanceStatusFilters(filters, query, { allowNullAttendanceForNotRecorded: true });

  if (query.openAttendance) {
    filters.push({
      clause: `(${OPEN_ATTENDANCE_WORKDAY_SQL}) = 1`,
      apply: () => undefined,
    });
  }

  if (query.operationShiftId) {
    const operationShiftId = query.operationShiftId;
    filters.push({
      clause: "ow.operation_shift_id = @operationShiftId",
      apply: (request) =>
        request.input("operationShiftId", sql.UniqueIdentifier, operationShiftId),
    });
  }

  if (query.dateFrom) {
    const dateFrom = query.dateFrom;
    filters.push({
      clause: "ow.work_date >= @dateFrom",
      apply: (request) => request.input("dateFrom", sql.Date, toDateOnly(dateFrom)),
    });
  }

  if (query.dateTo) {
    const dateTo = query.dateTo;
    filters.push({
      clause: "ow.work_date <= @dateTo",
      apply: (request) => request.input("dateTo", sql.Date, toDateOnly(dateTo)),
    });
  }

  return filters;
};

/** Simulation-branch filters: same @param names as expected id filters (bind once). */
export const buildSimulationAttendanceListFilterClauses = (
  query: ListAttendanceQuery,
): { andClause: string; bindStatusFilters: SqlFilter[] } => {
  const ids = normalizeAttendanceListIdFilters(query);
  const idFilters: SqlFilter[] = [];
  pushIdFilters(idFilters, ids, {
    operation: "ar.operation_id",
    employee: "ar.employee_id",
    service: "i.service_id",
  });

  const statusFilters: SqlFilter[] = [];
  pushAttendanceStatusFilters(statusFilters, query, { allowNullAttendanceForNotRecorded: false });

  if (query.openAttendance) {
    statusFilters.push({
      clause: `ar.checkout_at IS NULL
        AND SYSUTCDATETIME() > COALESCE(
          (
            SELECT TOP 1 COALESCE(ow2.expected_end_at, ow2.expected_start_at)
            FROM employee_workdays ew2
            INNER JOIN operation_workdays ow2
              ON ow2.id = ew2.operation_workday_id
             AND ow2.company_id = ew2.company_id
            WHERE ew2.id = ar.employee_workday_id
              AND ew2.company_id = ar.company_id
          ),
          i.scheduled_end,
          i.scheduled_start
        )`,
      apply: () => undefined,
    });
  }

  if (query.operationShiftId) {
    const operationShiftId = query.operationShiftId;
    statusFilters.push({
      clause: `EXISTS (
        SELECT 1
        FROM employee_workdays ew_shift
        INNER JOIN operation_workdays ow_shift
          ON ow_shift.id = ew_shift.operation_workday_id
         AND ow_shift.company_id = ew_shift.company_id
        WHERE ew_shift.id = ar.employee_workday_id
          AND ew_shift.company_id = ar.company_id
          AND ow_shift.operation_shift_id = @operationShiftId
      )`,
      apply: (request) =>
        request.input("operationShiftId", sql.UniqueIdentifier, operationShiftId),
    });
  }

  if (query.dateFrom) {
    const dateFrom = query.dateFrom;
    statusFilters.push({
      clause: "COALESCE(ar.received_at, ar.checkout_at) >= @simDateFrom",
      apply: (request) => request.input("simDateFrom", sql.DateTime2, new Date(dateFrom)),
    });
  }

  if (query.dateTo) {
    const dateTo = query.dateTo;
    statusFilters.push({
      clause: "COALESCE(ar.received_at, ar.checkout_at) <= @simDateTo",
      apply: (request) => request.input("simDateTo", sql.DateTime2, new Date(dateTo)),
    });
  }

  const clauses = [...idFilters, ...statusFilters].map((filter) => filter.clause);
  return {
    andClause: clauses.length > 0 ? `AND ${clauses.join(" AND ")}` : "",
    // Status/@operationShiftId params are bound by the expected branch; only bind sim-only dates.
    bindStatusFilters: statusFilters.filter(
      (filter) => filter.clause.includes("@simDateFrom") || filter.clause.includes("@simDateTo"),
    ),
  };
};

/** Legacy production punches without employee_workday_id (must not silently disappear). */
export const buildLegacyOrphanAttendanceFilterClauses = (
  query: ListAttendanceQuery,
): { andClause: string; bindFilters: SqlFilter[] } => {
  const ids = normalizeAttendanceListIdFilters(query);
  const filters: SqlFilter[] = [];
  pushIdFilters(filters, ids, {
    operation: "ar.operation_id",
    employee: "ar.employee_id",
    service: "i.service_id",
  });
  pushAttendanceStatusFilters(filters, query, { allowNullAttendanceForNotRecorded: false });

  if (query.dateFrom) {
    const dateFrom = query.dateFrom;
    filters.push({
      clause: "COALESCE(ar.received_at, ar.checkout_at) >= @legacyDateFrom",
      apply: (request) => request.input("legacyDateFrom", sql.DateTime2, new Date(dateFrom)),
    });
  }

  if (query.dateTo) {
    const dateTo = query.dateTo;
    filters.push({
      clause: "COALESCE(ar.received_at, ar.checkout_at) <= @legacyDateTo",
      apply: (request) => request.input("legacyDateTo", sql.DateTime2, new Date(dateTo)),
    });
  }

  // Shift filter cannot be applied without a workday — exclude orphans when shift is set.
  if (query.operationShiftId) {
    filters.push({
      clause: "1 = 0",
      apply: () => undefined,
    });
  }

  if (query.openAttendance) {
    filters.push({
      clause: `ar.checkout_at IS NULL
        AND SYSUTCDATETIME() > COALESCE(i.scheduled_end, i.scheduled_start)`,
      apply: () => undefined,
    });
  }

  return {
    andClause: filters.length > 0 ? `AND ${filters.map((f) => f.clause).join(" AND ")}` : "",
    // Shared status params are bound by the expected branch; only bind legacy-only dates.
    bindFilters: filters.filter(
      (filter) =>
        filter.clause.includes("@legacyDateFrom") || filter.clause.includes("@legacyDateTo"),
    ),
  };
};

export const applyExpectedAttendanceListFilters = (
  request: sql.Request,
  filters: SqlFilter[],
  referenceAt: Date,
): void => {
  applySqlFilters(request, filters);
  request.input("referenceAt", sql.DateTimeOffset, referenceAt);
};

export const buildExpectedAttendanceListFromClause = (whereClause: string): string => `
  FROM employee_workdays ew
  INNER JOIN operation_workdays ow
    ON ow.id = ew.operation_workday_id
   AND ow.company_id = ew.company_id
  INNER JOIN scheduled_operations i
    ON i.id = ow.operation_id
   AND i.company_id = ow.company_id
  INNER JOIN operational_locations s
    ON s.id = i.service_id
   AND s.company_id = i.company_id
  INNER JOIN employees e
    ON e.id = ew.employee_id
   AND e.company_id = ew.company_id
  ${ATTENDANCE_LIST_CANONICAL_APPLY}
  ${whereClause}
`;

const notRecordedAttendanceFields = (): Pick<
  AttendanceRecord,
  | "receivedLatitude"
  | "receivedLongitude"
  | "distanceMeters"
  | "locationStatus"
  | "punctualityStatus"
  | "sourceMessageSid"
  | "validationReason"
  | "reviewedBy"
  | "reviewedAt"
  | "reviewReason"
  | "receivedAt"
  | "checkoutAt"
  | "checkoutLatitude"
  | "checkoutLongitude"
  | "checkoutDistanceMeters"
  | "checkoutStatus"
  | "checkoutReviewReason"
  | "earlyDepartureMinutes"
  | "extraWorkedMinutes"
  | "checkoutMessageSid"
  | "arrivalSource"
  | "checkoutSource"
  | "arrivalRegisteredBy"
  | "arrivalRegisteredAt"
  | "checkoutRegisteredBy"
  | "checkoutRegisteredAt"
  | "isSimulation"
  | "simulationSessionId"
> => ({
  receivedLatitude: null,
  receivedLongitude: null,
  distanceMeters: null,
  locationStatus: "NOT_RECORDED",
  punctualityStatus: "NOT_RECORDED",
  sourceMessageSid: null,
  validationReason: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewReason: null,
  receivedAt: null,
  checkoutAt: null,
  checkoutLatitude: null,
  checkoutLongitude: null,
  checkoutDistanceMeters: null,
  checkoutStatus: null,
  checkoutReviewReason: null,
  earlyDepartureMinutes: null,
  extraWorkedMinutes: null,
  checkoutMessageSid: null,
  arrivalSource: null,
  checkoutSource: null,
  arrivalRegisteredBy: null,
  arrivalRegisteredAt: null,
  checkoutRegisteredBy: null,
  checkoutRegisteredAt: null,
  isSimulation: false,
  simulationSessionId: null,
});

export const buildAttendanceListRowKey = (input: {
  listRowKind: AttendanceListRowKind;
  employeeWorkdayId: string | null;
  attendanceId: string | null;
}): string => {
  if (input.listRowKind === "simulation") {
    return `sim:${input.attendanceId ?? "unknown"}`;
  }
  if (input.listRowKind === "legacy_orphan") {
    return `att:${input.attendanceId ?? "unknown"}`;
  }
  return `ew:${input.employeeWorkdayId ?? "unknown"}`;
};

/**
 * Map a workday LEFT JOIN attendance row. Does not invent coordinates or punch times.
 * No-punch rows: validationStatus=null (effectiveState is the semantic source).
 */
export const mapAttendanceListRow = (
  row: Record<string, unknown>,
  listRowKind: AttendanceListRowKind = "expected_workday",
): AttendanceListItem => {
  const employeeWorkdayId = row.employee_workday_id ? String(row.employee_workday_id) : null;
  const expectedStartAt = toIsoOrNull(row.expected_start_at) ?? "";
  const expectedEndAt = toIsoOrNull(row.expected_end_at);
  const effectiveState = String(row.effective_state ?? "PRESENT") as DerivedEmployeeWorkdayState;
  const workDateRaw = row.work_date;
  const workDate =
    workDateRaw instanceof Date
      ? workDateRaw.toISOString().slice(0, 10)
      : workDateRaw
        ? String(workDateRaw).slice(0, 10)
        : expectedStartAt.slice(0, 10);
  const shiftNameSnapshot = row.shift_name_snapshot ? String(row.shift_name_snapshot) : null;
  const attendanceId = row.attendance_id ? String(row.attendance_id) : null;
  const resolvedKind =
    (row.list_row_kind ? String(row.list_row_kind) : listRowKind) as AttendanceListRowKind;
  const listRowKey = buildAttendanceListRowKey({
    listRowKind: resolvedKind,
    employeeWorkdayId,
    attendanceId,
  });

  if (attendanceId) {
    const mapped = mapAttendanceWithRelationsRow({
      ...row,
      id: attendanceId,
      employee_workday_id: employeeWorkdayId,
      operation_id: row.operation_id,
      employee_id: row.employee_id,
    });
    return {
      ...mapped,
      hasAttendanceRecord: true,
      effectiveState,
      expectedStartAt: expectedStartAt || mapped.operation.scheduledStart || mapped.createdAt,
      expectedEndAt: expectedEndAt ?? mapped.operation.scheduledEnd,
      shiftNameSnapshot,
      workDate: workDate || mapped.createdAt.slice(0, 10),
      listRowKind: resolvedKind,
      listRowKey,
    };
  }

  return {
    id: employeeWorkdayId ?? listRowKey,
    operationId: String(row.operation_id),
    employeeId: String(row.employee_id),
    employeeWorkdayId,
    validationStatus: null,
    ...notRecordedAttendanceFields(),
    createdAt: expectedStartAt || `${workDate}T00:00:00.000Z`,
    employee: {
      id: String(row.employee_id),
      name: String(row.employee_name),
      phoneNumber: String(row.employee_phone_number),
    },
    operation: {
      id: String(row.operation_id),
      status: String(row.operation_status) as AttendanceRecordWithRelations["operation"]["status"],
      scheduledStart: toIsoOrNull(row.operation_scheduled_start) ?? expectedStartAt,
      scheduledEnd: toIsoOrNull(row.operation_scheduled_end),
    },
    service: {
      id: String(row.service_id),
      name: String(row.service_name),
      address: row.service_address ? String(row.service_address) : null,
      allowedRadiusMeters:
        row.service_allowed_radius_meters !== undefined && row.service_allowed_radius_meters !== null
          ? Number(row.service_allowed_radius_meters)
          : undefined,
    },
    hasAttendanceRecord: false,
    effectiveState,
    expectedStartAt,
    expectedEndAt,
    shiftNameSnapshot,
    workDate,
    listRowKind: resolvedKind,
    listRowKey,
  };
};

export const expectedAttendanceListSelectSql = `
  CAST(N'expected_workday' AS NVARCHAR(32)) AS list_row_kind,
  ew.id AS employee_workday_id,
  ew.expectation_status,
  ow.work_date,
  ow.expected_start_at,
  ow.expected_end_at,
  ow.early_tolerance_minutes,
  ow.late_tolerance_minutes,
  ow.operation_shift_id,
  ow.shift_name_snapshot,
  ow.shift_code_snapshot,
  i.id AS operation_id,
  i.status AS operation_status,
  i.scheduled_start AS operation_scheduled_start,
  i.scheduled_end AS operation_scheduled_end,
  e.id AS employee_id,
  e.name AS employee_name,
  e.phone_number AS employee_phone_number,
  e.document_number AS employee_document_number,
  s.id AS service_id,
  s.name AS service_name,
  s.address AS service_address,
  s.allowed_radius_meters AS service_allowed_radius_meters,
  ar.id AS attendance_id,
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
  ar.arrival_source,
  ar.checkout_source,
  ar.arrival_registered_by,
  ar.arrival_registered_at,
  ar.checkout_registered_by,
  ar.checkout_registered_at,
  ar.is_simulation,
  ar.simulation_session_id,
  ar.created_at,
  (${EFFECTIVE_STATE_SQL}) AS effective_state
`;

export const simulationAttendanceListSelectSql = `
  CAST(N'simulation' AS NVARCHAR(32)) AS list_row_kind,
  ar.employee_workday_id AS employee_workday_id,
  CAST(NULL AS NVARCHAR(30)) AS expectation_status,
  CAST(COALESCE(ar.received_at, ar.checkout_at, ar.created_at) AS DATE) AS work_date,
  i.scheduled_start AS expected_start_at,
  i.scheduled_end AS expected_end_at,
  CAST(NULL AS INT) AS early_tolerance_minutes,
  CAST(NULL AS INT) AS late_tolerance_minutes,
  CAST(NULL AS UNIQUEIDENTIFIER) AS operation_shift_id,
  CAST(NULL AS NVARCHAR(220)) AS shift_name_snapshot,
  CAST(NULL AS NVARCHAR(64)) AS shift_code_snapshot,
  i.id AS operation_id,
  i.status AS operation_status,
  i.scheduled_start AS operation_scheduled_start,
  i.scheduled_end AS operation_scheduled_end,
  e.id AS employee_id,
  e.name AS employee_name,
  e.phone_number AS employee_phone_number,
  e.document_number AS employee_document_number,
  s.id AS service_id,
  s.name AS service_name,
  s.address AS service_address,
  s.allowed_radius_meters AS service_allowed_radius_meters,
  ar.id AS attendance_id,
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
  ar.arrival_source,
  ar.checkout_source,
  ar.arrival_registered_by,
  ar.arrival_registered_at,
  ar.checkout_registered_by,
  ar.checkout_registered_at,
  ar.is_simulation,
  ar.simulation_session_id,
  ar.created_at,
  CAST(N'PRESENT' AS NVARCHAR(30)) AS effective_state
`;

export const legacyOrphanAttendanceListSelectSql = `
  CAST(N'legacy_orphan' AS NVARCHAR(32)) AS list_row_kind,
  CAST(NULL AS UNIQUEIDENTIFIER) AS employee_workday_id,
  CAST(NULL AS NVARCHAR(30)) AS expectation_status,
  CAST(COALESCE(ar.received_at, ar.checkout_at, ar.created_at) AS DATE) AS work_date,
  i.scheduled_start AS expected_start_at,
  i.scheduled_end AS expected_end_at,
  CAST(NULL AS INT) AS early_tolerance_minutes,
  CAST(NULL AS INT) AS late_tolerance_minutes,
  CAST(NULL AS UNIQUEIDENTIFIER) AS operation_shift_id,
  CAST(NULL AS NVARCHAR(220)) AS shift_name_snapshot,
  CAST(NULL AS NVARCHAR(64)) AS shift_code_snapshot,
  i.id AS operation_id,
  i.status AS operation_status,
  i.scheduled_start AS operation_scheduled_start,
  i.scheduled_end AS operation_scheduled_end,
  e.id AS employee_id,
  e.name AS employee_name,
  e.phone_number AS employee_phone_number,
  e.document_number AS employee_document_number,
  s.id AS service_id,
  s.name AS service_name,
  s.address AS service_address,
  s.allowed_radius_meters AS service_allowed_radius_meters,
  ar.id AS attendance_id,
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
  ar.arrival_source,
  ar.checkout_source,
  ar.arrival_registered_by,
  ar.arrival_registered_at,
  ar.checkout_registered_by,
  ar.checkout_registered_at,
  ar.is_simulation,
  ar.simulation_session_id,
  ar.created_at,
  CAST(N'PRESENT' AS NVARCHAR(30)) AS effective_state
`;

export { buildWhereClause };
