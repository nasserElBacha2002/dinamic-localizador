// Phase 2.3/2.7: Operation remains the technical API model; physical table is scheduled_operations.
// Conceptually this represents a ScheduledOperation — see types/operational-domain.ts.
import sql from "mssql";
import { getPool } from "../database/connection";
import type { Operation, OperationDetail, OperationWithService } from "../types/domain";
import type { CompatibleOperation } from "../types/twilio.types";
import {
  mapOperationDetail,
  mapOperationRow,
  mapOperationWithServiceRow,
  mapEmployeeRow,
  mapServiceRow,
} from "../utils/row-mappers";
import { operationWorkdayRepository } from "./operation-workday.repository";
import { companySettingsRepository } from "./company-settings.repository";
import { getDateIsoInTimezone } from "../utils/absence-date";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import { applySqlFilters, buildWhereClause, type SqlFilter } from "../utils/sql-list-query";
import { resolveSqlSort } from "../utils/sql-sort";
import type {
  CreateOneTimeOperationInput,
  ListOperationsQuery,
  UpdateOperationInput,
} from "../schemas/operation.schema";

const OPERATION_LIST_SORT_FIELDS: Record<string, string> = {
  serviceName: "s.name",
  serviceAddress: "s.address",
  scheduledStart: "i.scheduled_start",
  scheduledEnd: "i.scheduled_end",
  status: "i.status",
  earlyToleranceMinutes: "i.early_tolerance_minutes",
  lateToleranceMinutes: "i.late_tolerance_minutes",
};

export const operationRepository = {
  async create(companyId: string, input: CreateOneTimeOperationInput): Promise<Operation> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, input.serviceId)
      .input("scheduledStart", sql.DateTime2, new Date(input.scheduledStart))
      .input("scheduledEnd", sql.DateTime2, input.scheduledEnd ? new Date(input.scheduledEnd) : null)
      .input("earlyToleranceMinutes", sql.Int, input.earlyToleranceMinutes)
      .input("lateToleranceMinutes", sql.Int, input.lateToleranceMinutes)
      .input("notes", sql.NVarChar(1000), input.notes ?? null)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, notes
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @serviceId, N'ONE_TIME', @scheduledStart, @scheduledEnd,
          @earlyToleranceMinutes, @lateToleranceMinutes, @notes
        )
      `);

    return mapOperationRow(result.recordset[0] as Record<string, unknown>);
  },

  async createRecurring(
    companyId: string,
    input: {
      serviceId: string;
      earlyToleranceMinutes: number;
      lateToleranceMinutes: number;
      notes: string | null;
    },
    transaction?: sql.Transaction,
  ): Promise<Operation> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, input.serviceId)
      .input("earlyToleranceMinutes", sql.Int, input.earlyToleranceMinutes)
      .input("lateToleranceMinutes", sql.Int, input.lateToleranceMinutes)
      .input("notes", sql.NVarChar(1000), input.notes ?? null)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, notes
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @serviceId, N'RECURRING', NULL, NULL,
          @earlyToleranceMinutes, @lateToleranceMinutes, @notes
        )
      `);

    return mapOperationRow(result.recordset[0] as Record<string, unknown>);
  },

  async createInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: CreateOneTimeOperationInput,
  ): Promise<Operation> {
    const request = new sql.Request(transaction);
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, input.serviceId)
      .input("scheduledStart", sql.DateTime2, new Date(input.scheduledStart))
      .input("scheduledEnd", sql.DateTime2, input.scheduledEnd ? new Date(input.scheduledEnd) : null)
      .input("earlyToleranceMinutes", sql.Int, input.earlyToleranceMinutes)
      .input("lateToleranceMinutes", sql.Int, input.lateToleranceMinutes)
      .input("notes", sql.NVarChar(1000), input.notes ?? null)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, notes
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @serviceId, N'ONE_TIME', @scheduledStart, @scheduledEnd,
          @earlyToleranceMinutes, @lateToleranceMinutes, @notes
        )
      `);

    return mapOperationRow(result.recordset[0] as Record<string, unknown>);
  },

  async existsActiveForServiceAtStart(
    companyId: string,
    serviceId: string,
    scheduledStart: string,
  ): Promise<boolean> {
    const existing = await this.findExistingActiveKeys(companyId, [{ serviceId, scheduledStart }]);
    return existing.size > 0;
  },

  async findExistingActiveKeys(
    companyId: string,
    pairs: Array<{ serviceId: string; scheduledStart: string }>,
  ): Promise<Set<string>> {
    if (pairs.length === 0) {
      return new Set();
    }

    const pool = getPool();
    const existing = new Set<string>();
    const chunkSize = 100;

    for (let offset = 0; offset < pairs.length; offset += chunkSize) {
      const chunk = pairs.slice(offset, offset + chunkSize);
      const request = pool.request().input("companyId", sql.UniqueIdentifier, companyId);
      const valueClauses: string[] = [];

      chunk.forEach((pair, index) => {
        request.input(`serviceId${index}`, sql.UniqueIdentifier, pair.serviceId);
        request.input(`scheduledStart${index}`, sql.DateTime2, new Date(pair.scheduledStart));
        valueClauses.push(`(@serviceId${index}, @scheduledStart${index})`);
      });

      const result = await request.query(`
        SELECT i.service_id, i.scheduled_start
        FROM scheduled_operations i
        INNER JOIN (VALUES ${valueClauses.join(", ")}) AS p(service_id, scheduled_start)
          ON i.service_id = p.service_id
         AND i.scheduled_start = p.scheduled_start
        WHERE i.status <> 'CANCELLED'
          AND i.company_id = @companyId
      `);

      for (const row of result.recordset) {
        const serviceId = String(row.service_id);
        const scheduledStart = new Date(row.scheduled_start as Date | string).toISOString();
        existing.add(`${serviceId}|${scheduledStart}`);
      }
    }

    return existing;
  },

  async createManyInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    inputs: CreateOneTimeOperationInput[],
  ): Promise<Operation[]> {
    if (inputs.length === 0) {
      return [];
    }

    const created: Operation[] = [];
    const chunkSize = 100;

    for (let offset = 0; offset < inputs.length; offset += chunkSize) {
      const chunk = inputs.slice(offset, offset + chunkSize);
      const request = new sql.Request(transaction).input("companyId", sql.UniqueIdentifier, companyId);
      const valueRows: string[] = [];

      chunk.forEach((input, index) => {
        request.input(`serviceId${index}`, sql.UniqueIdentifier, input.serviceId);
        request.input(`scheduledStart${index}`, sql.DateTime2, new Date(input.scheduledStart));
        request.input(
          `scheduledEnd${index}`,
          sql.DateTime2,
          input.scheduledEnd ? new Date(input.scheduledEnd) : null,
        );
        request.input(`earlyToleranceMinutes${index}`, sql.Int, input.earlyToleranceMinutes);
        request.input(`lateToleranceMinutes${index}`, sql.Int, input.lateToleranceMinutes);
        request.input(`notes${index}`, sql.NVarChar(1000), input.notes ?? null);
        valueRows.push(
          `(@companyId, @serviceId${index}, N'ONE_TIME', @scheduledStart${index}, @scheduledEnd${index}, @earlyToleranceMinutes${index}, @lateToleranceMinutes${index}, @notes${index})`,
        );
      });

      const result = await request.query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, notes
        )
        OUTPUT INSERTED.*
        VALUES ${valueRows.join(", ")}
      `);

      created.push(
        ...result.recordset.map((row) => mapOperationRow(row as Record<string, unknown>)),
      );
    }

    return created;
  },

  async findById(companyId: string, id: string): Promise<Operation | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query("SELECT * FROM scheduled_operations WHERE id = @id AND company_id = @companyId");

    if (!result.recordset[0]) {
      return null;
    }

    return mapOperationRow(result.recordset[0] as Record<string, unknown>);
  },

  async findDetailById(
    companyId: string,
    id: string,
    assignmentReferenceDate?: string | null,
  ): Promise<OperationDetail | null> {
    const operation = await this.findById(companyId, id);
    if (!operation) {
      return null;
    }

    const pool = getPool();

    const serviceResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, operation.serviceId)
      .query("SELECT * FROM operational_locations WHERE id = @serviceId AND company_id = @companyId");

    if (!serviceResult.recordset[0]) {
      return null;
    }

    const operationWorkdays = await operationWorkdayRepository.listByOperationId(companyId, id);
    let workDate = assignmentReferenceDate ?? operationWorkdays[0]?.workDate ?? null;

    if (!workDate && operation.operationKind === "ONE_TIME" && operation.scheduledStart) {
      const settings = await companySettingsRepository.findByCompanyId(companyId);
      const timezone = resolveOperationTimezone(settings?.operationTimezone);
      workDate = getDateIsoInTimezone(new Date(operation.scheduledStart), timezone);
    }

    const employeesResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, id)
      .input("workDate", sql.Date, workDate ?? null)
      .query(`
      SELECT DISTINCT e.*
      FROM operation_assignments ie
      INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
      WHERE ie.operation_id = @operationId
        AND ie.company_id = @companyId
        AND e.company_id = @companyId
        AND (
          @workDate IS NULL
          OR (
            ie.cancelled_at IS NULL
            AND @workDate >= ie.valid_from
            AND (ie.valid_until IS NULL OR @workDate <= ie.valid_until)
          )
        )
      ORDER BY e.name ASC
    `);

    const attendanceCountResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, id)
      .query(`
        SELECT COUNT(*) AS total
        FROM attendance_records
        WHERE operation_id = @operationId
          AND company_id = @companyId
      `);

    return mapOperationDetail(
      operation,
      mapServiceRow(serviceResult.recordset[0] as Record<string, unknown>),
      employeesResult.recordset.map((row) => mapEmployeeRow(row as Record<string, unknown>)),
      Number(attendanceCountResult.recordset[0].total),
    );
  },

  async list(
    companyId: string,
    query: ListOperationsQuery,
  ): Promise<{ items: OperationWithService[]; total: number }> {
    const pool = getPool();
    const filters: SqlFilter[] = [
      {
        clause: "i.company_id = @companyId",
        apply: (request) => request.input("companyId", sql.UniqueIdentifier, companyId),
      },
    ];

    if (query.status) {
      filters.push({
        clause: "i.status = @status",
        apply: (request) => request.input("status", sql.NVarChar(30), query.status),
      });
    }

    if (query.serviceId) {
      filters.push({
        clause: "i.service_id = @serviceId",
        apply: (request) => request.input("serviceId", sql.UniqueIdentifier, query.serviceId),
      });
    }

    if (query.search) {
      filters.push({
        clause: "(s.name LIKE @search OR s.address LIKE @search)",
        apply: (request) => request.input("search", sql.NVarChar(150), `%${query.search}%`),
      });
    }

    if (query.operationKind) {
      filters.push({
        clause: "i.operation_kind = @operationKind",
        apply: (request) => request.input("operationKind", sql.NVarChar(20), query.operationKind),
      });
    }

    const needsScheduleJoin = Boolean(query.dateFrom || query.dateTo);

    if (query.dateFrom && query.dateTo) {
      const dateFrom = query.dateFrom.slice(0, 10);
      const dateTo = query.dateTo.slice(0, 10);
      filters.push({
        clause: `(
          (i.operation_kind = N'ONE_TIME' AND i.scheduled_start >= @dateFromTs AND i.scheduled_start <= @dateToTs)
          OR (
            i.operation_kind = N'RECURRING'
            AND os.valid_from <= @dateToLocal
            AND (os.valid_until IS NULL OR os.valid_until >= @dateFromLocal)
          )
        )`,
        apply: (request) =>
          request
            .input("dateFromTs", sql.DateTime2, new Date(query.dateFrom!))
            .input("dateToTs", sql.DateTime2, new Date(query.dateTo!))
            .input("dateFromLocal", sql.Date, dateFrom)
            .input("dateToLocal", sql.Date, dateTo),
      });
    } else if (query.dateFrom) {
      const dateFrom = query.dateFrom.slice(0, 10);
      filters.push({
        clause: `(
          (i.operation_kind = N'ONE_TIME' AND i.scheduled_start >= @dateFromTs)
          OR (
            i.operation_kind = N'RECURRING'
            AND (os.valid_until IS NULL OR os.valid_until >= @dateFromLocal)
          )
        )`,
        apply: (request) =>
          request
            .input("dateFromTs", sql.DateTime2, new Date(query.dateFrom!))
            .input("dateFromLocal", sql.Date, dateFrom),
      });
    } else if (query.dateTo) {
      const dateTo = query.dateTo.slice(0, 10);
      filters.push({
        clause: `(
          (i.operation_kind = N'ONE_TIME' AND i.scheduled_start <= @dateToTs)
          OR (i.operation_kind = N'RECURRING' AND os.valid_from <= @dateToLocal)
        )`,
        apply: (request) =>
          request
            .input("dateToTs", sql.DateTime2, new Date(query.dateTo!))
            .input("dateToLocal", sql.Date, dateTo),
      });
    }

    const scheduleJoin = needsScheduleJoin
      ? "LEFT JOIN operation_schedules os ON os.operation_id = i.id AND os.company_id = i.company_id"
      : "LEFT JOIN operation_schedules os ON os.operation_id = i.id AND os.company_id = i.company_id";

    const whereClause = buildWhereClause(filters);

    const countRequest = pool.request();
    applySqlFilters(countRequest, filters);
    const countResult = await countRequest.query(`
      SELECT COUNT(*) AS total
      FROM scheduled_operations i
      INNER JOIN operational_locations s ON s.id = i.service_id AND s.company_id = i.company_id
      ${scheduleJoin}
      ${whereClause}
    `);
    const total = Number(countResult.recordset[0].total);

    const dataRequest = pool.request();
    applySqlFilters(dataRequest, filters);
    dataRequest.input("offset", sql.Int, (query.page - 1) * query.limit);
    dataRequest.input("limit", sql.Int, query.limit);

    const orderBy = resolveSqlSort(
      query.sortBy,
      OPERATION_LIST_SORT_FIELDS,
      "COALESCE(i.scheduled_start, CAST(os.valid_from AS DATETIME2))",
      query.sortDirection ?? "asc",
    );

    const dataResult = await dataRequest.query(`
      SELECT
        i.*,
        s.name AS service_name,
        s.address AS service_address,
        s.active AS service_active,
        os.schedule_source,
        os.valid_from AS schedule_valid_from,
        os.valid_until AS schedule_valid_until,
        os.version AS schedule_version
      FROM scheduled_operations i
      INNER JOIN operational_locations s ON s.id = i.service_id AND s.company_id = i.company_id
      ${scheduleJoin}
      ${whereClause}
      ORDER BY ${orderBy}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return {
      items: dataResult.recordset.map((row) =>
        mapOperationWithServiceRow(row as Record<string, unknown>),
      ),
      total,
    };
  },

  async update(
    companyId: string,
    id: string,
    input: UpdateOperationInput,
    transaction?: sql.Transaction,
  ): Promise<Operation | null> {
    const request = transaction
      ? new sql.Request(transaction)
      : getPool().request();

    const fields: string[] = [];
    request.input("companyId", sql.UniqueIdentifier, companyId);
    request.input("id", sql.UniqueIdentifier, id);

    if (input.serviceId !== undefined) {
      request.input("serviceId", sql.UniqueIdentifier, input.serviceId);
      fields.push("service_id = @serviceId");
    }

    if (input.scheduledStart !== undefined) {
      request.input("scheduledStart", sql.DateTime2, new Date(input.scheduledStart));
      fields.push("scheduled_start = @scheduledStart");
    }

    if (input.scheduledEnd !== undefined) {
      request.input("scheduledEnd", sql.DateTime2, input.scheduledEnd ? new Date(input.scheduledEnd) : null);
      fields.push("scheduled_end = @scheduledEnd");
    }

    if (input.earlyToleranceMinutes !== undefined) {
      request.input("earlyToleranceMinutes", sql.Int, input.earlyToleranceMinutes);
      fields.push("early_tolerance_minutes = @earlyToleranceMinutes");
    }

    if (input.lateToleranceMinutes !== undefined) {
      request.input("lateToleranceMinutes", sql.Int, input.lateToleranceMinutes);
      fields.push("late_tolerance_minutes = @lateToleranceMinutes");
    }

    if (input.notes !== undefined) {
      request.input("notes", sql.NVarChar(1000), input.notes);
      fields.push("notes = @notes");
    }

    if (input.status !== undefined) {
      request.input("status", sql.NVarChar(30), input.status);
      fields.push("status = @status");
    }

    if (fields.length === 0) {
      return this.findById(companyId, id);
    }

    fields.push("updated_at = SYSUTCDATETIME()");

    const result = await request.query(`
      UPDATE scheduled_operations
      SET ${fields.join(", ")}
      OUTPUT INSERTED.*
      WHERE id = @id AND company_id = @companyId
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapOperationRow(result.recordset[0] as Record<string, unknown>);
  },

  async cancel(companyId: string, id: string): Promise<Operation | null> {
    return this.update(companyId, id, { status: "CANCELLED" });
  },

  async findCompatibleForEmployee(
    companyId: string,
    employeeId: string,
    at: Date,
  ): Promise<CompatibleOperation[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("at", sql.DateTime2, at)
      .query(`
        SELECT
          i.id,
          i.service_id,
          i.scheduled_start,
          i.scheduled_end,
          i.early_tolerance_minutes,
          i.late_tolerance_minutes,
          i.status,
          s.name AS service_name,
          s.address AS service_address,
          s.locality AS service_locality,
          s.latitude AS service_latitude,
          s.longitude AS service_longitude,
          s.allowed_radius_meters
        FROM scheduled_operations i
        INNER JOIN operation_assignments ie
          ON ie.operation_id = i.id AND ie.employee_id = @employeeId AND ie.company_id = @companyId
         AND ie.cancelled_at IS NULL
        INNER JOIN operation_workdays ow
          ON ow.operation_id = i.id AND ow.company_id = i.company_id
         AND @at >= DATEADD(MINUTE, -i.early_tolerance_minutes, ow.expected_start_at)
         AND @at <= DATEADD(MINUTE, i.late_tolerance_minutes, ow.expected_start_at)
         AND ow.work_date >= ie.valid_from
         AND (ie.valid_until IS NULL OR ow.work_date <= ie.valid_until)
        INNER JOIN operational_locations s ON s.id = i.service_id AND s.company_id = @companyId
        WHERE i.company_id = @companyId
          AND i.operation_kind = N'ONE_TIME'
          AND i.status NOT IN ('COMPLETED', 'CANCELLED')
          AND s.active = 1
          AND @at >= DATEADD(MINUTE, -i.early_tolerance_minutes, i.scheduled_start)
          AND @at <= DATEADD(MINUTE, i.late_tolerance_minutes, i.scheduled_start)
        ORDER BY i.scheduled_start ASC
      `);

    return result.recordset.map((row) => ({
      id: String(row.id),
      serviceId: String(row.service_id),
      serviceName: String(row.service_name),
      serviceAddress: row.service_address ? String(row.service_address) : null,
      serviceLocality: row.service_locality ? String(row.service_locality) : null,
      serviceLatitude: Number(row.service_latitude),
      serviceLongitude: Number(row.service_longitude),
      allowedRadiusMeters: Number(row.allowed_radius_meters),
      scheduledStart: new Date(row.scheduled_start as Date | string).toISOString(),
      scheduledEnd: row.scheduled_end
        ? new Date(row.scheduled_end as Date | string).toISOString()
        : null,
      earlyToleranceMinutes: Number(row.early_tolerance_minutes),
      lateToleranceMinutes: Number(row.late_tolerance_minutes),
      status: String(row.status),
    }));
  },
};
