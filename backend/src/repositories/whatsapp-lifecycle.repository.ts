import sql from "mssql";
import { getPool } from "../database/connection";

export type WhatsappLifecycleBatchResult = {
  scanned: number;
  updated: number;
};

/**
 * duration_ms column is INT (migration 076). DATEDIFF(ms) overflows after ~24.8 days.
 * Clamp via DATEDIFF_BIG into INT range — no schema migration required.
 */
export const FLOW_DURATION_MS_INT_SQL = `
  CASE
    WHEN DATEDIFF_BIG(MILLISECOND, started_at, SYSUTCDATETIME()) > 2147483647 THEN 2147483647
    WHEN DATEDIFF_BIG(MILLISECOND, started_at, SYSUTCDATETIME()) < 0 THEN 0
    ELSE CAST(DATEDIFF_BIG(MILLISECOND, started_at, SYSUTCDATETIME()) AS INT)
  END
`;

/**
 * Lifecycle reconciliations that unblock WhatsApp retention without skipping FK guards.
 * Keep SQL here (not in the retention purge job).
 */
export const whatsappLifecycleRepository = {
  /**
   * ACTIVE conversations with no activity for idleTimeoutHours → COMPLETED.
   * Skips conversations that still have STARTED flow executions (active work).
   * System interactions are not conversation-scoped (no conversation_id) — no guard.
   */
  async completeIdleActiveConversations(input: {
    idleTimeoutHours: number;
    batchSize: number;
  }): Promise<WhatsappLifecycleBatchResult> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("idleHours", sql.Int, input.idleTimeoutHours)
      .input("batchSize", sql.Int, input.batchSize)
      .query(`
        ;WITH due AS (
          SELECT TOP (@batchSize) c.id
          FROM whatsapp_conversations c WITH (READPAST, ROWLOCK)
          WHERE c.status = N'ACTIVE'
            AND c.last_activity_at < DATEADD(HOUR, -@idleHours, SYSUTCDATETIME())
            AND NOT EXISTS (
              SELECT 1
              FROM whatsapp_flow_executions fe
              WHERE fe.conversation_id = c.id
                AND fe.status = N'STARTED'
                AND fe.finished_at IS NULL
            )
          ORDER BY c.last_activity_at ASC
        )
        UPDATE c
        SET status = N'COMPLETED',
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.id
        FROM whatsapp_conversations c
        INNER JOIN due d ON d.id = c.id
        WHERE c.status = N'ACTIVE'
          AND NOT EXISTS (
            SELECT 1
            FROM whatsapp_flow_executions fe
            WHERE fe.conversation_id = c.id
              AND fe.status = N'STARTED'
              AND fe.finished_at IS NULL
          )
      `);
    const updated = result.recordset?.length ?? result.rowsAffected[0] ?? 0;
    return { scanned: updated, updated };
  },

  /**
   * STARTED flow executions older than timeoutHours → FAILED (retention terminal).
   * Leaves recent STARTED rows untouched. Safe for started_at > ~24.8 days (INT clamp).
   */
  async failAbandonedStartedFlows(input: {
    timeoutHours: number;
    batchSize: number;
  }): Promise<WhatsappLifecycleBatchResult> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("timeoutHours", sql.Int, input.timeoutHours)
      .input("batchSize", sql.Int, input.batchSize)
      .query(`
        ;WITH due AS (
          SELECT TOP (@batchSize) id
          FROM whatsapp_flow_executions WITH (READPAST, ROWLOCK)
          WHERE status = N'STARTED'
            AND started_at < DATEADD(HOUR, -@timeoutHours, SYSUTCDATETIME())
            AND finished_at IS NULL
          ORDER BY started_at ASC
        )
        UPDATE e
        SET status = N'FAILED',
            error_code = N'ABANDONED_STARTED_TIMEOUT',
            error_message = N'Flow left STARTED past lifecycle timeout',
            finished_at = SYSUTCDATETIME(),
            duration_ms = ${FLOW_DURATION_MS_INT_SQL}
        OUTPUT INSERTED.id
        FROM whatsapp_flow_executions e
        INNER JOIN due d ON d.id = e.id
        WHERE e.status = N'STARTED'
          AND e.finished_at IS NULL
      `);
    const updated = result.recordset?.length ?? result.rowsAffected[0] ?? 0;
    return { scanned: updated, updated };
  },

  /**
   * PROCESSING webhooks with expired lease → FAILED (exhausted), never PROCESSED.
   * Enables retention eligibility without inventing success.
   */
  async failAbandonedProcessingWebhooks(input: {
    batchSize: number;
  }): Promise<WhatsappLifecycleBatchResult> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("batchSize", sql.Int, input.batchSize)
      .query(`
        ;WITH due AS (
          SELECT TOP (@batchSize) id
          FROM whatsapp_webhook_events WITH (READPAST, ROWLOCK)
          WHERE processing_status = N'PROCESSING'
            AND processing_expires_at IS NOT NULL
            AND processing_expires_at < SYSUTCDATETIME()
          ORDER BY processing_expires_at ASC
        )
        UPDATE w
        SET processing_status = N'FAILED',
            last_error = N'ABANDONED_PROCESSING_LEASE_EXPIRED',
            processing_owner = NULL,
            processing_expires_at = NULL,
            next_attempt_at = NULL,
            attempt_count = CASE
              WHEN attempt_count < max_attempts THEN max_attempts
              ELSE attempt_count
            END,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.id
        FROM whatsapp_webhook_events w
        INNER JOIN due d ON d.id = w.id
        WHERE w.processing_status = N'PROCESSING'
          AND w.processing_expires_at IS NOT NULL
          AND w.processing_expires_at < SYSUTCDATETIME()
      `);
    const updated = result.recordset?.length ?? result.rowsAffected[0] ?? 0;
    return { scanned: updated, updated };
  },
};
