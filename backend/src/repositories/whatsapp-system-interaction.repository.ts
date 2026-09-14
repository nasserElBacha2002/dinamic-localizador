import sql from "mssql";
import { getPool } from "../database/connection";
import type { WhatsAppSystemInteractionCategory } from "../constants/whatsapp-turn-classification";
import type { SystemInteractionContext } from "../types/whatsapp-turn-classification";
import { isDuplicateKeyError } from "../utils/sql-server-errors";

const mapRow = (row: Record<string, unknown>): SystemInteractionContext => ({
  id: String(row.id),
  companyId: String(row.company_id),
  employeeId: String(row.employee_id),
  category: String(row.category) as WhatsAppSystemInteractionCategory,
  relatedOperationId: row.related_operation_id ? String(row.related_operation_id) : null,
  status: String(row.status) as SystemInteractionContext["status"],
  expiresAt:
    row.expires_at instanceof Date
      ? row.expires_at.toISOString()
      : String(row.expires_at),
  sourceKey: String(row.source_key),
  providerMessageSid: row.provider_message_sid
    ? String(row.provider_message_sid)
    : null,
});

export const whatsappSystemInteractionRepository = {
  async findBySourceKey(input: {
    companyId: string;
    sourceKey: string;
  }): Promise<SystemInteractionContext | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("sourceKey", sql.NVarChar(120), input.sourceKey)
      .query(`
        SELECT TOP 1 *
        FROM dbo.whatsapp_system_interactions
        WHERE company_id = @companyId AND source_key = @sourceKey;
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  /**
   * Idempotent prep before Twilio send.
   * Does NOT reactivate CONSUMED/CANCELLED/EXPIRED/SEND_FAILED.
   * Does NOT renew expires_at on retries.
   */
  async prepare(input: {
    companyId: string;
    employeeId: string;
    category: WhatsAppSystemInteractionCategory;
    relatedOperationId?: string | null;
    sourceJob: string;
    sourceKey: string;
    sourceMessageId?: string | null;
    expiresAt: Date;
  }): Promise<SystemInteractionContext> {
    const existing = await this.findBySourceKey({
      companyId: input.companyId,
      sourceKey: input.sourceKey,
    });
    if (existing) {
      return existing;
    }

    try {
      const result = await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("category", sql.NVarChar(80), input.category)
        .input("relatedOperationId", sql.UniqueIdentifier, input.relatedOperationId ?? null)
        .input("sourceJob", sql.NVarChar(80), input.sourceJob)
        .input("sourceKey", sql.NVarChar(120), input.sourceKey)
        .input("sourceMessageId", sql.UniqueIdentifier, input.sourceMessageId ?? null)
        .input("expiresAt", sql.DateTime2, input.expiresAt)
        .query(`
          INSERT INTO dbo.whatsapp_system_interactions (
            company_id, employee_id, category, related_operation_id,
            source_job, source_key, source_message_id,
            status, expires_at
          )
          OUTPUT INSERTED.*
          VALUES (
            @companyId, @employeeId, @category, @relatedOperationId,
            @sourceJob, @sourceKey, @sourceMessageId,
            N'PREPARED', @expiresAt
          );
        `);
      return mapRow(result.recordset[0] as Record<string, unknown>);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const raced = await this.findBySourceKey({
          companyId: input.companyId,
          sourceKey: input.sourceKey,
        });
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  },

  /** Re-arm SEND_FAILED for intentional outbox retry without renewing expires_at. */
  async rearmSendFailed(input: {
    companyId: string;
    sourceKey: string;
  }): Promise<SystemInteractionContext | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("sourceKey", sql.NVarChar(120), input.sourceKey)
      .query(`
        UPDATE dbo.whatsapp_system_interactions
        SET status = N'PREPARED',
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE company_id = @companyId
          AND source_key = @sourceKey
          AND status = N'SEND_FAILED';
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async markSendAccepted(input: {
    companyId: string;
    sourceKey: string;
    providerMessageSid: string;
  }): Promise<SystemInteractionContext | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("sourceKey", sql.NVarChar(120), input.sourceKey)
      .input("providerMessageSid", sql.NVarChar(64), input.providerMessageSid)
      .query(`
        UPDATE dbo.whatsapp_system_interactions
        SET status = N'ACTIVE',
            provider_message_sid = @providerMessageSid,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE company_id = @companyId
          AND source_key = @sourceKey
          AND status IN (N'PREPARED', N'SEND_AMBIGUOUS', N'ACTIVE');
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : this.findBySourceKey(input);
  },

  async markSendFailed(input: {
    companyId: string;
    sourceKey: string;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("sourceKey", sql.NVarChar(120), input.sourceKey)
      .query(`
        UPDATE dbo.whatsapp_system_interactions
        SET status = N'SEND_FAILED',
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND source_key = @sourceKey
          AND status = N'PREPARED';
      `);
  },

  async markSendAmbiguous(input: {
    companyId: string;
    sourceKey: string;
    providerMessageSid?: string | null;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("sourceKey", sql.NVarChar(120), input.sourceKey)
      .input("providerMessageSid", sql.NVarChar(64), input.providerMessageSid ?? null)
      .query(`
        UPDATE dbo.whatsapp_system_interactions
        SET status = N'SEND_AMBIGUOUS',
            provider_message_sid = COALESCE(@providerMessageSid, provider_message_sid),
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND source_key = @sourceKey
          AND status IN (N'PREPARED', N'SEND_AMBIGUOUS');
      `);
  },

  async findActiveCandidates(input: {
    companyId: string;
    employeeId: string;
    relatedOperationId?: string | null;
    now: Date;
  }): Promise<SystemInteractionContext[]> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("now", sql.DateTime2, input.now)
      .input("operationId", sql.UniqueIdentifier, input.relatedOperationId ?? null)
      .query(`
        SELECT *
        FROM dbo.whatsapp_system_interactions
        WHERE company_id = @companyId
          AND employee_id = @employeeId
          AND status = N'ACTIVE'
          AND expires_at > @now
          AND (
            @operationId IS NULL
            OR related_operation_id = @operationId
          )
        ORDER BY started_at DESC;
      `);
    return (result.recordset as Record<string, unknown>[]).map(mapRow);
  },

  /** Materialize logical expiry for ACTIVE rows past expires_at. */
  async markExpiredDue(input: {
    companyId: string;
    employeeId: string;
    now: Date;
  }): Promise<number> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("now", sql.DateTime2, input.now)
      .query(`
        UPDATE dbo.whatsapp_system_interactions
        SET status = N'EXPIRED',
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND employee_id = @employeeId
          AND status = N'ACTIVE'
          AND expires_at <= @now;
        SELECT @@ROWCOUNT AS affected;
      `);
    return Number(result.recordset[0]?.affected ?? 0);
  },

  async markConsumed(input: {
    companyId: string;
    interactionId: string;
  }): Promise<boolean> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.interactionId)
      .query(`
        UPDATE dbo.whatsapp_system_interactions
        SET status = N'CONSUMED',
            consumed_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND id = @id
          AND status = N'ACTIVE';
        SELECT @@ROWCOUNT AS affected;
      `);
    return Number(result.recordset[0]?.affected ?? 0) > 0;
  },
};
