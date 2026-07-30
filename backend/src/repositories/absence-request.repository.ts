import sql from "mssql";
import { ABSENCE_OVERLAP_STATUS_SQL, toAbsenceStatusSqlInList } from "../constants/absence-transitions";
import { getPool } from "../database/connection";
import type {
  AbsenceDayPeriod,
  AbsenceRequest,
  AbsenceRequestEvent,
  AbsenceRequestStatus,
  AbsenceRequestWithRelations,
  AbsenceRequestedVia,
  ApprovedAbsenceForWorkday,
} from "../types/absence";
import type { ListAbsenceRequestsQuery } from "../schemas/absence-request.schema";
import { getPagination } from "../utils/pagination";
import { mapAbsenceRequestEventRow, mapAbsenceRequestRow, toDateOnlyString } from "../utils/row-mappers";
import { applySqlFilters, buildWhereClause, type SqlFilter } from "../utils/sql-list-query";
import { createUuidInFilter } from "../utils/sql-uuid-in-filter";

const mapListRow = (row: Record<string, unknown>): AbsenceRequestWithRelations => {
  const request = mapAbsenceRequestRow(row);

  return {
    ...request,
    employee: {
      id: String(row.employee_id),
      name: String(row.employee_name),
      phoneNumber: String(row.employee_phone_number),
      active: Boolean(row.employee_active),
    },
    absenceType: {
      id: String(row.absence_type_id),
      code: String(row.absence_type_code),
      name: String(row.absence_type_name),
    },
    reviewerName: row.reviewer_name ? String(row.reviewer_name) : null,
    affectedOperationsCount: Number(row.affected_operations_count ?? 0),
  };
};

const mapApprovedAbsenceRow = (row: Record<string, unknown>): ApprovedAbsenceForWorkday => ({
  ...mapAbsenceRequestRow(row),
  absenceTypeName: String(row.absence_type_name),
});

export const absenceRequestRepository = {
  async create(
    companyId: string,
    input: {
      employeeId: string;
      absenceTypeId: string;
      startDate: string;
      endDate: string;
      startPeriod: AbsenceDayPeriod;
      endPeriod: AbsenceDayPeriod;
      totalDays: number;
      reason: string;
      requestedVia: AbsenceRequestedVia;
      sourceMessageSid?: string | null;
      calculationMode?: string | null;
      calendarId?: string | null;
      calendarTimezone?: string | null;
      calculationVersion?: number | null;
      calendarVersion?: number | null;
      calculationInputHash?: string | null;
      reservationVersion?: number;
      yearAllocationsJson?: string | null;
      attachmentPolicySnapshot?: string | null;
    },
    transaction?: sql.Transaction,
  ): Promise<AbsenceRequest> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("absenceTypeId", sql.UniqueIdentifier, input.absenceTypeId)
      .input("startDate", sql.Date, input.startDate)
      .input("endDate", sql.Date, input.endDate)
      .input("startPeriod", sql.NVarChar(20), input.startPeriod)
      .input("endPeriod", sql.NVarChar(20), input.endPeriod)
      .input("totalDays", sql.Decimal(5, 1), input.totalDays)
      .input("reason", sql.NVarChar(1000), input.reason)
      .input("requestedVia", sql.NVarChar(30), input.requestedVia)
      .input("sourceMessageSid", sql.NVarChar(100), input.sourceMessageSid ?? null)
      .input("calculationMode", sql.NVarChar(30), input.calculationMode ?? null)
      .input("calendarId", sql.UniqueIdentifier, input.calendarId ?? null)
      .input("calendarTimezone", sql.NVarChar(80), input.calendarTimezone ?? null)
      .input("calculationVersion", sql.Int, input.calculationVersion ?? null)
      .input("calendarVersion", sql.Int, input.calendarVersion ?? null)
      .input("calculationInputHash", sql.NVarChar(64), input.calculationInputHash ?? null)
      .input("reservationVersion", sql.Int, input.reservationVersion ?? 1)
      .input("yearAllocationsJson", sql.NVarChar(sql.MAX), input.yearAllocationsJson ?? null)
      .input(
        "attachmentPolicySnapshot",
        sql.NVarChar(20),
        input.attachmentPolicySnapshot ?? null,
      )
      .query(`
        INSERT INTO absence_requests (
          company_id, employee_id, absence_type_id, start_date, end_date,
          start_period, end_period, total_days, reason,
          status, requested_via, source_message_sid,
          calculation_mode, calendar_id, calendar_timezone, calculation_version,
          calendar_version, calculation_input_hash, reservation_version, year_allocations_json,
          attachment_policy_snapshot
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @employeeId, @absenceTypeId, @startDate, @endDate,
          @startPeriod, @endPeriod, @totalDays, @reason,
          'PENDING', @requestedVia, @sourceMessageSid,
          @calculationMode, @calendarId, @calendarTimezone, @calculationVersion,
          @calendarVersion, @calculationInputHash, @reservationVersion, @yearAllocationsJson,
          @attachmentPolicySnapshot
        )
      `);

    return mapAbsenceRequestRow(result.recordset[0] as Record<string, unknown>);
  },

  async findById(companyId: string, id: string): Promise<AbsenceRequest | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        SELECT TOP 1 * FROM absence_requests
        WHERE id = @id AND company_id = @companyId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAbsenceRequestRow(result.recordset[0] as Record<string, unknown>);
  },

  async findBySourceMessageSid(
    companyId: string,
    sourceMessageSid: string,
  ): Promise<AbsenceRequest | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("sourceMessageSid", sql.NVarChar(100), sourceMessageSid)
      .query(`
        SELECT TOP 1 *
        FROM absence_requests
        WHERE source_message_sid = @sourceMessageSid
          AND company_id = @companyId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAbsenceRequestRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByIdForUpdate(
    companyId: string,
    id: string,
    transaction: sql.Transaction,
  ): Promise<AbsenceRequest | null> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        SELECT *
        FROM absence_requests WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @id AND company_id = @companyId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAbsenceRequestRow(result.recordset[0] as Record<string, unknown>);
  },

  async findDetailById(companyId: string, id: string): Promise<AbsenceRequestWithRelations | null> {
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
        e.active AS employee_active,
        at.code AS absence_type_code,
        at.name AS absence_type_name,
        u.name AS reviewer_name,
        0 AS affected_operations_count
      FROM absence_requests ar
      INNER JOIN employees e ON e.id = ar.employee_id AND e.company_id = @companyId
      INNER JOIN absence_types at ON at.id = ar.absence_type_id AND at.company_id = @companyId
      LEFT JOIN users u ON u.id = ar.reviewed_by_user_id
      WHERE ar.id = @id AND ar.company_id = @companyId
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapListRow(result.recordset[0] as Record<string, unknown>);
  },

  async list(
    companyId: string,
    query: ListAbsenceRequestsQuery,
  ): Promise<{
    items: AbsenceRequestWithRelations[];
    total: number;
  }> {
    const pool = getPool();
    const { offset } = getPagination(query.page, query.limit);
    const filters: SqlFilter[] = [
      {
        clause: "ar.company_id = @companyId",
        apply: (request) => request.input("companyId", sql.UniqueIdentifier, companyId),
      },
    ];

    if (query.status) {
      filters.push({
        clause: "ar.status = @status",
        apply: (request) => request.input("status", sql.NVarChar(30), query.status),
      });
    }
    if (query.absenceTypeId) {
      filters.push({
        clause: "ar.absence_type_id = @absenceTypeId",
        apply: (request) => request.input("absenceTypeId", sql.UniqueIdentifier, query.absenceTypeId),
      });
    }
    if ((query.employeeIds?.length ?? 0) > 0) {
      const employeeFilter = createUuidInFilter({
        column: "ar.employee_id",
        parameterPrefix: "employeeId",
        values: query.employeeIds ?? [],
      });
      if (employeeFilter) {
        filters.push(employeeFilter);
      }
    }
    if (query.dateFrom) {
      filters.push({
        clause: "ar.end_date >= @dateFrom",
        apply: (request) => request.input("dateFrom", sql.Date, query.dateFrom),
      });
    }
    if (query.dateTo) {
      filters.push({
        clause: "ar.start_date <= @dateTo",
        apply: (request) => request.input("dateTo", sql.Date, query.dateTo),
      });
    }
    if (query.search) {
      filters.push({
        clause: "(e.name LIKE @search OR e.phone_number LIKE @search OR at.name LIKE @search)",
        apply: (request) => request.input("search", sql.NVarChar(200), `%${query.search}%`),
      });
    }

    const whereClause = buildWhereClause(filters);
    const countRequest = pool.request();
    applySqlFilters(countRequest, filters);
    const countResult = await countRequest.query(`
      SELECT COUNT(*) AS total
      FROM absence_requests ar
      INNER JOIN employees e ON e.id = ar.employee_id AND e.company_id = @companyId
      INNER JOIN absence_types at ON at.id = ar.absence_type_id AND at.company_id = @companyId
      ${whereClause}
    `);
    const total = Number((countResult.recordset[0] as { total: number }).total ?? 0);

    const listRequest = pool.request();
    applySqlFilters(listRequest, filters);
    listRequest.input("offset", sql.Int, offset);
    listRequest.input("limit", sql.Int, query.limit);

    const result = await listRequest.query(`
      SELECT
        ar.*,
        e.name AS employee_name,
        e.phone_number AS employee_phone_number,
        e.active AS employee_active,
        at.code AS absence_type_code,
        at.name AS absence_type_name,
        u.name AS reviewer_name,
        0 AS affected_operations_count
      FROM absence_requests ar
      INNER JOIN employees e ON e.id = ar.employee_id AND e.company_id = @companyId
      INNER JOIN absence_types at ON at.id = ar.absence_type_id AND at.company_id = @companyId
      LEFT JOIN users u ON u.id = ar.reviewed_by_user_id
      ${whereClause}
      ORDER BY ar.created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return {
      items: result.recordset.map((row) => mapListRow(row as Record<string, unknown>)),
      total,
    };
  },

  async hasOverlappingRequest(
    companyId: string,
    employeeId: string,
    startDate: string,
    endDate: string,
    excludeRequestId?: string,
    transaction?: sql.Transaction,
  ): Promise<boolean> {
    const request = transaction
      ? new sql.Request(transaction)
      : getPool().request();

    request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("startDate", sql.Date, startDate)
      .input("endDate", sql.Date, endDate);

    let excludeClause = "";
    if (excludeRequestId) {
      request.input("excludeRequestId", sql.UniqueIdentifier, excludeRequestId);
      excludeClause = "AND id <> @excludeRequestId";
    }

    const lockHint = transaction ? "WITH (UPDLOCK, HOLDLOCK)" : "";
    const result = await request.query(`
      SELECT TOP 1 id
      FROM absence_requests ${lockHint}
      WHERE employee_id = @employeeId
        AND company_id = @companyId
        AND status IN (${ABSENCE_OVERLAP_STATUS_SQL})
        AND start_date <= @endDate
        AND end_date >= @startDate
        ${excludeClause}
    `);

    return Boolean(result.recordset[0]);
  },

  async updateStatus(
    companyId: string,
    id: string,
    input: {
      status: AbsenceRequestStatus;
      reviewedByUserId?: string | null;
      reviewedAt?: Date | null;
      reviewComment?: string | null;
      cancelledAt?: Date | null;
      onlyIfStatusIn?: AbsenceRequestStatus[];
    },
    transaction?: sql.Transaction,
  ): Promise<AbsenceRequest | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const statusFilter = input.onlyIfStatusIn?.length
      ? `AND status IN (${toAbsenceStatusSqlInList(input.onlyIfStatusIn)})`
      : "";

    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .input("status", sql.NVarChar(30), input.status)
      .input("reviewedByUserId", sql.UniqueIdentifier, input.reviewedByUserId ?? null)
      .input("reviewedAt", sql.DateTime2, input.reviewedAt ?? null)
      .input("reviewComment", sql.NVarChar(1000), input.reviewComment ?? null)
      .input("cancelledAt", sql.DateTime2, input.cancelledAt ?? null)
      .query(`
        UPDATE absence_requests
        SET
          status = @status,
          reviewed_by_user_id = @reviewedByUserId,
          reviewed_at = @reviewedAt,
          review_comment = @reviewComment,
          cancelled_at = @cancelledAt,
          updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @id AND company_id = @companyId
        ${statusFilter}
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAbsenceRequestRow(result.recordset[0] as Record<string, unknown>);
  },

  /**
   * Updates editable fields while the request remains in one of `onlyIfStatusIn`.
   * Does not change status.
   */
  async updateEditableFields(
    companyId: string,
    id: string,
    input: {
      absenceTypeId: string;
      startDate: string;
      endDate: string;
      startPeriod: AbsenceDayPeriod;
      endPeriod: AbsenceDayPeriod;
      totalDays: number;
      reason: string;
      calculationMode?: string | null;
      calendarId?: string | null;
      calendarTimezone?: string | null;
      calculationVersion?: number | null;
      calendarVersion?: number | null;
      calculationInputHash?: string | null;
      reservationVersion?: number;
      yearAllocationsJson?: string | null;
      onlyIfStatusIn: AbsenceRequestStatus[];
    },
    transaction?: sql.Transaction,
  ): Promise<AbsenceRequest | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const statusFilter = input.onlyIfStatusIn.length
      ? `AND status IN (${toAbsenceStatusSqlInList(input.onlyIfStatusIn)})`
      : "";

    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .input("absenceTypeId", sql.UniqueIdentifier, input.absenceTypeId)
      .input("startDate", sql.Date, input.startDate)
      .input("endDate", sql.Date, input.endDate)
      .input("startPeriod", sql.NVarChar(20), input.startPeriod)
      .input("endPeriod", sql.NVarChar(20), input.endPeriod)
      .input("totalDays", sql.Decimal(5, 1), input.totalDays)
      .input("reason", sql.NVarChar(1000), input.reason)
      .input("calculationMode", sql.NVarChar(30), input.calculationMode ?? null)
      .input("calendarId", sql.UniqueIdentifier, input.calendarId ?? null)
      .input("calendarTimezone", sql.NVarChar(80), input.calendarTimezone ?? null)
      .input("calculationVersion", sql.Int, input.calculationVersion ?? null)
      .input("calendarVersion", sql.Int, input.calendarVersion ?? null)
      .input("calculationInputHash", sql.NVarChar(64), input.calculationInputHash ?? null)
      .input("reservationVersion", sql.Int, input.reservationVersion ?? null)
      .input("yearAllocationsJson", sql.NVarChar(sql.MAX), input.yearAllocationsJson ?? null)
      .query(`
        UPDATE absence_requests
        SET
          absence_type_id = @absenceTypeId,
          start_date = @startDate,
          end_date = @endDate,
          start_period = @startPeriod,
          end_period = @endPeriod,
          total_days = @totalDays,
          reason = @reason,
          calculation_mode = @calculationMode,
          calendar_id = @calendarId,
          calendar_timezone = @calendarTimezone,
          calculation_version = @calculationVersion,
          calendar_version = @calendarVersion,
          calculation_input_hash = @calculationInputHash,
          reservation_version = COALESCE(@reservationVersion, reservation_version),
          year_allocations_json = COALESCE(@yearAllocationsJson, year_allocations_json),
          updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @id AND company_id = @companyId
        ${statusFilter}
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAbsenceRequestRow(result.recordset[0] as Record<string, unknown>);
  },

  async createEvent(
    companyId: string,
    input: {
      absenceRequestId: string;
      eventType: AbsenceRequestEvent["eventType"];
      oldStatus?: AbsenceRequestStatus | null;
      newStatus?: AbsenceRequestStatus | null;
      performedByUserId?: string | null;
      performedByEmployeeId?: string | null;
      comment?: string | null;
    },
    transaction?: sql.Transaction,
  ): Promise<AbsenceRequestEvent | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, input.absenceRequestId)
      .input("eventType", sql.NVarChar(40), input.eventType)
      .input("oldStatus", sql.NVarChar(30), input.oldStatus ?? null)
      .input("newStatus", sql.NVarChar(30), input.newStatus ?? null)
      .input("performedByUserId", sql.UniqueIdentifier, input.performedByUserId ?? null)
      .input("performedByEmployeeId", sql.UniqueIdentifier, input.performedByEmployeeId ?? null)
      .input("comment", sql.NVarChar(1000), input.comment ?? null)
      .query(`
        INSERT INTO absence_request_events (
          company_id, absence_request_id, event_type, old_status, new_status,
          performed_by_user_id, performed_by_employee_id, comment
        )
        OUTPUT INSERTED.*
        SELECT
          @companyId, @absenceRequestId, @eventType, @oldStatus, @newStatus,
          @performedByUserId, @performedByEmployeeId, @comment
        FROM absence_requests ar
        WHERE ar.id = @absenceRequestId
          AND ar.company_id = @companyId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapAbsenceRequestEventRow(result.recordset[0] as Record<string, unknown>);
  },

  async listEvents(companyId: string, absenceRequestId: string): Promise<AbsenceRequestEvent[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, absenceRequestId)
      .query(`
        SELECT
          are.*,
          COALESCE(u.name, e.name) AS performer_name
        FROM absence_request_events are
        LEFT JOIN users u ON u.id = are.performed_by_user_id
        LEFT JOIN employees e ON e.id = are.performed_by_employee_id AND e.company_id = @companyId
        WHERE are.absence_request_id = @absenceRequestId
          AND are.company_id = @companyId
        ORDER BY are.created_at ASC
      `);

    return result.recordset.map((row) =>
      mapAbsenceRequestEventRow(row as Record<string, unknown>),
    );
  },

  async findAffectedAssignments(
    companyId: string,
    employeeId: string,
    absenceStartAt: Date,
    absenceEndAt: Date,
  ): Promise<
    Array<{
      assignmentId: string;
      employeeId: string;
      operationId: string;
      serviceId: string;
      serviceName: string;
      scheduledStart: string;
      scheduledEnd: string | null;
      operationStatus: string;
      validFrom: string;
      validTo: string | null;
      cancelledAt: string | null;
      categoryId: string | null;
      categoryName: string | null;
    }>
  > {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("absenceStartAt", sql.DateTime2, absenceStartAt)
      .input("absenceEndAt", sql.DateTime2, absenceEndAt)
      .query(`
        SELECT
          ie.id AS assignment_id,
          ie.employee_id,
          ie.valid_from,
          ie.valid_until,
          ie.cancelled_at,
          e.category_id,
          ec.name AS category_name,
          i.id AS operation_id,
          i.service_id,
          s.name AS service_name,
          i.scheduled_start,
          i.scheduled_end,
          i.status AS operation_status
        FROM operation_assignments ie
        INNER JOIN scheduled_operations i ON i.id = ie.operation_id AND i.company_id = @companyId
        INNER JOIN operational_locations s ON s.id = i.service_id AND s.company_id = @companyId
        INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
        LEFT JOIN employee_categories ec ON ec.id = e.category_id AND ec.company_id = @companyId
        WHERE ie.employee_id = @employeeId
          AND ie.company_id = @companyId
          AND ie.cancelled_at IS NULL
          AND i.status NOT IN ('CANCELLED')
          AND i.scheduled_start IS NOT NULL
          AND DATEADD(
            MINUTE,
            -COALESCE(i.early_tolerance_minutes, 0),
            i.scheduled_start
          ) <= @absenceEndAt
          AND COALESCE(
            i.scheduled_end,
            DATEADD(MINUTE, COALESCE(i.late_tolerance_minutes, 0), i.scheduled_start)
          ) >= @absenceStartAt
          AND ie.valid_from <= CAST(@absenceEndAt AS DATE)
          AND (ie.valid_until IS NULL OR ie.valid_until >= CAST(@absenceStartAt AS DATE))
        ORDER BY i.scheduled_start ASC, ie.id ASC
      `);

    return result.recordset
      .filter((row) => row.scheduled_start != null)
      .map((row) => ({
        assignmentId: String(row.assignment_id),
        employeeId: String(row.employee_id),
        operationId: String(row.operation_id),
        serviceId: String(row.service_id),
        serviceName: String(row.service_name),
        scheduledStart: new Date(row.scheduled_start as Date | string).toISOString(),
        scheduledEnd: row.scheduled_end
          ? new Date(row.scheduled_end as Date | string).toISOString()
          : null,
        operationStatus: String(row.operation_status),
        validFrom: toDateOnlyString(row.valid_from as Date | string),
        validTo: row.valid_until
          ? toDateOnlyString(row.valid_until as Date | string)
          : null,
        cancelledAt: row.cancelled_at
          ? new Date(row.cancelled_at as Date | string).toISOString()
          : null,
        categoryId: row.category_id ? String(row.category_id) : null,
        categoryName: row.category_name ? String(row.category_name) : null,
      }));
  },

  /** @deprecated Prefer findAffectedAssignments — kept for list counts compatibility. */
  async findAffectedOperations(
    companyId: string,
    employeeId: string,
    absenceStartAt: Date,
    absenceEndAt: Date,
  ): Promise<
    Array<{
      operationId: string;
      serviceId: string;
      serviceName: string;
      scheduledStart: string;
      scheduledEnd: string | null;
      status: string;
    }>
  > {
    const assignments = await this.findAffectedAssignments(
      companyId,
      employeeId,
      absenceStartAt,
      absenceEndAt,
    );
    const seen = new Set<string>();
    const operations: Array<{
      operationId: string;
      serviceId: string;
      serviceName: string;
      scheduledStart: string;
      scheduledEnd: string | null;
      status: string;
    }> = [];
    for (const assignment of assignments) {
      if (seen.has(assignment.operationId)) {
        continue;
      }
      seen.add(assignment.operationId);
      operations.push({
        operationId: assignment.operationId,
        serviceId: assignment.serviceId,
        serviceName: assignment.serviceName,
        scheduledStart: assignment.scheduledStart,
        scheduledEnd: assignment.scheduledEnd,
        status: assignment.operationStatus,
      });
    }
    return operations;
  },

  async listApprovedByEmployeeAndDateRange(
    companyId: string,
    employeeId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<ApprovedAbsenceForWorkday[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("dateFrom", sql.Date, dateFrom)
      .input("dateTo", sql.Date, dateTo)
      .query(`
        SELECT ar.*, at.name AS absence_type_name
        FROM absence_requests ar
        INNER JOIN absence_types at
          ON at.id = ar.absence_type_id
         AND at.company_id = ar.company_id
        WHERE ar.company_id = @companyId
          AND ar.employee_id = @employeeId
          AND ar.status = N'APPROVED'
          AND ar.start_date <= @dateTo
          AND ar.end_date >= @dateFrom
        ORDER BY ar.reviewed_at ASC, ar.created_at ASC, ar.id ASC
      `);

    return result.recordset.map((row) => mapApprovedAbsenceRow(row as Record<string, unknown>));
  },

  async listApprovedByEmployeesAndDateRange(
    companyId: string,
    employeeIds: string[],
    dateFrom: string,
    dateTo: string,
  ): Promise<ApprovedAbsenceForWorkday[]> {
    if (employeeIds.length === 0) {
      return [];
    }

    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("dateFrom", sql.Date, dateFrom)
      .input("dateTo", sql.Date, dateTo);

    const placeholders = employeeIds.map((employeeId, index) => {
      const param = `employeeId${index}`;
      request.input(param, sql.UniqueIdentifier, employeeId);
      return `@${param}`;
    });

    const result = await request.query(`
      SELECT ar.*, at.name AS absence_type_name
      FROM absence_requests ar
      INNER JOIN absence_types at
        ON at.id = ar.absence_type_id
       AND at.company_id = ar.company_id
      WHERE ar.company_id = @companyId
        AND ar.employee_id IN (${placeholders.join(", ")})
        AND ar.status = N'APPROVED'
        AND ar.start_date <= @dateTo
        AND ar.end_date >= @dateFrom
      ORDER BY ar.reviewed_at ASC, ar.created_at ASC, ar.id ASC
    `);

    return result.recordset.map((row) => mapApprovedAbsenceRow(row as Record<string, unknown>));
  },
};
