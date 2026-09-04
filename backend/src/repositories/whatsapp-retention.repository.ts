import sql from "mssql";
import { ATTENDANCE_REMINDER_MAX_ATTEMPTS } from "../constants/attendance-notification";
import { ADMIN_ALERT_DEFAULT_MAX_ATTEMPTS } from "../constants/admin-alert";
import { OPERATION_ASSIGNMENT_NOTIFICATION_DEFAULT_MAX_ATTEMPTS } from "../constants/operation-assignment-notification";
import {
  flowExecutionTerminalStatusesSqlInList,
  type WhatsappRetentionTableKey,
} from "../constants/whatsapp-retention";
import { env } from "../config/env";
import { getPool } from "../database/connection";

export type WhatsappRetentionPolicyParams = {
  cutoff: Date;
  batchSize: number;
  attendanceMaxAttempts: number;
  adminAlertMaxAttempts: number;
  operationAssignmentMaxAttempts: number;
  payrollMaxAttempts: number;
};

export const defaultWhatsappRetentionPolicyParams = (
  cutoff: Date,
  batchSize: number,
): WhatsappRetentionPolicyParams => ({
  cutoff,
  batchSize,
  attendanceMaxAttempts: ATTENDANCE_REMINDER_MAX_ATTEMPTS,
  adminAlertMaxAttempts:
    env.ADMIN_ALERT_MAX_ATTEMPTS ?? ADMIN_ALERT_DEFAULT_MAX_ATTEMPTS,
  operationAssignmentMaxAttempts:
    env.OPERATION_ASSIGNMENT_NOTIFICATION_MAX_ATTEMPTS ??
    OPERATION_ASSIGNMENT_NOTIFICATION_DEFAULT_MAX_ATTEMPTS,
  payrollMaxAttempts: env.PAYROLL_RECEIPT_NOTIFICATION_MAX_ATTEMPTS,
});

const FLOW_TERMINAL_IN = flowExecutionTerminalStatusesSqlInList();

const flowExecutionAgeWhere = `e.status IN (${FLOW_TERMINAL_IN})
        AND COALESCE(e.finished_at, e.started_at) < @cutoff`;

const WEBHOOK_TERMINAL_WHERE = `
  (
    w.processing_status IN (N'PROCESSED', N'ANOMALY')
    OR (
      w.processing_status = N'FAILED'
      AND w.attempt_count >= w.max_attempts
    )
  )
  AND (w.processing_expires_at IS NULL OR w.processing_expires_at <= SYSUTCDATETIME())
  AND COALESCE(w.processed_at, w.created_at) < @cutoff
`;

const leaseOutboxPurgeWhere = (maxAttemptsParam: string): string => `
  (
    n.status IN (
      N'SEND_ACCEPTED', N'CANCELLED', N'SKIPPED',
      N'RECONCILIATION_REQUIRED', N'SENT_RECOVERY_REQUIRED'
    )
    OR (n.status = N'FAILED' AND n.attempt_count >= ${maxAttemptsParam})
  )
  AND n.status NOT IN (N'PENDING', N'PROCESSING', N'SEND_STARTED')
  AND (n.lease_expires_at IS NULL OR n.lease_expires_at <= SYSUTCDATETIME())
  AND COALESCE(n.sent_at, n.updated_at, n.created_at) < @cutoff
`;

const ADMIN_OUTBOX_PURGE_WHERE = leaseOutboxPurgeWhere("@adminAlertMaxAttempts");
const OPERATION_OUTBOX_PURGE_WHERE = leaseOutboxPurgeWhere("@operationAssignmentMaxAttempts");

const PAYROLL_OUTBOX_PURGE_WHERE = `
  (
    n.status IN (N'SEND_ACCEPTED', N'CANCELLED', N'RECONCILIATION_REQUIRED', N'SENT_RECOVERY_REQUIRED')
    OR (n.status = N'FAILED' AND n.attempt_count >= @payrollMaxAttempts)
  )
  AND n.status NOT IN (N'PENDING', N'PROCESSING')
  AND (n.lease_expires_at IS NULL OR n.lease_expires_at <= SYSUTCDATETIME())
  AND COALESCE(n.sent_at, n.updated_at, n.created_at) < @cutoff
`;

const ATTENDANCE_NOTIFICATION_PURGE_WHERE = `
  (
    n.status IN (N'SENT', N'SENT_RECOVERY_REQUIRED', N'SUPERSEDED')
    OR (n.status = N'FAILED' AND n.attempt_count >= @attendanceMaxAttempts)
  )
  AND n.status NOT IN (N'PENDING')
  AND n.created_at < @cutoff
  AND NOT EXISTS (
    SELECT 1 FROM whatsapp_flow_executions fe WHERE fe.notification_id = n.id
  )
`;

const rowsAffected = (result: sql.IResult<unknown>): number => result.rowsAffected[0] ?? 0;

const bindPolicyParams = (
  request: sql.Request,
  params: WhatsappRetentionPolicyParams,
): sql.Request =>
  request
    .input("cutoff", sql.DateTime2, params.cutoff)
    .input("batchSize", sql.Int, params.batchSize)
    .input("attendanceMaxAttempts", sql.Int, params.attendanceMaxAttempts)
    .input("adminAlertMaxAttempts", sql.Int, params.adminAlertMaxAttempts)
    .input("operationAssignmentMaxAttempts", sql.Int, params.operationAssignmentMaxAttempts)
    .input("payrollMaxAttempts", sql.Int, params.payrollMaxAttempts);

const TABLE_OPERATIONS: Record<WhatsappRetentionTableKey, { countSql: string; deleteSql: string }> =
  {
    whatsapp_flow_candidates: {
      countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_flow_candidates c
      INNER JOIN whatsapp_flow_executions e ON e.id = c.flow_execution_id
      WHERE ${flowExecutionAgeWhere}
    `,
      deleteSql: `
      DELETE TOP (@batchSize) c
      FROM whatsapp_flow_candidates c
      INNER JOIN whatsapp_flow_executions e ON e.id = c.flow_execution_id
      WHERE ${flowExecutionAgeWhere}
    `,
    },
    whatsapp_flow_steps: {
      countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_flow_steps s
      INNER JOIN whatsapp_flow_executions e ON e.id = s.flow_execution_id
      WHERE ${flowExecutionAgeWhere}
    `,
      deleteSql: `
      DELETE TOP (@batchSize) s
      FROM whatsapp_flow_steps s
      INNER JOIN whatsapp_flow_executions e ON e.id = s.flow_execution_id
      WHERE ${flowExecutionAgeWhere}
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
      WHERE e.status IN (${FLOW_TERMINAL_IN})
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
      WHERE status IN (${FLOW_TERMINAL_IN})
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
      WHERE ${ADMIN_OUTBOX_PURGE_WHERE}
    `,
      deleteSql: `
      DELETE TOP (@batchSize) a
      FROM whatsapp_admin_alert_notification_send_attempts a
      INNER JOIN whatsapp_admin_alert_notifications n
        ON n.id = a.notification_id AND n.company_id = a.company_id
      WHERE ${ADMIN_OUTBOX_PURGE_WHERE}
    `,
    },
    whatsapp_operation_assignment_notification_send_attempts: {
      countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_operation_assignment_notification_send_attempts a
      INNER JOIN whatsapp_operation_assignment_notifications n
        ON n.id = a.notification_id AND n.company_id = a.company_id
      WHERE ${OPERATION_OUTBOX_PURGE_WHERE}
    `,
      deleteSql: `
      DELETE TOP (@batchSize) a
      FROM whatsapp_operation_assignment_notification_send_attempts a
      INNER JOIN whatsapp_operation_assignment_notifications n
        ON n.id = a.notification_id AND n.company_id = a.company_id
      WHERE ${OPERATION_OUTBOX_PURGE_WHERE}
    `,
    },
    whatsapp_payroll_receipt_notification_send_attempts: {
      countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_payroll_receipt_notification_send_attempts a
      INNER JOIN whatsapp_payroll_receipt_notifications n
        ON n.id = a.notification_id AND n.company_id = a.company_id
      WHERE ${PAYROLL_OUTBOX_PURGE_WHERE}
    `,
      deleteSql: `
      DELETE TOP (@batchSize) a
      FROM whatsapp_payroll_receipt_notification_send_attempts a
      INNER JOIN whatsapp_payroll_receipt_notifications n
        ON n.id = a.notification_id AND n.company_id = a.company_id
      WHERE ${PAYROLL_OUTBOX_PURGE_WHERE}
    `,
    },
    whatsapp_attendance_notifications: {
      countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_attendance_notifications n
      WHERE ${ATTENDANCE_NOTIFICATION_PURGE_WHERE}
    `,
      deleteSql: `
      DELETE TOP (@batchSize) n
      FROM whatsapp_attendance_notifications n
      WHERE ${ATTENDANCE_NOTIFICATION_PURGE_WHERE}
    `,
    },
    whatsapp_admin_alert_notifications: {
      countSql: `
      SELECT COUNT(*) AS cnt
      FROM whatsapp_admin_alert_notifications n
      WHERE ${ADMIN_OUTBOX_PURGE_WHERE}
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_admin_alert_notification_send_attempts a
          WHERE a.notification_id = n.id AND a.company_id = n.company_id
        )
    `,
      deleteSql: `
      DELETE TOP (@batchSize) n
      FROM whatsapp_admin_alert_notifications n
      WHERE ${ADMIN_OUTBOX_PURGE_WHERE}
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
      WHERE ${OPERATION_OUTBOX_PURGE_WHERE}
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_operation_assignment_notification_send_attempts a
          WHERE a.notification_id = n.id AND a.company_id = n.company_id
        )
    `,
      deleteSql: `
      DELETE TOP (@batchSize) n
      FROM whatsapp_operation_assignment_notifications n
      WHERE ${OPERATION_OUTBOX_PURGE_WHERE}
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
      WHERE ${PAYROLL_OUTBOX_PURGE_WHERE}
        AND NOT EXISTS (
          SELECT 1 FROM whatsapp_payroll_receipt_notification_send_attempts a
          WHERE a.notification_id = n.id AND a.company_id = n.company_id
        )
    `,
      deleteSql: `
      DELETE TOP (@batchSize) n
      FROM whatsapp_payroll_receipt_notifications n
      WHERE ${PAYROLL_OUTBOX_PURGE_WHERE}
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
  async countEligible(
    table: WhatsappRetentionTableKey,
    params: WhatsappRetentionPolicyParams,
  ): Promise<number> {
    const pool = getPool();
    const result = await bindPolicyParams(pool.request(), params).query(
      TABLE_OPERATIONS[table].countSql,
    );
    return Number(result.recordset[0]?.cnt ?? 0);
  },

  async deleteBatch(
    table: WhatsappRetentionTableKey,
    params: WhatsappRetentionPolicyParams,
  ): Promise<number> {
    const pool = getPool();
    const result = await bindPolicyParams(pool.request(), params).query(
      TABLE_OPERATIONS[table].deleteSql,
    );
    return rowsAffected(result);
  },
};
