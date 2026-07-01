import sql from "mssql";
import { getPool } from "../database/connection";
import type { StatisticsFilters } from "../schemas/statistics.schema";
import type {
  AttendanceByEmployeeRow,
  AttendanceByInventoryRow,
  AttendanceByLocationRow,
  AttendanceStatisticsSummary,
  AttendanceStatusDistributionItem,
  AttendanceTimelinePoint,
} from "../types/statistics";
import { applySqlFilters, buildWhereClause, type SqlFilter } from "../utils/sql-list-query";

const ASSIGNMENT_BASE_FROM = `
  FROM inventory_employees ie
  INNER JOIN inventories i ON i.id = ie.inventory_id AND i.company_id = ie.company_id
  INNER JOIN stores s ON s.id = i.store_id AND s.company_id = i.company_id
  INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = ie.company_id
  LEFT JOIN attendance_records ar
    ON ar.inventory_id = ie.inventory_id
   AND ar.employee_id = ie.employee_id
   AND ar.company_id = ie.company_id
`;

const buildStatisticsFilters = (companyId: string, filters: StatisticsFilters): SqlFilter[] => {
  const sqlFilters: SqlFilter[] = [
    {
      clause: "i.company_id = @companyId",
      apply: (request) => request.input("companyId", sql.UniqueIdentifier, companyId),
    },
  ];

  if (filters.dateFrom) {
    sqlFilters.push({
      clause: "i.scheduled_start >= @dateFrom",
      apply: (request) => request.input("dateFrom", sql.DateTimeOffset, filters.dateFrom),
    });
  }

  if (filters.dateTo) {
    sqlFilters.push({
      clause: "i.scheduled_start <= @dateTo",
      apply: (request) => request.input("dateTo", sql.DateTimeOffset, filters.dateTo),
    });
  }

  if (filters.inventoryId) {
    sqlFilters.push({
      clause: "i.id = @inventoryId",
      apply: (request) => request.input("inventoryId", sql.UniqueIdentifier, filters.inventoryId),
    });
  }

  if (filters.storeId) {
    sqlFilters.push({
      clause: "s.id = @storeId",
      apply: (request) => request.input("storeId", sql.UniqueIdentifier, filters.storeId),
    });
  }

  if (filters.employeeId) {
    sqlFilters.push({
      clause: "e.id = @employeeId",
      apply: (request) => request.input("employeeId", sql.UniqueIdentifier, filters.employeeId),
    });
  }

  if (filters.validationStatus === "NO_CHECK_IN") {
    sqlFilters.push({
      clause: "ar.id IS NULL",
      apply: () => undefined,
    });
  } else if (filters.validationStatus) {
    sqlFilters.push({
      clause: "ar.validation_status = @validationStatus",
      apply: (request) => request.input("validationStatus", sql.NVarChar, filters.validationStatus),
    });
  }

  if (filters.locationStatus) {
    sqlFilters.push({
      clause: "ar.location_status = @locationStatus",
      apply: (request) => request.input("locationStatus", sql.NVarChar, filters.locationStatus),
    });
  }

  if (filters.punctualityStatus) {
    sqlFilters.push({
      clause: "ar.punctuality_status = @punctualityStatus",
      apply: (request) => request.input("punctualityStatus", sql.NVarChar, filters.punctualityStatus),
    });
  }

  return sqlFilters;
};

const toNumber = (value: unknown): number => Number(value ?? 0);

const toPercentage = (numerator: number, denominator: number): number => {
  if (denominator === 0) {
    return 0;
  }

  return Math.round((numerator / denominator) * 1000) / 10;
};

const toIsoDate = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toDateKey = (value: unknown): string => {
  const date = value instanceof Date ? value : new Date(String(value));
  return date.toISOString().slice(0, 10);
};

const STATUS_LABELS: Record<string, string> = {
  present: "Presente / a tiempo",
  late: "Tarde",
  outsideGeofence: "Fuera de geocerca",
  pendingReview: "Pendiente de revisión",
  rejected: "Rechazado",
  manuallyAccepted: "Aceptado manualmente",
  noShow: "Sin asistencia",
};

const EMPLOYEE_SORT_FIELDS: Record<string, string> = {
  employeeName: "e.name",
  phoneNumber: "e.phone_number",
  assignedInventoriesCount: "assigned_inventories_count",
  confirmedAttendances: "confirmed_attendances",
  noShowCount: "no_show_count",
  lateCount: "late_count",
  outsideGeofenceCount: "outside_geofence_count",
  pendingReviewCount: "pending_review_count",
  attendancePercentage: "attendance_percentage",
  lastAttendanceDate: "last_attendance_date",
};

const INVENTORY_SORT_FIELDS: Record<string, string> = {
  storeName: "s.name",
  scheduledStart: "i.scheduled_start",
  assignedEmployeesCount: "assigned_employees_count",
  presentCount: "present_count",
  noShowCount: "no_show_count",
  lateCount: "late_count",
  outsideGeofenceCount: "outside_geofence_count",
  pendingReviewCount: "pending_review_count",
  attendancePercentage: "attendance_percentage",
  operationalStatus: "i.status",
};

const LOCATION_SORT_FIELDS: Record<string, string> = {
  storeName: "s.name",
  address: "s.address",
  totalInventories: "total_inventories",
  averageAttendancePercentage: "average_attendance_percentage",
  totalAssignedEmployees: "total_assigned_employees",
  totalConfirmedAttendances: "total_confirmed_attendances",
  totalNoShows: "total_no_shows",
  totalLateRecords: "total_late_records",
  totalOutsideGeofenceRecords: "total_outside_geofence_records",
  totalManualReviews: "total_manual_reviews",
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

export const statisticsRepository = {
  async getSummary(
    companyId: string,
    filters: StatisticsFilters,
  ): Promise<AttendanceStatisticsSummary> {
    const pool = getPool();
    const sqlFilters = buildStatisticsFilters(companyId, filters);
    const request = pool.request();
    applySqlFilters(request, sqlFilters);

    const result = await request.query(`
      SELECT
        COUNT(*) AS total_assigned,
        COUNT(DISTINCT i.id) AS total_inventories,
        SUM(CASE WHEN ar.id IS NOT NULL THEN 1 ELSE 0 END) AS total_attendance_records,
        SUM(CASE WHEN ar.punctuality_status IN ('ON_TIME', 'EARLY') THEN 1 ELSE 0 END) AS present_count,
        SUM(CASE WHEN ar.punctuality_status = 'LATE' THEN 1 ELSE 0 END) AS late_count,
        SUM(CASE WHEN ar.location_status = 'OUTSIDE_GEOFENCE' THEN 1 ELSE 0 END) AS outside_geofence_count,
        SUM(CASE WHEN ar.validation_status = 'PENDING_REVIEW' THEN 1 ELSE 0 END) AS pending_review_count,
        SUM(CASE WHEN ar.validation_status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_count,
        SUM(CASE WHEN ar.reviewed_at IS NOT NULL AND ar.validation_status = 'VALID' THEN 1 ELSE 0 END) AS manually_accepted_count,
        SUM(CASE WHEN ar.id IS NULL THEN 1 ELSE 0 END) AS no_show_count
      ${ASSIGNMENT_BASE_FROM}
      ${buildWhereClause(sqlFilters)}
    `);

    const row = result.recordset[0] as Record<string, unknown>;
    const totalAssigned = toNumber(row.total_assigned);
    const totalAttendanceRecords = toNumber(row.total_attendance_records);

    return {
      totalAttendanceRecords,
      totalAssignedEmployees: totalAssigned,
      attendancePercentage: toPercentage(totalAttendanceRecords, totalAssigned),
      presentCount: toNumber(row.present_count),
      lateCount: toNumber(row.late_count),
      outsideGeofenceCount: toNumber(row.outside_geofence_count),
      pendingReviewCount: toNumber(row.pending_review_count),
      rejectedCount: toNumber(row.rejected_count),
      manuallyAcceptedCount: toNumber(row.manually_accepted_count),
      noShowCount: toNumber(row.no_show_count),
      totalInventories: toNumber(row.total_inventories),
    };
  },

  async getTimeline(
    companyId: string,
    filters: StatisticsFilters,
  ): Promise<AttendanceTimelinePoint[]> {
    const pool = getPool();
    const sqlFilters = buildStatisticsFilters(companyId, filters);
    const request = pool.request();
    applySqlFilters(request, sqlFilters);

    const result = await request.query(`
      SELECT
        CAST(COALESCE(ar.received_at, i.scheduled_start) AS DATE) AS event_date,
        SUM(CASE WHEN ar.punctuality_status IN ('ON_TIME', 'EARLY') THEN 1 ELSE 0 END) AS present_count,
        SUM(CASE WHEN ar.punctuality_status = 'LATE' THEN 1 ELSE 0 END) AS late_count,
        SUM(CASE WHEN ar.location_status = 'OUTSIDE_GEOFENCE' THEN 1 ELSE 0 END) AS outside_geofence_count,
        SUM(CASE WHEN ar.validation_status = 'PENDING_REVIEW' THEN 1 ELSE 0 END) AS pending_review_count,
        SUM(CASE WHEN ar.validation_status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_count,
        SUM(CASE WHEN ar.id IS NULL THEN 1 ELSE 0 END) AS no_show_count,
        COUNT(*) AS total_count
      ${ASSIGNMENT_BASE_FROM}
      ${buildWhereClause(sqlFilters)}
      GROUP BY CAST(COALESCE(ar.received_at, i.scheduled_start) AS DATE)
      ORDER BY event_date ASC
    `);

    return result.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        date: toDateKey(record.event_date),
        present: toNumber(record.present_count),
        late: toNumber(record.late_count),
        outsideGeofence: toNumber(record.outside_geofence_count),
        pendingReview: toNumber(record.pending_review_count),
        rejected: toNumber(record.rejected_count),
        noShow: toNumber(record.no_show_count),
        total: toNumber(record.total_count),
      };
    });
  },

  async getStatusDistribution(
    companyId: string,
    filters: StatisticsFilters,
  ): Promise<AttendanceStatusDistributionItem[]> {
    const summary = await this.getSummary(companyId, filters);

    const items: Array<{ status: string; count: number }> = [
      { status: "present", count: summary.presentCount },
      { status: "late", count: summary.lateCount },
      { status: "outsideGeofence", count: summary.outsideGeofenceCount },
      { status: "pendingReview", count: summary.pendingReviewCount },
      { status: "rejected", count: summary.rejectedCount },
      { status: "manuallyAccepted", count: summary.manuallyAcceptedCount },
      { status: "noShow", count: summary.noShowCount },
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
  ): Promise<{ data: AttendanceByEmployeeRow[]; total: number }> {
    const pool = getPool();
    const sqlFilters = buildStatisticsFilters(companyId, filters);
    const whereClause = buildWhereClause(sqlFilters);
    const orderBy = resolveSort(sortBy, EMPLOYEE_SORT_FIELDS, "e.name", sortDirection);
    const offset = (page - 1) * limit;

    const countRequest = pool.request();
    applySqlFilters(countRequest, sqlFilters);
    const countResult = await countRequest.query(`
      SELECT COUNT(DISTINCT e.id) AS total
      ${ASSIGNMENT_BASE_FROM}
      ${whereClause}
    `);
    const total = toNumber((countResult.recordset[0] as Record<string, unknown>).total);

    const dataRequest = pool.request();
    applySqlFilters(dataRequest, sqlFilters);
    dataRequest.input("offset", sql.Int, offset);
    dataRequest.input("limit", sql.Int, limit);

    const dataResult = await dataRequest.query(`
      SELECT
        e.id AS employee_id,
        e.name AS employee_name,
        e.phone_number,
        COUNT(DISTINCT ie.inventory_id) AS assigned_inventories_count,
        SUM(CASE WHEN ar.id IS NOT NULL THEN 1 ELSE 0 END) AS confirmed_attendances,
        SUM(CASE WHEN ar.id IS NULL THEN 1 ELSE 0 END) AS no_show_count,
        SUM(CASE WHEN ar.punctuality_status = 'LATE' THEN 1 ELSE 0 END) AS late_count,
        SUM(CASE WHEN ar.location_status = 'OUTSIDE_GEOFENCE' THEN 1 ELSE 0 END) AS outside_geofence_count,
        SUM(CASE WHEN ar.validation_status = 'PENDING_REVIEW' THEN 1 ELSE 0 END) AS pending_review_count,
        CASE
          WHEN COUNT(*) = 0 THEN 0
          ELSE CAST(
            ROUND(
              CAST(SUM(CASE WHEN ar.id IS NOT NULL THEN 1 ELSE 0 END) AS FLOAT)
              / CAST(COUNT(*) AS FLOAT) * 1000,
              0
            ) AS INT
          ) / 10.0
        END AS attendance_percentage,
        MAX(ar.received_at) AS last_attendance_date
      ${ASSIGNMENT_BASE_FROM}
      ${whereClause}
      GROUP BY e.id, e.name, e.phone_number
      ORDER BY ${orderBy}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const data = dataResult.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        employeeId: String(record.employee_id),
        employeeName: String(record.employee_name),
        phoneNumber: String(record.phone_number),
        assignedInventoriesCount: toNumber(record.assigned_inventories_count),
        confirmedAttendances: toNumber(record.confirmed_attendances),
        noShowCount: toNumber(record.no_show_count),
        lateCount: toNumber(record.late_count),
        outsideGeofenceCount: toNumber(record.outside_geofence_count),
        pendingReviewCount: toNumber(record.pending_review_count),
        attendancePercentage: Number(record.attendance_percentage ?? 0),
        lastAttendanceDate: toIsoDate(record.last_attendance_date),
      };
    });

    return { data, total };
  },

  async getByInventory(
    companyId: string,
    filters: StatisticsFilters,
    page: number,
    limit: number,
    sortBy?: string,
    sortDirection: "asc" | "desc" = "desc",
  ): Promise<{ data: AttendanceByInventoryRow[]; total: number }> {
    const pool = getPool();
    const sqlFilters = buildStatisticsFilters(companyId, filters);
    const whereClause = buildWhereClause(sqlFilters);
    const orderBy = resolveSort(sortBy, INVENTORY_SORT_FIELDS, "i.scheduled_start", sortDirection);
    const offset = (page - 1) * limit;

    const countRequest = pool.request();
    applySqlFilters(countRequest, sqlFilters);
    const countResult = await countRequest.query(`
      SELECT COUNT(DISTINCT i.id) AS total
      ${ASSIGNMENT_BASE_FROM}
      ${whereClause}
    `);
    const total = toNumber((countResult.recordset[0] as Record<string, unknown>).total);

    const dataRequest = pool.request();
    applySqlFilters(dataRequest, sqlFilters);
    dataRequest.input("offset", sql.Int, offset);
    dataRequest.input("limit", sql.Int, limit);

    const dataResult = await dataRequest.query(`
      SELECT
        i.id AS inventory_id,
        s.name AS store_name,
        s.address AS store_address,
        i.scheduled_start,
        i.status AS operational_status,
        COUNT(*) AS assigned_employees_count,
        SUM(CASE WHEN ar.punctuality_status IN ('ON_TIME', 'EARLY') THEN 1 ELSE 0 END) AS present_count,
        SUM(CASE WHEN ar.id IS NULL THEN 1 ELSE 0 END) AS no_show_count,
        SUM(CASE WHEN ar.punctuality_status = 'LATE' THEN 1 ELSE 0 END) AS late_count,
        SUM(CASE WHEN ar.location_status = 'OUTSIDE_GEOFENCE' THEN 1 ELSE 0 END) AS outside_geofence_count,
        SUM(CASE WHEN ar.validation_status = 'PENDING_REVIEW' THEN 1 ELSE 0 END) AS pending_review_count,
        CASE
          WHEN COUNT(*) = 0 THEN 0
          ELSE CAST(
            ROUND(
              CAST(SUM(CASE WHEN ar.id IS NOT NULL THEN 1 ELSE 0 END) AS FLOAT)
              / CAST(COUNT(*) AS FLOAT) * 1000,
              0
            ) AS INT
          ) / 10.0
        END AS attendance_percentage
      ${ASSIGNMENT_BASE_FROM}
      ${whereClause}
      GROUP BY i.id, s.name, s.address, i.scheduled_start, i.status
      ORDER BY ${orderBy}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const data = dataResult.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        inventoryId: String(record.inventory_id),
        storeName: String(record.store_name),
        storeAddress: record.store_address ? String(record.store_address) : null,
        scheduledStart: toIsoDate(record.scheduled_start) ?? "",
        assignedEmployeesCount: toNumber(record.assigned_employees_count),
        presentCount: toNumber(record.present_count),
        noShowCount: toNumber(record.no_show_count),
        lateCount: toNumber(record.late_count),
        outsideGeofenceCount: toNumber(record.outside_geofence_count),
        pendingReviewCount: toNumber(record.pending_review_count),
        attendancePercentage: Number(record.attendance_percentage ?? 0),
        operationalStatus: String(record.operational_status),
      };
    });

    return { data, total };
  },

  async getByLocation(
    companyId: string,
    filters: StatisticsFilters,
    page: number,
    limit: number,
    sortBy?: string,
    sortDirection: "asc" | "desc" = "desc",
  ): Promise<{ data: AttendanceByLocationRow[]; total: number }> {
    const pool = getPool();
    const sqlFilters = buildStatisticsFilters(companyId, filters);
    const whereClause = buildWhereClause(sqlFilters);
    const orderBy = resolveSort(sortBy, LOCATION_SORT_FIELDS, "s.name", sortDirection);
    const offset = (page - 1) * limit;

    const countRequest = pool.request();
    applySqlFilters(countRequest, sqlFilters);
    const countResult = await countRequest.query(`
      SELECT COUNT(DISTINCT s.id) AS total
      ${ASSIGNMENT_BASE_FROM}
      ${whereClause}
    `);
    const total = toNumber((countResult.recordset[0] as Record<string, unknown>).total);

    const dataRequest = pool.request();
    applySqlFilters(dataRequest, sqlFilters);
    dataRequest.input("offset", sql.Int, offset);
    dataRequest.input("limit", sql.Int, limit);

    const dataResult = await dataRequest.query(`
      SELECT
        s.id AS store_id,
        s.name AS store_name,
        s.address,
        COUNT(DISTINCT i.id) AS total_inventories,
        COUNT(*) AS total_assigned_employees,
        SUM(CASE WHEN ar.id IS NOT NULL THEN 1 ELSE 0 END) AS total_confirmed_attendances,
        SUM(CASE WHEN ar.id IS NULL THEN 1 ELSE 0 END) AS total_no_shows,
        SUM(CASE WHEN ar.punctuality_status = 'LATE' THEN 1 ELSE 0 END) AS total_late_records,
        SUM(CASE WHEN ar.location_status = 'OUTSIDE_GEOFENCE' THEN 1 ELSE 0 END) AS total_outside_geofence_records,
        SUM(CASE WHEN ar.reviewed_at IS NOT NULL THEN 1 ELSE 0 END) AS total_manual_reviews,
        CASE
          WHEN COUNT(*) = 0 THEN 0
          ELSE CAST(
            ROUND(
              CAST(SUM(CASE WHEN ar.id IS NOT NULL THEN 1 ELSE 0 END) AS FLOAT)
              / CAST(COUNT(*) AS FLOAT) * 1000,
              0
            ) AS INT
          ) / 10.0
        END AS average_attendance_percentage
      ${ASSIGNMENT_BASE_FROM}
      ${whereClause}
      GROUP BY s.id, s.name, s.address
      ORDER BY ${orderBy}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const data = dataResult.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        storeId: String(record.store_id),
        storeName: String(record.store_name),
        address: record.address ? String(record.address) : null,
        totalInventories: toNumber(record.total_inventories),
        averageAttendancePercentage: Number(record.average_attendance_percentage ?? 0),
        totalAssignedEmployees: toNumber(record.total_assigned_employees),
        totalConfirmedAttendances: toNumber(record.total_confirmed_attendances),
        totalNoShows: toNumber(record.total_no_shows),
        totalLateRecords: toNumber(record.total_late_records),
        totalOutsideGeofenceRecords: toNumber(record.total_outside_geofence_records),
        totalManualReviews: toNumber(record.total_manual_reviews),
      };
    });

    return { data, total };
  },
};
