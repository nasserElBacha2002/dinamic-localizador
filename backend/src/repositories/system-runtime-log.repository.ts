import sql from "mssql";
import { getPool } from "../database/connection";
import type { SystemLogLevel } from "../constants/system-logs";
import type { SystemLogMetadata, SystemLogRecord, SystemRuntimeLogRow } from "../types/system-logs";

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapRow = (row: Record<string, unknown>): SystemRuntimeLogRow => {
  let metadata: SystemLogMetadata | null = null;
  if (row.metadata_json) {
    try {
      metadata = JSON.parse(String(row.metadata_json)) as SystemLogMetadata;
    } catch {
      metadata = { __parseError: true };
    }
  }
  return {
    id: String(row.id),
    schemaVersion: Number(row.schema_version),
    occurredAt: toIso(row.occurred_at as Date | string),
    level: String(row.level) as SystemLogLevel,
    service: String(row.service),
    serviceInstanceId: row.service_instance_id ? String(row.service_instance_id) : null,
    environment: String(row.environment),
    module: String(row.module),
    event: String(row.event),
    message: String(row.message),
    errorCode: row.error_code ? String(row.error_code) : null,
    requestId: row.request_id ? String(row.request_id) : null,
    correlationId: row.correlation_id ? String(row.correlation_id) : null,
    companyId: row.company_id ? String(row.company_id) : null,
    operationId: row.operation_id ? String(row.operation_id) : null,
    employeeId: row.employee_id ? String(row.employee_id) : null,
    conversationId: row.conversation_id ? String(row.conversation_id) : null,
    jobExecutionId: row.job_execution_id ? String(row.job_execution_id) : null,
    metadata,
    errorName: row.error_name ? String(row.error_name) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    errorStack: row.error_stack ? String(row.error_stack) : null,
    createdAt: toIso(row.created_at as Date | string),
  };
};

export type SystemLogListFilters = {
  from: Date;
  to: Date;
  level?: SystemLogLevel | null;
  module?: string | null;
  event?: string | null;
  companyId?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  operationId?: string | null;
  employeeId?: string | null;
  conversationId?: string | null;
  jobExecutionId?: string | null;
  /** Exact substring match on message (parametrized LIKE). */
  q?: string | null;
  page: number;
  limit: number;
};

let tableMissingLogged = false;

export const systemRuntimeLogRepository = {
  async insert(record: SystemLogRecord): Promise<void> {
    try {
      await getPool()
        .request()
        .input("schemaVersion", sql.Int, record.schemaVersion)
        .input("occurredAt", sql.DateTime2, new Date(record.timestamp))
        .input("level", sql.NVarChar(10), record.level)
        .input("service", sql.NVarChar(80), record.service)
        .input("serviceInstanceId", sql.NVarChar(80), record.serviceInstanceId)
        .input("environment", sql.NVarChar(40), record.environment)
        .input("module", sql.NVarChar(80), record.module)
        .input("event", sql.NVarChar(120), record.event)
        .input("message", sql.NVarChar(1000), record.message)
        .input("errorCode", sql.NVarChar(80), record.errorCode)
        .input("requestId", sql.NVarChar(64), record.requestId)
        .input("correlationId", sql.NVarChar(64), record.correlationId)
        .input("companyId", sql.UniqueIdentifier, record.companyId)
        .input("operationId", sql.UniqueIdentifier, record.operationId)
        .input("employeeId", sql.UniqueIdentifier, record.employeeId)
        .input("conversationId", sql.UniqueIdentifier, record.conversationId)
        .input("jobExecutionId", sql.NVarChar(64), record.jobExecutionId)
        .input(
          "metadataJson",
          sql.NVarChar(sql.MAX),
          record.metadata ? JSON.stringify(record.metadata) : null,
        )
        .input("errorName", sql.NVarChar(200), record.error?.name ?? null)
        .input("errorMessage", sql.NVarChar(1000), record.error?.message ?? null)
        .input("errorStack", sql.NVarChar(sql.MAX), record.error?.stack ?? null)
        .query(`
          INSERT INTO system_runtime_logs (
            schema_version, occurred_at, level, service, service_instance_id, environment,
            module, event, message, error_code, request_id, correlation_id,
            company_id, operation_id, employee_id, conversation_id, job_execution_id,
            metadata_json, error_name, error_message, error_stack
          )
          VALUES (
            @schemaVersion, @occurredAt, @level, @service, @serviceInstanceId, @environment,
            @module, @event, @message, @errorCode, @requestId, @correlationId,
            @companyId, @operationId, @employeeId, @conversationId, @jobExecutionId,
            @metadataJson, @errorName, @errorMessage, @errorStack
          )
        `);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/Invalid object name.*system_runtime_logs/i.test(message)) {
        if (!tableMissingLogged) {
          tableMissingLogged = true;
          process.stderr.write(
            `${JSON.stringify({
              level: "warn",
              event: "system-logs.table.missing",
              message: "system_runtime_logs table not available; sink degraded",
            })}\n`,
          );
        }
        return;
      }
      throw error;
    }
  },

  async findById(id: string): Promise<SystemRuntimeLogRow | null> {
    const result = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query(`SELECT TOP 1 * FROM system_runtime_logs WHERE id = @id`);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async list(filters: SystemLogListFilters): Promise<{ data: SystemRuntimeLogRow[]; total: number }> {
    const offset = (filters.page - 1) * filters.limit;
    const request = getPool()
      .request()
      .input("from", sql.DateTime2, filters.from)
      .input("to", sql.DateTime2, filters.to)
      .input("offset", sql.Int, offset)
      .input("limit", sql.Int, filters.limit);

    const where: string[] = ["occurred_at >= @from", "occurred_at <= @to"];

    if (filters.level) {
      request.input("level", sql.NVarChar(10), filters.level);
      where.push("level = @level");
    }
    if (filters.module) {
      request.input("module", sql.NVarChar(80), filters.module);
      where.push("module = @module");
    }
    if (filters.event) {
      request.input("event", sql.NVarChar(120), filters.event);
      where.push("event = @event");
    }
    if (filters.companyId) {
      request.input("companyId", sql.UniqueIdentifier, filters.companyId);
      where.push("company_id = @companyId");
    }
    if (filters.requestId) {
      request.input("requestId", sql.NVarChar(64), filters.requestId);
      where.push("request_id = @requestId");
    }
    if (filters.correlationId) {
      request.input("correlationId", sql.NVarChar(64), filters.correlationId);
      where.push("correlation_id = @correlationId");
    }
    if (filters.operationId) {
      request.input("operationId", sql.UniqueIdentifier, filters.operationId);
      where.push("operation_id = @operationId");
    }
    if (filters.employeeId) {
      request.input("employeeId", sql.UniqueIdentifier, filters.employeeId);
      where.push("employee_id = @employeeId");
    }
    if (filters.conversationId) {
      request.input("conversationId", sql.UniqueIdentifier, filters.conversationId);
      where.push("conversation_id = @conversationId");
    }
    if (filters.jobExecutionId) {
      request.input("jobExecutionId", sql.NVarChar(64), filters.jobExecutionId);
      where.push("job_execution_id = @jobExecutionId");
    }
    if (filters.q) {
      request.input("q", sql.NVarChar(200), `%${filters.q.replace(/[%_[\]]/g, "")}%`);
      where.push("(message LIKE @q OR event LIKE @q OR module LIKE @q)");
    }

    const whereSql = where.join(" AND ");
    const countResult = await request.query(`
      SELECT COUNT(1) AS total
      FROM system_runtime_logs
      WHERE ${whereSql}
    `);
    const total = Number(countResult.recordset[0]?.total ?? 0);

    const listRequest = getPool()
      .request()
      .input("from", sql.DateTime2, filters.from)
      .input("to", sql.DateTime2, filters.to)
      .input("offset", sql.Int, offset)
      .input("limit", sql.Int, filters.limit);
    // Re-bind same filters for second request
    if (filters.level) listRequest.input("level", sql.NVarChar(10), filters.level);
    if (filters.module) listRequest.input("module", sql.NVarChar(80), filters.module);
    if (filters.event) listRequest.input("event", sql.NVarChar(120), filters.event);
    if (filters.companyId) listRequest.input("companyId", sql.UniqueIdentifier, filters.companyId);
    if (filters.requestId) listRequest.input("requestId", sql.NVarChar(64), filters.requestId);
    if (filters.correlationId)
      listRequest.input("correlationId", sql.NVarChar(64), filters.correlationId);
    if (filters.operationId)
      listRequest.input("operationId", sql.UniqueIdentifier, filters.operationId);
    if (filters.employeeId) listRequest.input("employeeId", sql.UniqueIdentifier, filters.employeeId);
    if (filters.conversationId)
      listRequest.input("conversationId", sql.UniqueIdentifier, filters.conversationId);
    if (filters.jobExecutionId)
      listRequest.input("jobExecutionId", sql.NVarChar(64), filters.jobExecutionId);
    if (filters.q)
      listRequest.input("q", sql.NVarChar(200), `%${filters.q.replace(/[%_[\]]/g, "")}%`);

    const listResult = await listRequest.query(`
      SELECT *
      FROM system_runtime_logs
      WHERE ${whereSql}
      ORDER BY occurred_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return {
      data: (listResult.recordset as Record<string, unknown>[]).map(mapRow),
      total,
    };
  },

  async listContext(input: {
    requestId?: string | null;
    correlationId?: string | null;
    jobExecutionId?: string | null;
    around: Date;
    windowMinutes: number;
    limit: number;
  }): Promise<SystemRuntimeLogRow[]> {
    const from = new Date(input.around.getTime() - input.windowMinutes * 60_000);
    const to = new Date(input.around.getTime() + input.windowMinutes * 60_000);
    const request = getPool()
      .request()
      .input("from", sql.DateTime2, from)
      .input("to", sql.DateTime2, to)
      .input("limit", sql.Int, input.limit);

    let keyClause = "1 = 0";
    if (input.requestId) {
      request.input("requestId", sql.NVarChar(64), input.requestId);
      keyClause = "request_id = @requestId";
    } else if (input.correlationId) {
      request.input("correlationId", sql.NVarChar(64), input.correlationId);
      keyClause = "correlation_id = @correlationId";
    } else if (input.jobExecutionId) {
      request.input("jobExecutionId", sql.NVarChar(64), input.jobExecutionId);
      keyClause = "job_execution_id = @jobExecutionId";
    }

    const result = await request.query(`
      SELECT TOP (@limit) *
      FROM system_runtime_logs
      WHERE occurred_at >= @from
        AND occurred_at <= @to
        AND (${keyClause})
      ORDER BY occurred_at ASC
    `);
    return (result.recordset as Record<string, unknown>[]).map(mapRow);
  },

  async deleteOlderThan(cutoff: Date, batchSize: number): Promise<number> {
    const result = await getPool()
      .request()
      .input("cutoff", sql.DateTime2, cutoff)
      .input("batchSize", sql.Int, batchSize)
      .query(`
        ;WITH doomed AS (
          SELECT TOP (@batchSize) id
          FROM system_runtime_logs
          WHERE occurred_at < @cutoff
          ORDER BY occurred_at ASC
        )
        DELETE FROM doomed
        OUTPUT DELETED.id;
      `);
    return result.recordset?.length ?? 0;
  },
};
