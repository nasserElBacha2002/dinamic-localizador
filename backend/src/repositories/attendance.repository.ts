import sql from "mssql";
import { getPool } from "../database/connection";
import type { CheckoutStatus } from "../constants/checkout-status";
import type { AttendanceRecord, AttendanceRecordWithRelations } from "../types/domain";
import type { CheckoutEligibleInventory } from "../types/twilio.types";
import { mapAttendanceRow, mapAttendanceWithRelationsRow } from "../utils/row-mappers";
import { applySqlFilters, buildWhereClause, type SqlFilter } from "../utils/sql-list-query";
import type { CreateAttendanceInput, ListAttendanceQuery } from "../schemas/attendance.schema";

const buildAttendanceFilters = (companyId: string, query: ListAttendanceQuery): SqlFilter[] => {
  const filters: SqlFilter[] = [
    {
      clause: "ar.company_id = @companyId",
      apply: (request) => request.input("companyId", sql.UniqueIdentifier, companyId),
    },
  ];

  if (query.simulationOnly) {
    filters.push({
      clause: "ar.is_simulation = 1",
      apply: () => undefined,
    });
  } else if (!query.includeSimulation) {
    filters.push({
      clause: "ar.is_simulation = 0",
      apply: () => undefined,
    });
  }

  if (query.inventoryId) {
    filters.push({
      clause: "ar.inventory_id = @inventoryId",
      apply: (request) => request.input("inventoryId", sql.UniqueIdentifier, query.inventoryId),
    });
  }

  if (query.employeeId) {
    filters.push({
      clause: "ar.employee_id = @employeeId",
      apply: (request) => request.input("employeeId", sql.UniqueIdentifier, query.employeeId),
    });
  }

  if (query.storeId) {
    filters.push({
      clause: "i.store_id = @storeId",
      apply: (request) => request.input("storeId", sql.UniqueIdentifier, query.storeId),
    });
  }

  if (query.validationStatus) {
    filters.push({
      clause: "ar.validation_status = @validationStatus",
      apply: (request) => request.input("validationStatus", sql.NVarChar(30), query.validationStatus),
    });
  }

  if (query.locationStatus) {
    filters.push({
      clause: "ar.location_status = @locationStatus",
      apply: (request) => request.input("locationStatus", sql.NVarChar(30), query.locationStatus),
    });
  }

  if (query.punctualityStatus) {
    filters.push({
      clause: "ar.punctuality_status = @punctualityStatus",
      apply: (request) =>
        request.input("punctualityStatus", sql.NVarChar(30), query.punctualityStatus),
    });
  }

  if (query.dateFrom) {
    const dateFrom = query.dateFrom;
    filters.push({
      clause: "ar.received_at >= @dateFrom",
      apply: (request) => request.input("dateFrom", sql.DateTime2, new Date(dateFrom)),
    });
  }

  if (query.dateTo) {
    const dateTo = query.dateTo;
    filters.push({
      clause: "ar.received_at <= @dateTo",
      apply: (request) => request.input("dateTo", sql.DateTime2, new Date(dateTo)),
    });
  }

  return filters;
};

export const attendanceRepository = {
  async create(companyId: string, input: CreateAttendanceInput): Promise<AttendanceRecord> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("inventoryId", sql.UniqueIdentifier, input.inventoryId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("receivedLatitude", sql.Decimal(10, 7), input.receivedLatitude)
      .input("receivedLongitude", sql.Decimal(10, 7), input.receivedLongitude)
      .input("distanceMeters", sql.Decimal(10, 2), input.distanceMeters)
      .input("validationStatus", sql.NVarChar(30), input.validationStatus)
      .input("locationStatus", sql.NVarChar(30), input.locationStatus)
      .input("punctualityStatus", sql.NVarChar(30), input.punctualityStatus)
      .input("sourceMessageSid", sql.NVarChar(100), input.sourceMessageSid ?? null)
      .input("validationReason", sql.NVarChar(500), input.validationReason ?? null)
      .input("receivedAt", sql.DateTime2, new Date(input.receivedAt))
      .query(`
        INSERT INTO attendance_records (
          company_id, inventory_id, employee_id, received_latitude, received_longitude,
          distance_meters, validation_status, location_status, punctuality_status,
          source_message_sid, validation_reason, received_at
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @inventoryId, @employeeId, @receivedLatitude, @receivedLongitude,
          @distanceMeters, @validationStatus, @locationStatus, @punctualityStatus,
          @sourceMessageSid, @validationReason, @receivedAt
        )
      `);

    return mapAttendanceRow(result.recordset[0] as Record<string, unknown>);
  },

  async findById(companyId: string, id: string): Promise<AttendanceRecordWithRelations | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
      SELECT
        ar.*,
        e.name AS employee_name,
        e.phone_number AS employee_phone_number,
        i.status AS inventory_status,
        i.scheduled_start AS inventory_scheduled_start,
        i.scheduled_end AS inventory_scheduled_end,
        s.id AS store_id,
        s.name AS store_name,
        s.address AS store_address,
        s.allowed_radius_meters AS store_allowed_radius_meters
      FROM attendance_records ar
      INNER JOIN employees e ON e.id = ar.employee_id AND e.company_id = @companyId
      INNER JOIN inventories i ON i.id = ar.inventory_id AND i.company_id = @companyId
      INNER JOIN stores s ON s.id = i.store_id AND s.company_id = @companyId
      WHERE ar.id = @id AND ar.company_id = @companyId
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAttendanceWithRelationsRow(result.recordset[0] as Record<string, unknown>);
  },

  async list(
    companyId: string,
    query: ListAttendanceQuery,
  ): Promise<{ items: AttendanceRecordWithRelations[]; total: number }> {
    const pool = getPool();
    const filters = buildAttendanceFilters(companyId, query);
    const whereClause = buildWhereClause(filters);

    const countRequest = pool.request();
    applySqlFilters(countRequest, filters);
    const countResult = await countRequest.query(`
      SELECT COUNT(*) AS total
      FROM attendance_records ar
      INNER JOIN inventories i ON i.id = ar.inventory_id AND i.company_id = ar.company_id
      ${whereClause}
    `);
    const total = Number(countResult.recordset[0].total);

    const dataRequest = pool.request();
    applySqlFilters(dataRequest, filters);
    dataRequest.input("offset", sql.Int, (query.page - 1) * query.limit);
    dataRequest.input("limit", sql.Int, query.limit);

    const dataResult = await dataRequest.query(`
      SELECT
        ar.*,
        e.name AS employee_name,
        e.phone_number AS employee_phone_number,
        i.status AS inventory_status,
        i.scheduled_start AS inventory_scheduled_start,
        i.scheduled_end AS inventory_scheduled_end,
        s.id AS store_id,
        s.name AS store_name,
        s.address AS store_address,
        s.allowed_radius_meters AS store_allowed_radius_meters
      FROM attendance_records ar
      INNER JOIN employees e ON e.id = ar.employee_id AND e.company_id = ar.company_id
      INNER JOIN inventories i ON i.id = ar.inventory_id AND i.company_id = ar.company_id
      INNER JOIN stores s ON s.id = i.store_id AND s.company_id = ar.company_id
      ${whereClause}
      ORDER BY ar.received_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return {
      items: dataResult.recordset.map((row) =>
        mapAttendanceWithRelationsRow(row as Record<string, unknown>),
      ),
      total,
    };
  },

  async hasActiveRecord(
    companyId: string,
    inventoryId: string,
    employeeId: string,
    options?: { simulationSessionId?: string | null },
  ): Promise<boolean> {
    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .input("employeeId", sql.UniqueIdentifier, employeeId);

    const simulationFilter = options?.simulationSessionId
      ? "AND is_simulation = 1 AND simulation_session_id = @simulationSessionId"
      : "AND is_simulation = 0";

    if (options?.simulationSessionId) {
      request.input("simulationSessionId", sql.UniqueIdentifier, options.simulationSessionId);
    }

    const result = await request.query(`
        SELECT TOP 1 1 AS found
        FROM attendance_records
        WHERE inventory_id = @inventoryId
          AND employee_id = @employeeId
          AND company_id = @companyId
          AND validation_status IN ('VALID', 'PENDING_REVIEW')
          ${simulationFilter}
      `);

    return Boolean(result.recordset[0]);
  },

  async hasActiveRecordInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    inventoryId: string,
    employeeId: string,
    simulationSessionId: string | null,
  ): Promise<boolean> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("simulationSessionId", sql.UniqueIdentifier, simulationSessionId)
      .query(`
        SELECT TOP 1 1 AS found
        FROM attendance_records WITH (UPDLOCK, HOLDLOCK)
        WHERE inventory_id = @inventoryId
          AND employee_id = @employeeId
          AND company_id = @companyId
          AND validation_status IN ('VALID', 'PENDING_REVIEW')
          AND (
            (@simulationSessionId IS NULL AND is_simulation = 0)
            OR (is_simulation = 1 AND simulation_session_id = @simulationSessionId)
          )
      `);

    return Boolean(result.recordset[0]);
  },

  async createInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: CreateAttendanceInput & {
      isSimulation?: boolean;
      simulationSessionId?: string | null;
    },
  ): Promise<AttendanceRecord> {
    const request = new sql.Request(transaction);
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("inventoryId", sql.UniqueIdentifier, input.inventoryId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("receivedLatitude", sql.Decimal(10, 7), input.receivedLatitude)
      .input("receivedLongitude", sql.Decimal(10, 7), input.receivedLongitude)
      .input("distanceMeters", sql.Decimal(10, 2), input.distanceMeters)
      .input("validationStatus", sql.NVarChar(30), input.validationStatus)
      .input("locationStatus", sql.NVarChar(30), input.locationStatus)
      .input("punctualityStatus", sql.NVarChar(30), input.punctualityStatus)
      .input("sourceMessageSid", sql.NVarChar(100), input.sourceMessageSid ?? null)
      .input("validationReason", sql.NVarChar(500), input.validationReason ?? null)
      .input("receivedAt", sql.DateTime2, new Date(input.receivedAt))
      .input("isSimulation", sql.Bit, input.isSimulation ? 1 : 0)
      .input("simulationSessionId", sql.UniqueIdentifier, input.simulationSessionId ?? null)
      .query(`
        INSERT INTO attendance_records (
          company_id, inventory_id, employee_id, received_latitude, received_longitude,
          distance_meters, validation_status, location_status, punctuality_status,
          source_message_sid, validation_reason, received_at,
          is_simulation, simulation_session_id
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @inventoryId, @employeeId, @receivedLatitude, @receivedLongitude,
          @distanceMeters, @validationStatus, @locationStatus, @punctualityStatus,
          @sourceMessageSid, @validationReason, @receivedAt,
          @isSimulation, @simulationSessionId
        )
      `);

    return mapAttendanceRow(result.recordset[0] as Record<string, unknown>);
  },

  async listForExport(
    companyId: string,
    query: ListAttendanceQuery,
  ): Promise<Record<string, unknown>[]> {
    const pool = getPool();
    const filters = buildAttendanceFilters(companyId, query);
    const whereClause = buildWhereClause(filters);
    const request = pool.request();
    applySqlFilters(request, filters);

    const result = await request.query(`
      SELECT
        ar.*,
        e.name AS employee_name,
        e.document_number AS employee_document_number,
        e.phone_number AS employee_phone_number,
        i.scheduled_start AS inventory_scheduled_start,
        s.name AS store_name,
        s.address AS store_address,
        s.allowed_radius_meters AS store_allowed_radius_meters,
        reviewer.name AS reviewer_name
      FROM attendance_records ar
      INNER JOIN employees e ON e.id = ar.employee_id AND e.company_id = ar.company_id
      INNER JOIN inventories i ON i.id = ar.inventory_id AND i.company_id = ar.company_id
      INNER JOIN stores s ON s.id = i.store_id AND s.company_id = ar.company_id
      LEFT JOIN users reviewer ON reviewer.id = ar.reviewed_by
      ${whereClause}
      ORDER BY ar.received_at DESC
    `);

    return result.recordset as Record<string, unknown>[];
  },

  async applyReview(
    companyId: string,
    input: {
      attendanceId: string;
      reviewedBy: string;
      newValidationStatus: "VALID" | "REJECTED";
      reason: string;
    },
    transaction: sql.Transaction,
  ): Promise<AttendanceRecord> {
    const request = new sql.Request(transaction);
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("attendanceId", sql.UniqueIdentifier, input.attendanceId)
      .input("reviewedBy", sql.UniqueIdentifier, input.reviewedBy)
      .input("newValidationStatus", sql.NVarChar(30), input.newValidationStatus)
      .input("reason", sql.NVarChar(1000), input.reason)
      .query(`
        UPDATE attendance_records
        SET validation_status = @newValidationStatus,
            reviewed_by = @reviewedBy,
            reviewed_at = SYSUTCDATETIME(),
            review_reason = @reason
        OUTPUT INSERTED.*
        WHERE id = @attendanceId AND company_id = @companyId
      `);

    return mapAttendanceRow(result.recordset[0] as Record<string, unknown>);
  },

  async findCheckoutEligibleInventories(
    companyId: string,
    employeeId: string,
  ): Promise<CheckoutEligibleInventory[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
      SELECT
        i.id,
        i.store_id,
        i.scheduled_start,
        i.scheduled_end,
        i.early_tolerance_minutes,
        i.late_tolerance_minutes,
        i.status,
        ar.id AS attendance_id,
        s.name AS store_name,
        s.latitude AS store_latitude,
        s.longitude AS store_longitude,
        s.allowed_radius_meters
      FROM attendance_records ar
      INNER JOIN inventories i ON i.id = ar.inventory_id AND i.company_id = @companyId
      INNER JOIN inventory_employees ie
        ON ie.inventory_id = i.id AND ie.employee_id = ar.employee_id AND ie.company_id = @companyId
      INNER JOIN stores s ON s.id = i.store_id AND s.company_id = @companyId
      WHERE ar.employee_id = @employeeId
        AND ar.company_id = @companyId
        AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
        AND ar.checkout_at IS NULL
        AND i.status <> 'CANCELLED'
        AND s.active = 1
      ORDER BY i.scheduled_start ASC
    `);

    return result.recordset.map((row) => ({
      id: String(row.id),
      storeId: String(row.store_id),
      storeName: String(row.store_name),
      storeLatitude: Number(row.store_latitude),
      storeLongitude: Number(row.store_longitude),
      allowedRadiusMeters: Number(row.allowed_radius_meters),
      scheduledStart: new Date(row.scheduled_start as Date | string).toISOString(),
      scheduledEnd: row.scheduled_end
        ? new Date(row.scheduled_end as Date | string).toISOString()
        : null,
      earlyToleranceMinutes: Number(row.early_tolerance_minutes),
      lateToleranceMinutes: Number(row.late_tolerance_minutes),
      status: String(row.status),
      attendanceId: String(row.attendance_id),
    }));
  },

  async findCheckInForCheckout(
    companyId: string,
    inventoryId: string,
    employeeId: string,
    options?: { simulationSessionId?: string | null },
  ): Promise<AttendanceRecord | null> {
    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .input("employeeId", sql.UniqueIdentifier, employeeId);

    const simulationFilter = options?.simulationSessionId
      ? "AND is_simulation = 1 AND simulation_session_id = @simulationSessionId"
      : "AND is_simulation = 0";

    if (options?.simulationSessionId) {
      request.input("simulationSessionId", sql.UniqueIdentifier, options.simulationSessionId);
    }

    const result = await request.query(`
        SELECT TOP 1 *
        FROM attendance_records
        WHERE inventory_id = @inventoryId
          AND employee_id = @employeeId
          AND company_id = @companyId
          AND validation_status IN ('VALID', 'PENDING_REVIEW')
          AND checkout_at IS NULL
          ${simulationFilter}
        ORDER BY received_at DESC
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAttendanceRow(result.recordset[0] as Record<string, unknown>);
  },

  async registerCheckoutInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: {
      attendanceId: string;
      checkoutLatitude: number | null;
      checkoutLongitude: number | null;
      checkoutDistanceMeters: number | null;
      checkoutStatus: CheckoutStatus;
      checkoutReviewReason: string | null;
      earlyDepartureMinutes: number;
      extraWorkedMinutes: number;
      checkoutMessageSid: string;
      checkoutAt: string;
    },
  ): Promise<AttendanceRecord | null> {
    const request = new sql.Request(transaction);
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("attendanceId", sql.UniqueIdentifier, input.attendanceId)
      .input("checkoutLatitude", sql.Decimal(10, 7), input.checkoutLatitude)
      .input("checkoutLongitude", sql.Decimal(10, 7), input.checkoutLongitude)
      .input("checkoutDistanceMeters", sql.Decimal(10, 2), input.checkoutDistanceMeters)
      .input("checkoutStatus", sql.NVarChar(40), input.checkoutStatus)
      .input("checkoutReviewReason", sql.NVarChar(500), input.checkoutReviewReason)
      .input("earlyDepartureMinutes", sql.Int, input.earlyDepartureMinutes)
      .input("extraWorkedMinutes", sql.Int, input.extraWorkedMinutes)
      .input("checkoutMessageSid", sql.NVarChar(100), input.checkoutMessageSid)
      .input("checkoutAt", sql.DateTime2, new Date(input.checkoutAt))
      .query(`
        UPDATE attendance_records
        SET checkout_at = @checkoutAt,
            checkout_latitude = @checkoutLatitude,
            checkout_longitude = @checkoutLongitude,
            checkout_distance_meters = @checkoutDistanceMeters,
            checkout_status = @checkoutStatus,
            checkout_review_reason = @checkoutReviewReason,
            early_departure_minutes = @earlyDepartureMinutes,
            extra_worked_minutes = @extraWorkedMinutes,
            checkout_message_sid = @checkoutMessageSid
        OUTPUT INSERTED.*
        WHERE id = @attendanceId
          AND company_id = @companyId
          AND checkout_at IS NULL
          AND validation_status IN ('VALID', 'PENDING_REVIEW')
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAttendanceRow(result.recordset[0] as Record<string, unknown>);
  },
};
