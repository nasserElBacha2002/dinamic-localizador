import sql from "mssql";
import { getPool } from "../database/connection";
import type { WhatsappRetentionTableKey } from "../constants/whatsapp-retention";

export type WhatsappRetentionBatchInput = {
  cutoff: Date;
  batchSize: number;
  dryRun: boolean;
};

export type WhatsappRetentionTableMetrics = {
  candidates: number;
  deleted: number;
  batches: number;
};

const rowsAffected = (result: sql.IResult<unknown>): number => result.rowsAffected[0] ?? 0;

const countQuery = async (query: string, cutoff: Date): Promise<number> => {
  const pool = getPool();
  const result = await pool.request().input("cutoff", sql.DateTime2, cutoff).query(query);
  return Number(result.recordset[0]?.cnt ?? 0);
};

const deleteBatchQuery = async (
  query: string,
  cutoff: Date,
  batchSize: number,
): Promise<number> => {
  const pool = getPool();
  const result = await pool
    .request()
    .input("cutoff", sql.DateTime2, cutoff)
    .input("batchSize", sql.Int, batchSize)
    .query(query);
  return rowsAffected(result);
};

const WEBHOOK_TERMINAL_WHERE = `
  (
    w.processing_status IN (N'PROCESSED', N'ANOMALY')
    OR (
      w.processing_status = N'FAILED'
      AND w.attempt_count >= w.max_attempts
      AND (w.next_attempt_at IS NULL OR w.next_attempt_at <= SYSUTCDATETIME())
    )
  )
  AND (w.processing_expires_at IS NULL OR w.processing_expires_at <= SYSUTCDATETIME())
  AND COALESCE(w.processed_at, w.created_at) < @cutoff
`;

const OUTBOX_TERMINAL_WHERE = `
  n.status IN (
    N'SEND_ACCEPTED', N'FAILED', N'CANCELLED', N'SKIPPED',
    N'RECONCILIATION_REQUIRED', N'SENT_RECOVERY_REQUIRED'
  )
  AND n.status NOT IN (N'PENDING', N'PROCESSING', N'SEND_STARTED')
  AND (n.lease_expires_at IS NULL OR n.lease_expires_at <= SYSUTCDATETIME())
  AND (
    n.status <> N'FAILED'
    OR n.next_attempt_at IS NULL
    OR n.next_attempt_at <= SYSUTCDATETIME()
  )
  AND COALESCE(n.sent_at, n.updated_at, n.created_at) < @cutoff
`;

const PAYROLL_OUTBOX_TERMINAL_WHERE = `
  n.status IN (N'SENT', N'FAILED', N'CANCELLED', N'SENT_RECOVERY_REQUIRED')
  AND n.status NOT IN (N'PENDING', N'PROCESSING')
  AND (n.lease_expires_at IS NULL OR n.lease_expires_at <= SYSUTCDATETIME())
  AND (
    n.status <> N'FAILED'
    OR n.next_attempt_at IS NULL
    OR n.next_attempt_at <= SYSUTCDATETIME()
  )
  AND COALESCE(n.sent_at, n.updated_at, n.created_at) < @cutoff
`;

const TABLE_OPERATIONS: Record<
  WhatsappRetentionTableKey,
  { countSql: string; deleteSql: string }
> = {
  whatsapp_flow_candidates: {
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_flow_candidates c
      INNER JOIN whatsapp_flow_executions e ON e.id = c.flow_execution_id
      WHERE e.status <> N'STARTED'
        AND COALESCE(e.finished_at, e.started_at) < @cutoff
    `,
    deleteSql: `
      DELETE TOP (@batchSize) c
      FROM whatsapp_flow_candidates c
      INNER JOIN whatsapp_flow_executions e ON e.id = c.flow_execution_id
      WHERE e.status <> N'STARTED'
        AND COALESCE(e.finished_at, e.started_at) < @cutoff
    `,
  },
  whatsapp_flow_steps: {
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_flow_steps s
      INNER JOIN whatsapp_flow_executions e ON e.id = s.flow_execution_id
      WHERE e.status <> N'STARTED'
        AND COALESCE(e.finished_at, e.started_at) < @cutoff
    `,
    deleteSql: `
      DELETE TOP (@batchSize) s
      FROM whatsapp_flow_steps s
      INNER JOIN whatsapp_flow_executions e ON e.id = s.flow_execution_id
      WHERE e.status <> N'STARTED'
        AND COALESCE(e.finished_at, e.started_at) < @cutoff
    `,
  },
  whatsapp_provider_events: {
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_provider_events
      WHERE received_at < @cutoff
    `,
    deleteSql: `
      DELETE TOP (@batchSize)
      FROM whatsapp_provider_events
      WHERE received_at < @cutoff
    `,
  },
  whatsapp_flow_executions: {
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_flow_executions e
      WHERE e.status <> N'STARTED'
        AND COALESCE(e.finished_at, e.started_at) < @cutoff
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_flow_steps s WHERE s.flow_execution_id = e.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_flow_candidates c WHERE c.flow_execution_id = e.id
        )
    `,
    deleteSql: `
      DELETE TOP (@batchSize)
      FROM whatsapp_flow_executions
      WHERE status <> N'STARTED'
        AND COALESCE(finished_at, started_at) < @cutoff
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_flow_steps s WHERE s.flow_execution_id = whatsapp_flow_executions.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_flow_candidates c WHERE c.flow_execution_id = whatsapp_flow_executions.id
        )
    `,
  },
  whatsapp_admin_alert_notification_send_attempts: {
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_admin_alert_notification_send_attempts a
      INNER JOIN whatsapp_admin_alert_notifications n
        ON n.id = a.notification_id AND n.company_id = a.company_id
      WHERE ${OUTBOX_TERMINAL_WHERE}
    `,
    deleteSql: `
      DELETE TOP (@batchSize) a
      FROM whatsapp_admin_alert_notification_send_attempts a
      INNER JOIN whatsapp_admin_alert_notifications n
        ON n.id = a.notification_id AND n.company_id = a.company_id
      WHERE ${OUTBOX_TERMINAL_WHERE}
    `,
  },
  whatsapp_operation_assignment_notification_send_attempts: {
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_operation_assignment_notification_send_attempts a
      INNER JOIN whatsapp_operation_assignment_notifications n
        ON n.id = a.notification_id AND n.company_id = a.company_id
      WHERE ${OUTBOX_TERMINAL_WHERE}
    `,
    deleteSql: `
      DELETE TOP (@batchSize) a
      FROM whatsapp_operation_assignment_notification_send_attempts a
      INNER JOIN whatsapp_operation_assignment_notifications n
        ON n.id = a.notification_id AND n.company_id = a.company_id
      WHERE ${OUTBOX_TERMINAL_WHERE}
    `,
  },
  whatsapp_payroll_receipt_notification_send_attempts: {
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_payroll_receipt_notification_send_attempts a
      INNER JOIN whatsapp_payroll_receipt_notifications n
        ON n.id = a.notification_id AND n.company_id = a.company_id
      WHERE ${PAYROLL_OUTBOX_TERMINAL_WHERE}
    `,
    deleteSql: `
      DELETE TOP (@batchSize) a
      FROM whatsapp_payroll_receipt_notification_send_attempts a
      INNER JOIN whatsapp_payroll_receipt_notifications n
        ON n.id = a.notification_id AND n.company_id = a.company_id
      WHERE ${PAYROLL_OUTBOX_TERMINAL_WHERE}
    `,
  },
  whatsapp_attendance_notifications: {
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_attendance_notifications n
      WHERE n.status IN (N'SENT', N'FAILED', N'SENT_RECOVERY_REQUIRED', N'SUPERSEDED')
        AND n.created_at < @cutoff
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_flow_executions fe WHERE fe.notification_id = n.id
        )
    `,
    deleteSql: `
      DELETE TOP (@batchSize)
      FROM whatsapp_attendance_notifications
      WHERE status IN (N'SENT', N'FAILED', N'SENT_RECOVERY_REQUIRED', N'SUPERSEDED')
        AND created_at < @cutoff
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_flow_executions fe WHERE fe.notification_id = whatsapp_attendance_notifications.id
        )
    `,
  },
  whatsapp_admin_alert_notifications: {
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_admin_alert_notifications n
      WHERE ${OUTBOX_TERMINAL_WHERE}
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_admin_alert_notification_send_attempts a
          WHERE a.notification_id = n.id AND a.company_id = n.company_id
        )
    `,
    deleteSql: `
      DELETE TOP (@batchSize) n
      FROM whatsapp_admin_alert_notifications n
      WHERE ${OUTBOX_TERMINAL_WHERE}
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_admin_alert_notification_send_attempts a
          WHERE a.notification_id = n.id AND a.company_id = n.company_id
        )
    `,
  },
  whatsapp_operation_assignment_notifications: {
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_operation_assignment_notifications n
      WHERE ${OUTBOX_TERMINAL_WHERE}
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_operation_assignment_notification_send_attempts a
          WHERE a.notification_id = n.id AND a.company_id = n.company_id
        )
    `,
    deleteSql: `
      DELETE TOP (@batchSize) n
      FROM whatsapp_operation_assignment_notifications n
      WHERE ${OUTBOX_TERMINAL_WHERE}
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_operation_assignment_notification_send_attempts a
          WHERE a.notification_id = n.id AND a.company_id = n.company_id
        )
    `,
  },
  whatsapp_payroll_receipt_notifications: {
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_payroll_receipt_notifications n
      WHERE ${PAYROLL_OUTBOX_TERMINAL_WHERE}
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_payroll_receipt_notification_send_attempts a
          WHERE a.notification_id = n.id AND a.company_id = n.company_id
        )
    `,
    deleteSql: `
      DELETE TOP (@batchSize) n
      FROM whatsapp_payroll_receipt_notifications n
      WHERE ${PAYROLL_OUTBOX_TERMINAL_WHERE}
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_payroll_receipt_notification_send_attempts a
          WHERE a.notification_id = n.id AND a.company_id = n.company_id
        )
    `,
  },
  whatsapp_payroll_receipt_query_deliveries: {
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_payroll_receipt_query_deliveries d
      WHERE d.created_at < @cutoff
    `,
    deleteSql: `
      DELETE TOP (@batchSize)
      FROM whatsapp_payroll_receipt_query_deliveries
      WHERE created_at < @cutoff
    `,
  },
  whatsapp_messages: {
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_messages m
      WHERE m.created_at < @cutoff
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_conversations c
          WHERE c.id = m.conversation_id AND c.status = N'ACTIVE'
        )
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_provider_events pe WHERE pe.message_id = m.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_flow_executions fe WHERE fe.source_message_id = m.id
        )
    `,
    deleteSql: `
      DELETE TOP (@batchSize)
      FROM whatsapp_messages
      WHERE created_at < @cutoff
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_conversations c
          WHERE c.id = whatsapp_messages.conversation_id AND c.status = N'ACTIVE'
        )
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_provider_events pe WHERE pe.message_id = whatsapp_messages.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_flow_executions fe WHERE fe.source_message_id = whatsapp_messages.id
        )
    `,
  },
  whatsapp_webhook_events: {
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_webhook_events w
      WHERE ${WEBHOOK_TERMINAL_WHERE}
    `,
    deleteSql: `
      DELETE TOP (@batchSize) w
      FROM whatsapp_webhook_events w
      WHERE ${WEBHOOK_TERMINAL_WHERE}
    `,
  },
  whatsapp_conversations: {
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_conversations c
      WHERE c.status <> N'ACTIVE'
        AND c.last_activity_at < @cutoff
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_messages m WHERE m.conversation_id = c.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_flow_executions fe WHERE fe.conversation_id = c.id
        )
    `,
    deleteSql: `
      DELETE TOP (@batchSize)
      FROM whatsapp_conversations
      WHERE status <> N'ACTIVE'
        AND last_activity_at < @cutoff
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_messages m WHERE m.conversation_id = whatsapp_conversations.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_flow_executions fe WHERE fe.conversation_id = whatsapp_conversations.id
        )
    `,
  },
  bot_sessions: {
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM bot_sessions s
      WHERE s.expires_at < @cutoff
        AND s.state IN (N'COMPLETED', N'CANCELLED', N'EXPIRED')
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_payroll_receipt_query_deliveries d
          WHERE d.bot_session_id = s.id
        )
    `,
    deleteSql: `
      DELETE TOP (@batchSize)
      FROM bot_sessions
      WHERE expires_at < @cutoff
        AND state IN (N'COMPLETED', N'CANCELLED', N'EXPIRED')
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_payroll_receipt_query_deliveries d
          WHERE d.bot_session_id = bot_sessions.id
        )
    `,
  },
  bot_simulation_sessions: {
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM bot_simulation_sessions
      WHERE created_at < @cutoff
    `,
    deleteSql: `
      DELETE TOP (@batchSize)
      FROM bot_simulation_sessions
      WHERE created_at < @cutoff
    `,
  },
};

export const whatsappRetentionRepository = {
  async countEligible(table: WhatsappRetentionTableKey, cutoff: Date): Promise<number> {
    return countQuery(TABLE_OPERATIONS[table].countSql, cutoff);
  },

  async deleteBatch(
    table: WhatsappRetentionTableKey,
    cutoff: Date,
    batchSize: number,
  ): Promise<number> {
    return deleteBatchQuery(TABLE_OPERATIONS[table].deleteSql, cutoff, batchSize);
  },
};
