import sql from "mssql";
import { getPool } from "../database/connection";

/**
 * Company tenant purge persistence (set-based DELETE/UPDATE + residue checks).
 * Orchestration/leases/GCS remain in company-deletion-purge.service.
 * Fixture per-entity cascades live in test-helpers/integration-entity-cascade.ts.
 */
export const deleteCompanyOperationalDataSetBased = async (
  companyId: string,
  transaction?: sql.Transaction,
): Promise<void> => {
  const request = transaction ? new sql.Request(transaction) : getPool().request();
  await request.input("companyId", sql.UniqueIdentifier, companyId).query(`
    UPDATE operation_assignments
    SET source_assignment_batch_id = NULL
    WHERE company_id = @companyId;

    UPDATE work_team_assignment_batch_items
    SET operation_assignment_id = NULL
    WHERE batch_id IN (
      SELECT id FROM work_team_assignment_batches WHERE company_id = @companyId
    );

    DELETE FROM work_team_assignment_batch_item_sources
    WHERE batch_item_id IN (
      SELECT i.id
      FROM work_team_assignment_batch_items i
      INNER JOIN work_team_assignment_batches b ON b.id = i.batch_id
      WHERE b.company_id = @companyId
    );

    DELETE FROM work_team_assignment_batch_items
    WHERE batch_id IN (SELECT id FROM work_team_assignment_batches WHERE company_id = @companyId);

    DELETE FROM work_team_assignment_batch_teams
    WHERE batch_id IN (SELECT id FROM work_team_assignment_batches WHERE company_id = @companyId);

    DELETE FROM work_team_assignment_batches WHERE company_id = @companyId;

    DELETE FROM attendance_records WHERE company_id = @companyId;
    DELETE FROM whatsapp_attendance_notifications WHERE company_id = @companyId;
    IF OBJECT_ID(N'dbo.whatsapp_payroll_receipt_notifications', N'U') IS NOT NULL
      DELETE FROM whatsapp_payroll_receipt_notifications WHERE company_id = @companyId;
    IF OBJECT_ID(N'dbo.whatsapp_operation_assignment_notification_send_attempts', N'U') IS NOT NULL
      DELETE FROM whatsapp_operation_assignment_notification_send_attempts
      WHERE company_id = @companyId;
    IF OBJECT_ID(N'dbo.whatsapp_operation_assignment_notifications', N'U') IS NOT NULL
      DELETE FROM whatsapp_operation_assignment_notifications WHERE company_id = @companyId;
    DELETE FROM bot_sessions WHERE company_id = @companyId;
    DELETE FROM bot_simulation_sessions WHERE company_id = @companyId;

    DELETE FROM employee_workdays WHERE company_id = @companyId;
    DELETE FROM operation_assignments WHERE company_id = @companyId;
    DELETE FROM operation_workdays WHERE company_id = @companyId;

    DELETE FROM operation_schedule_days
    WHERE operation_schedule_id IN (
      SELECT id FROM operation_schedules WHERE company_id = @companyId
    );
    DELETE FROM operation_schedules WHERE company_id = @companyId;
    DELETE FROM scheduled_operations WHERE company_id = @companyId;

    DELETE FROM absence_request_events WHERE company_id = @companyId;
    DELETE FROM employee_absence_balance_movements WHERE company_id = @companyId;
    DELETE FROM absence_workday_sync_jobs WHERE company_id = @companyId;
    DELETE FROM absence_operational_conflicts WHERE company_id = @companyId;
    DELETE FROM absence_operational_effects WHERE company_id = @companyId;

    IF OBJECT_ID(N'dbo.absence_request_attachments', N'U') IS NOT NULL
      DELETE FROM absence_request_attachments WHERE company_id = @companyId;
    IF OBJECT_ID(N'dbo.absence_request_drafts', N'U') IS NOT NULL
      DELETE FROM absence_request_drafts WHERE company_id = @companyId;

    DELETE FROM absence_requests WHERE company_id = @companyId;
    DELETE FROM employee_absence_balances WHERE company_id = @companyId;

    IF OBJECT_ID(N'dbo.payroll_receipts', N'U') IS NOT NULL
      DELETE FROM payroll_receipts WHERE company_id = @companyId;
    IF OBJECT_ID(N'dbo.payroll_receipt_batches', N'U') IS NOT NULL
      DELETE FROM payroll_receipt_batches WHERE company_id = @companyId;

    -- Provider events are keyed by message_id / SID, not company_id.
    IF OBJECT_ID(N'dbo.whatsapp_provider_events', N'U') IS NOT NULL
      DELETE FROM whatsapp_provider_events
      WHERE message_id IN (SELECT id FROM whatsapp_messages WHERE company_id = @companyId)
         OR provider_message_sid IN (
           SELECT provider_message_sid
           FROM whatsapp_messages
           WHERE company_id = @companyId
             AND provider_message_sid IS NOT NULL
         );

    DELETE FROM whatsapp_messages WHERE company_id = @companyId;

    IF OBJECT_ID(N'dbo.whatsapp_flow_steps', N'U') IS NOT NULL
      DELETE FROM whatsapp_flow_steps
      WHERE flow_execution_id IN (
        SELECT id FROM whatsapp_flow_executions WHERE company_id = @companyId
      );
    IF OBJECT_ID(N'dbo.whatsapp_flow_candidates', N'U') IS NOT NULL
      DELETE FROM whatsapp_flow_candidates
      WHERE flow_execution_id IN (
        SELECT id FROM whatsapp_flow_executions WHERE company_id = @companyId
      );
    IF OBJECT_ID(N'dbo.whatsapp_flow_executions', N'U') IS NOT NULL
      DELETE FROM whatsapp_flow_executions WHERE company_id = @companyId;
    IF OBJECT_ID(N'dbo.whatsapp_conversations', N'U') IS NOT NULL
      DELETE FROM whatsapp_conversations WHERE company_id = @companyId;
    IF OBJECT_ID(N'dbo.whatsapp_webhook_events', N'U') IS NOT NULL
      DELETE FROM whatsapp_webhook_events WHERE company_id = @companyId;

    DELETE FROM work_team_members
    WHERE work_team_id IN (SELECT id FROM work_teams WHERE company_id = @companyId);
    DELETE FROM work_teams WHERE company_id = @companyId;

    DELETE FROM attendance_reviews WHERE company_id = @companyId;

    IF OBJECT_ID(N'dbo.attendance_alert_evaluation_queue', N'U') IS NOT NULL
      DELETE FROM attendance_alert_evaluation_queue WHERE company_id = @companyId;
    IF OBJECT_ID(N'dbo.employee_attendance_alert_state', N'U') IS NOT NULL
      DELETE FROM employee_attendance_alert_state WHERE company_id = @companyId;

    DELETE FROM employees WHERE company_id = @companyId;
  `);
};

export const deleteCompanyIdentityAndConfigSetBased = async (
  companyId: string,
  transaction?: sql.Transaction,
): Promise<void> => {
  const request = transaction ? new sql.Request(transaction) : getPool().request();
  await request.input("companyId", sql.UniqueIdentifier, companyId).query(`
    DELETE FROM company_work_schedule_days WHERE company_id = @companyId;
    DELETE FROM company_work_schedules WHERE company_id = @companyId;
    DELETE FROM user_invitations WHERE company_id = @companyId;
    DELETE FROM audit_logs WHERE company_id = @companyId;

    UPDATE absence_types SET calendar_id = NULL WHERE company_id = @companyId;
    DELETE FROM company_calendar_dates WHERE company_id = @companyId;
    DELETE FROM company_work_calendar_weekdays WHERE company_id = @companyId;
    DELETE FROM company_work_calendars WHERE company_id = @companyId;

    DELETE FROM operational_locations WHERE company_id = @companyId;
    -- Zones are referenced by employees + operational_locations (already cleared above).
    IF OBJECT_ID(N'dbo.location_zones', N'U') IS NOT NULL
      DELETE FROM location_zones WHERE company_id = @companyId;
    DELETE FROM employee_categories WHERE company_id = @companyId;
    DELETE FROM company_absence_settings WHERE company_id = @companyId;
    DELETE FROM absence_types WHERE company_id = @companyId;
    DELETE FROM company_location_types WHERE company_id = @companyId;
    DELETE FROM user_company_memberships WHERE company_id = @companyId;
    DELETE FROM company_modules WHERE company_id = @companyId;

    IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notification_send_attempts', N'U') IS NOT NULL
      DELETE FROM whatsapp_admin_alert_notification_send_attempts WHERE company_id = @companyId;
    IF OBJECT_ID(N'dbo.whatsapp_admin_alert_notifications', N'U') IS NOT NULL
      DELETE FROM whatsapp_admin_alert_notifications WHERE company_id = @companyId;
    IF OBJECT_ID(N'dbo.attendance_alert_evaluation_queue', N'U') IS NOT NULL
      DELETE FROM attendance_alert_evaluation_queue WHERE company_id = @companyId;
    IF OBJECT_ID(N'dbo.employee_attendance_alert_state', N'U') IS NOT NULL
      DELETE FROM employee_attendance_alert_state WHERE company_id = @companyId;
    IF OBJECT_ID(N'dbo.company_alert_recipients', N'U') IS NOT NULL
      DELETE FROM company_alert_recipients WHERE company_id = @companyId;

    DELETE FROM company_settings WHERE company_id = @companyId;

    IF OBJECT_ID(N'dbo.import_jobs', N'U') IS NOT NULL
      DELETE FROM import_jobs WHERE company_id = @companyId;
  `);
};

/** Explicit residue checks before tombstone. */
export const COMPANY_RESIDUE_CHECKS: Array<{ name: string; sql: string }> = [
  { name: "scheduled_operations", sql: "SELECT COUNT(1) AS c FROM scheduled_operations WHERE company_id = @companyId" },
  { name: "employees", sql: "SELECT COUNT(1) AS c FROM employees WHERE company_id = @companyId" },
  { name: "location_zones", sql: "SELECT COUNT(1) AS c FROM location_zones WHERE company_id = @companyId" },
  { name: "attendance_records", sql: "SELECT COUNT(1) AS c FROM attendance_records WHERE company_id = @companyId" },
  { name: "absence_requests", sql: "SELECT COUNT(1) AS c FROM absence_requests WHERE company_id = @companyId" },
  { name: "user_company_memberships", sql: "SELECT COUNT(1) AS c FROM user_company_memberships WHERE company_id = @companyId" },
  { name: "company_settings", sql: "SELECT COUNT(1) AS c FROM company_settings WHERE company_id = @companyId" },
  {
    name: "pending_storage",
    sql: `SELECT COUNT(1) AS c FROM company_pending_storage_deletions
          WHERE company_id = @companyId AND status <> N'DELETED'`,
  },
];

export const assertNoCompanyResidues = async (companyId: string): Promise<void> => {
  const pool = getPool();
  const remaining: string[] = [];
  for (const check of COMPANY_RESIDUE_CHECKS) {
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(check.sql);
    if (Number(result.recordset[0]?.c ?? 0) > 0) {
      remaining.push(check.name);
    }
  }
  if (remaining.length > 0) {
    throw new Error(`Company residue remains: ${remaining.join(", ")}`);
  }
};
