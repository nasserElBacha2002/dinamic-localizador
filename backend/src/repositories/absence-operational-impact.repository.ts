import sql from "mssql";
import { getPool } from "../database/connection";
import { isDuplicateKeyError } from "../utils/sql-server-errors";
import type {
  AbsenceOperationalConflictDto,
  AbsenceOperationalConflictSeverity,
  AbsenceOperationalConflictType,
  AbsenceOperationalEffectStatus,
  AbsenceOperationalEffectType,
  AbsenceOperationalResolutionCode,
} from "../types/absence-operational-impact";

const toIso = (value: Date | string | null | undefined): string | null => {
  if (value == null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const mapConflict = (row: Record<string, unknown>): AbsenceOperationalConflictDto => ({
  id: String(row.id),
  absenceRequestId: String(row.absence_request_id),
  conflictType: String(row.conflict_type) as AbsenceOperationalConflictType,
  severity: String(row.severity) as AbsenceOperationalConflictSeverity,
  status: String(row.status) as AbsenceOperationalConflictDto["status"],
  operationId: row.operation_id ? String(row.operation_id) : null,
  serviceId: row.service_id ? String(row.service_id) : null,
  employeeId: String(row.employee_id),
  assignmentId: row.assignment_id ? String(row.assignment_id) : null,
  employeeWorkdayId: row.employee_workday_id ? String(row.employee_workday_id) : null,
  replacementEmployeeId: row.replacement_employee_id
    ? String(row.replacement_employee_id)
    : null,
  resolutionCode: row.resolution_code
    ? (String(row.resolution_code) as AbsenceOperationalResolutionCode)
    : null,
  resolutionReason: row.resolution_reason ? String(row.resolution_reason) : null,
  resolvedAt: toIso(row.resolved_at as Date | string | null),
  createdAt: toIso(row.created_at as Date | string)!,
  updatedAt: toIso(row.updated_at as Date | string)!,
});

export const absenceOperationalImpactRepository = {
  async listConflictsByRequest(
    companyId: string,
    absenceRequestId: string,
  ): Promise<AbsenceOperationalConflictDto[]> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, absenceRequestId)
      .query(`
        SELECT *
        FROM absence_operational_conflicts
        WHERE company_id = @companyId
          AND absence_request_id = @absenceRequestId
        ORDER BY created_at ASC
      `);
    return result.recordset.map((row) => mapConflict(row as Record<string, unknown>));
  },

  async findConflictById(
    companyId: string,
    absenceRequestId: string,
    conflictId: string,
  ): Promise<AbsenceOperationalConflictDto | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, absenceRequestId)
      .input("id", sql.UniqueIdentifier, conflictId)
      .query(`
        SELECT TOP 1 *
        FROM absence_operational_conflicts
        WHERE id = @id
          AND company_id = @companyId
          AND absence_request_id = @absenceRequestId
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapConflict(result.recordset[0] as Record<string, unknown>);
  },

  async upsertConflict(input: {
    companyId: string;
    absenceRequestId: string;
    absenceVersion: number;
    conflictType: AbsenceOperationalConflictType;
    severity: AbsenceOperationalConflictSeverity;
    employeeId: string;
    operationId?: string | null;
    serviceId?: string | null;
    assignmentId?: string | null;
    employeeWorkdayId?: string | null;
    idempotencyKey: string;
    rangeStartAt?: Date | null;
    rangeEndAt?: Date | null;
  }): Promise<AbsenceOperationalConflictDto> {
    try {
      const result = await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("absenceRequestId", sql.UniqueIdentifier, input.absenceRequestId)
        .input("absenceVersion", sql.Int, input.absenceVersion)
        .input("conflictType", sql.NVarChar(60), input.conflictType)
        .input("severity", sql.NVarChar(20), input.severity)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("operationId", sql.UniqueIdentifier, input.operationId ?? null)
        .input("serviceId", sql.UniqueIdentifier, input.serviceId ?? null)
        .input("assignmentId", sql.UniqueIdentifier, input.assignmentId ?? null)
        .input("employeeWorkdayId", sql.UniqueIdentifier, input.employeeWorkdayId ?? null)
        .input("idempotencyKey", sql.NVarChar(200), input.idempotencyKey)
        .input("rangeStartAt", sql.DateTime2, input.rangeStartAt ?? null)
        .input("rangeEndAt", sql.DateTime2, input.rangeEndAt ?? null)
        .query(`
          INSERT INTO absence_operational_conflicts (
            company_id, absence_request_id, absence_version, conflict_type, severity,
            employee_id, operation_id, service_id, assignment_id, employee_workday_id,
            idempotency_key, range_start_at, range_end_at, status
          )
          OUTPUT INSERTED.*
          VALUES (
            @companyId, @absenceRequestId, @absenceVersion, @conflictType, @severity,
            @employeeId, @operationId, @serviceId, @assignmentId, @employeeWorkdayId,
            @idempotencyKey, @rangeStartAt, @rangeEndAt, N'OPEN'
          )
        `);
      return mapConflict(result.recordset[0] as Record<string, unknown>);
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      const existing = await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("idempotencyKey", sql.NVarChar(200), input.idempotencyKey)
        .query(`
          SELECT TOP 1 *
          FROM absence_operational_conflicts
          WHERE company_id = @companyId AND idempotency_key = @idempotencyKey
        `);
      return mapConflict(existing.recordset[0] as Record<string, unknown>);
    }
  },

  async resolveConflict(input: {
    companyId: string;
    absenceRequestId: string;
    conflictId: string;
    status: "RESOLVED" | "DISMISSED";
    resolutionCode: AbsenceOperationalResolutionCode;
    resolutionReason: string;
    resolvedByUserId: string;
    replacementEmployeeId?: string | null;
  }): Promise<AbsenceOperationalConflictDto | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, input.absenceRequestId)
      .input("id", sql.UniqueIdentifier, input.conflictId)
      .input("status", sql.NVarChar(20), input.status)
      .input("resolutionCode", sql.NVarChar(40), input.resolutionCode)
      .input("resolutionReason", sql.NVarChar(1000), input.resolutionReason)
      .input("resolvedByUserId", sql.UniqueIdentifier, input.resolvedByUserId)
      .input(
        "replacementEmployeeId",
        sql.UniqueIdentifier,
        input.replacementEmployeeId ?? null,
      )
      .query(`
        UPDATE absence_operational_conflicts
        SET status = @status,
            resolution_code = @resolutionCode,
            resolution_reason = @resolutionReason,
            resolved_by_user_id = @resolvedByUserId,
            replacement_employee_id = @replacementEmployeeId,
            resolved_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @id
          AND company_id = @companyId
          AND absence_request_id = @absenceRequestId
          AND status = N'OPEN'
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapConflict(result.recordset[0] as Record<string, unknown>);
  },

  async upsertEffect(input: {
    companyId: string;
    absenceRequestId: string;
    absenceVersion: number;
    effectType: AbsenceOperationalEffectType;
    targetEntityType: string;
    targetEntityId: string;
    previousStateJson?: string | null;
    appliedStateJson?: string | null;
    status?: AbsenceOperationalEffectStatus;
    idempotencyKey: string;
  }): Promise<void> {
    try {
      await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("absenceRequestId", sql.UniqueIdentifier, input.absenceRequestId)
        .input("absenceVersion", sql.Int, input.absenceVersion)
        .input("effectType", sql.NVarChar(40), input.effectType)
        .input("targetEntityType", sql.NVarChar(40), input.targetEntityType)
        .input("targetEntityId", sql.UniqueIdentifier, input.targetEntityId)
        .input("previousStateJson", sql.NVarChar(sql.MAX), input.previousStateJson ?? null)
        .input("appliedStateJson", sql.NVarChar(sql.MAX), input.appliedStateJson ?? null)
        .input("status", sql.NVarChar(30), input.status ?? "APPLIED")
        .input("idempotencyKey", sql.NVarChar(200), input.idempotencyKey)
        .query(`
          INSERT INTO absence_operational_effects (
            company_id, absence_request_id, absence_version, effect_type,
            target_entity_type, target_entity_id, previous_state_json, applied_state_json,
            status, idempotency_key
          )
          VALUES (
            @companyId, @absenceRequestId, @absenceVersion, @effectType,
            @targetEntityType, @targetEntityId, @previousStateJson, @appliedStateJson,
            @status, @idempotencyKey
          )
        `);
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  },

  async revertEffectsForRequest(
    companyId: string,
    absenceRequestId: string,
  ): Promise<number> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, absenceRequestId)
      .query(`
        UPDATE absence_operational_effects
        SET status = N'REVERTED',
            reverted_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND absence_request_id = @absenceRequestId
          AND status = N'APPLIED'
      `);
    return result.rowsAffected[0] ?? 0;
  },

  async dismissOpenConflictsForRequest(
    companyId: string,
    absenceRequestId: string,
    reason: string,
  ): Promise<number> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, absenceRequestId)
      .input("reason", sql.NVarChar(1000), reason)
      .query(`
        UPDATE absence_operational_conflicts
        SET status = N'DISMISSED',
            resolution_code = N'DISMISS_WITH_REASON',
            resolution_reason = @reason,
            resolved_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND absence_request_id = @absenceRequestId
          AND status = N'OPEN'
      `);
    return result.rowsAffected[0] ?? 0;
  },

  async bumpOperationalImpactVersion(
    companyId: string,
    absenceRequestId: string,
  ): Promise<number> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, absenceRequestId)
      .query(`
        UPDATE absence_requests
        SET operational_impact_version = operational_impact_version + 1,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.operational_impact_version AS version
        WHERE id = @id AND company_id = @companyId
      `);
    return Number(result.recordset[0]?.version ?? 1);
  },
};
