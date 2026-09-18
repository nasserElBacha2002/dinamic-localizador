import sql from "mssql";
import { getPool } from "../database/connection";
import { auditRepository } from "../repositories/audit.repository";
import { sanitizeAuditPayload } from "../utils/audit-sanitize";

export type AuditLogEntry = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  previousData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  reason: string | null;
  userId: string | null;
  userName: string | null;
  createdAt: string;
};

const parseJson = (value: unknown): Record<string, unknown> | null => {
  if (value == null) {
    return null;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
};

export const auditService = {
  /**
   * Persist an audit_logs row. When `transaction` is provided, the insert joins the
   * caller's unit of work (CRITICAL_AUDIT). Without it, callers own best-effort semantics
   * (e.g. logAuditSafe) — this method never swallows insert failures.
   */
  async log(
    companyId: string,
    input: {
      entityType: string;
      entityId: string;
      action: string;
      previousData?: Record<string, unknown> | null;
      newData?: Record<string, unknown> | null;
      reason?: string | null;
      userId?: string | null;
    },
    transaction?: sql.Transaction,
  ): Promise<void> {
    const previousData = sanitizeAuditPayload(input.previousData ?? null);
    const newData = sanitizeAuditPayload(input.newData ?? null);

    await auditRepository.log(
      {
        companyId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        previousData: previousData ? JSON.stringify(previousData) : null,
        newData: newData ? JSON.stringify(newData) : null,
        reason: input.reason ?? null,
        userId: input.userId ?? null,
      },
      transaction,
    );
  },

  async listByEntity(
    companyId: string,
    entityType: string,
    entityId: string,
    page: number,
    limit: number,
  ): Promise<{ items: AuditLogEntry[]; total: number }> {
    const pool = getPool();
    const countResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("entityType", sql.NVarChar(50), entityType)
      .input("entityId", sql.UniqueIdentifier, entityId)
      .query(`
        SELECT COUNT(*) AS total
        FROM audit_logs
        WHERE company_id = @companyId
          AND entity_type = @entityType
          AND entity_id = @entityId
      `);
    const total = Number(countResult.recordset[0]?.total ?? 0);

    const dataResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("entityType", sql.NVarChar(50), entityType)
      .input("entityId", sql.UniqueIdentifier, entityId)
      .input("offset", sql.Int, (page - 1) * limit)
      .input("limit", sql.Int, limit)
      .query(`
        SELECT
          a.id,
          a.entity_type,
          a.entity_id,
          a.action,
          a.previous_data,
          a.new_data,
          a.reason,
          a.user_id,
          u.name AS user_name,
          a.created_at
        FROM audit_logs a
        LEFT JOIN users u ON u.id = a.user_id
        WHERE a.company_id = @companyId
          AND a.entity_type = @entityType
          AND a.entity_id = @entityId
        ORDER BY a.created_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    return {
      total,
      items: dataResult.recordset.map((row) => ({
        id: String(row.id),
        entityType: String(row.entity_type),
        entityId: String(row.entity_id),
        action: String(row.action),
        previousData: parseJson(row.previous_data),
        newData: parseJson(row.new_data),
        reason: row.reason ? String(row.reason) : null,
        userId: row.user_id ? String(row.user_id) : null,
        userName: row.user_name ? String(row.user_name) : null,
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : String(row.created_at),
      })),
    };
  },
};
