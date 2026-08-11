import sql from "mssql";
import { getPool } from "../database/connection";

/**
 * Set-based tenant operational purge (production).
 * Fixture helpers still use per-entity cascades in the same module.
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
    DELETE FROM employee_categories WHERE company_id = @companyId;
    DELETE FROM company_absence_settings WHERE company_id = @companyId;
    DELETE FROM absence_types WHERE company_id = @companyId;
    DELETE FROM company_location_types WHERE company_id = @companyId;
    DELETE FROM user_company_memberships WHERE company_id = @companyId;
    DELETE FROM company_modules WHERE company_id = @companyId;
    DELETE FROM company_settings WHERE company_id = @companyId;

    IF OBJECT_ID(N'dbo.import_jobs', N'U') IS NOT NULL
      DELETE FROM import_jobs WHERE company_id = @companyId;
  `);
};

/** Explicit residue checks before tombstone. */
export const COMPANY_RESIDUE_CHECKS: Array<{ name: string; sql: string }> = [
  { name: "scheduled_operations", sql: "SELECT COUNT(1) AS c FROM scheduled_operations WHERE company_id = @companyId" },
  { name: "employees", sql: "SELECT COUNT(1) AS c FROM employees WHERE company_id = @companyId" },
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

// --- Fixture-oriented per-entity cascades (integration cleanup) ---

export const deleteOperationCascade = async (
  companyId: string,
  operationId: string,
): Promise<void> => {
  const pool = getPool();
  const bind = () =>
    pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId);

  // Separate round-trip: flow executions FK to attendance notifications.
  await bind().query(`
    DELETE s
    FROM whatsapp_flow_steps s
    INNER JOIN whatsapp_flow_executions e ON e.id = s.flow_execution_id
    INNER JOIN whatsapp_attendance_notifications n ON n.id = e.notification_id
    WHERE n.company_id = @companyId
      AND n.operation_id = @operationId;

    DELETE c
    FROM whatsapp_flow_candidates c
    INNER JOIN whatsapp_flow_executions e ON e.id = c.flow_execution_id
    INNER JOIN whatsapp_attendance_notifications n ON n.id = e.notification_id
    WHERE n.company_id = @companyId
      AND n.operation_id = @operationId;

    DELETE e
    FROM whatsapp_flow_executions e
    INNER JOIN whatsapp_attendance_notifications n ON n.id = e.notification_id
    WHERE n.company_id = @companyId
      AND n.operation_id = @operationId;

    DELETE FROM whatsapp_attendance_notifications
    WHERE company_id = @companyId AND operation_id = @operationId;

    DELETE a
    FROM whatsapp_operation_assignment_notification_send_attempts a
    INNER JOIN whatsapp_operation_assignment_notifications n ON n.id = a.notification_id
    WHERE n.company_id = @companyId
      AND n.operation_id = @operationId;

    DELETE FROM whatsapp_operation_assignment_notifications
    WHERE company_id = @companyId AND operation_id = @operationId;
  `);

  await bind().query(`
      UPDATE operation_assignments
      SET source_assignment_batch_id = NULL
      WHERE company_id = @companyId AND operation_id = @operationId;

      UPDATE work_team_assignment_batch_items
      SET operation_assignment_id = NULL
      WHERE batch_id IN (
        SELECT id FROM work_team_assignment_batches
        WHERE company_id = @companyId AND operation_id = @operationId
      );

      DELETE FROM work_team_assignment_batch_item_sources
      WHERE batch_item_id IN (
        SELECT i.id
        FROM work_team_assignment_batch_items i
        INNER JOIN work_team_assignment_batches b ON b.id = i.batch_id
        WHERE b.company_id = @companyId AND b.operation_id = @operationId
      );

      DELETE FROM work_team_assignment_batch_items
      WHERE batch_id IN (
        SELECT id FROM work_team_assignment_batches
        WHERE company_id = @companyId AND operation_id = @operationId
      );

      DELETE FROM work_team_assignment_batch_teams
      WHERE batch_id IN (
        SELECT id FROM work_team_assignment_batches
        WHERE company_id = @companyId AND operation_id = @operationId
      );

      DELETE FROM work_team_assignment_batches
      WHERE company_id = @companyId AND operation_id = @operationId;

      DELETE FROM attendance_records
      WHERE company_id = @companyId AND operation_id = @operationId;

      DELETE FROM bot_sessions
      WHERE company_id = @companyId AND operation_id = @operationId;

      DELETE FROM bot_simulation_sessions
      WHERE company_id = @companyId AND operation_id = @operationId;

      DELETE FROM employee_workdays
      WHERE company_id = @companyId
        AND operation_workday_id IN (
          SELECT id FROM operation_workdays
          WHERE company_id = @companyId AND operation_id = @operationId
        );

      DELETE FROM operation_assignments
      WHERE company_id = @companyId AND operation_id = @operationId;

      DELETE FROM operation_workdays
      WHERE company_id = @companyId AND operation_id = @operationId;

      DELETE FROM operation_schedule_days
      WHERE operation_schedule_id IN (
        SELECT id FROM operation_schedules
        WHERE company_id = @companyId AND operation_id = @operationId
      );

      DELETE FROM operation_schedules
      WHERE company_id = @companyId AND operation_id = @operationId;

      DELETE FROM scheduled_operations
      WHERE company_id = @companyId AND id = @operationId;
    `);
};

export const deleteEmployeeCascade = async (
  companyId: string,
  employeeId: string,
): Promise<void> => {
  const pool = getPool();
  await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("employeeId", sql.UniqueIdentifier, employeeId)
    .query(`
      DELETE FROM absence_request_events
      WHERE absence_request_id IN (
        SELECT id FROM absence_requests
        WHERE company_id = @companyId AND employee_id = @employeeId
      )
         OR performed_by_employee_id = @employeeId;

      DELETE FROM employee_absence_balance_movements
      WHERE company_id = @companyId AND employee_id = @employeeId;

      DELETE FROM absence_workday_sync_jobs
      WHERE company_id = @companyId AND absence_request_id IN (
        SELECT id FROM absence_requests
        WHERE company_id = @companyId AND employee_id = @employeeId
      );

      DELETE FROM absence_operational_conflicts
      WHERE company_id = @companyId AND (
        employee_id = @employeeId
        OR absence_request_id IN (
          SELECT id FROM absence_requests
          WHERE company_id = @companyId AND employee_id = @employeeId
        )
      );

      DELETE FROM absence_operational_effects
      WHERE company_id = @companyId AND absence_request_id IN (
        SELECT id FROM absence_requests
        WHERE company_id = @companyId AND employee_id = @employeeId
      );

      DELETE FROM absence_requests
      WHERE company_id = @companyId AND employee_id = @employeeId;

      IF OBJECT_ID(N'dbo.payroll_receipts', N'U') IS NOT NULL
      BEGIN
        INSERT INTO company_pending_storage_deletions (company_id, storage_object_key)
        SELECT DISTINCT r.company_id, r.storage_object_key
        FROM payroll_receipts r
        WHERE r.company_id = @companyId
          AND r.employee_id = @employeeId
          AND r.storage_object_key IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM company_pending_storage_deletions p
            WHERE p.company_id = r.company_id
              AND p.storage_object_key = r.storage_object_key
          );

        IF OBJECT_ID(N'dbo.whatsapp_payroll_receipt_notifications', N'U') IS NOT NULL
          DELETE FROM whatsapp_payroll_receipt_notifications
          WHERE company_id = @companyId AND employee_id = @employeeId;

        DELETE FROM payroll_receipts
        WHERE company_id = @companyId AND employee_id = @employeeId;
      END;

      DELETE FROM attendance_records
      WHERE company_id = @companyId AND employee_id = @employeeId;

      IF OBJECT_ID(N'dbo.whatsapp_flow_steps', N'U') IS NOT NULL
      BEGIN
        DELETE FROM whatsapp_flow_steps
        WHERE flow_execution_id IN (
          SELECT e.id
          FROM whatsapp_flow_executions e
          WHERE e.employee_id = @employeeId
             OR e.notification_id IN (
               SELECT id FROM whatsapp_attendance_notifications
               WHERE company_id = @companyId AND employee_id = @employeeId
             )
        );
      END;

      IF OBJECT_ID(N'dbo.whatsapp_flow_candidates', N'U') IS NOT NULL
      BEGIN
        DELETE FROM whatsapp_flow_candidates
        WHERE flow_execution_id IN (
          SELECT e.id
          FROM whatsapp_flow_executions e
          WHERE e.employee_id = @employeeId
             OR e.notification_id IN (
               SELECT id FROM whatsapp_attendance_notifications
               WHERE company_id = @companyId AND employee_id = @employeeId
             )
        );
      END;

      IF OBJECT_ID(N'dbo.whatsapp_flow_executions', N'U') IS NOT NULL
      BEGIN
        DELETE FROM whatsapp_flow_executions
        WHERE employee_id = @employeeId
           OR notification_id IN (
             SELECT id FROM whatsapp_attendance_notifications
             WHERE company_id = @companyId AND employee_id = @employeeId
           );
      END;

      DELETE FROM whatsapp_attendance_notifications
      WHERE company_id = @companyId AND employee_id = @employeeId;

      IF OBJECT_ID(N'dbo.whatsapp_operation_assignment_notification_send_attempts', N'U') IS NOT NULL
        DELETE FROM whatsapp_operation_assignment_notification_send_attempts
        WHERE notification_id IN (
          SELECT id FROM whatsapp_operation_assignment_notifications
          WHERE company_id = @companyId AND employee_id = @employeeId
        );

      IF OBJECT_ID(N'dbo.whatsapp_operation_assignment_notifications', N'U') IS NOT NULL
        DELETE FROM whatsapp_operation_assignment_notifications
        WHERE company_id = @companyId AND employee_id = @employeeId;

      DELETE FROM whatsapp_messages
      WHERE employee_id = @employeeId;

      IF OBJECT_ID(N'dbo.whatsapp_conversations', N'U') IS NOT NULL
      BEGIN
        DELETE FROM whatsapp_conversations
        WHERE company_id = @companyId AND employee_id = @employeeId;
      END;

      DELETE FROM bot_sessions
      WHERE company_id = @companyId AND employee_id = @employeeId;

      DELETE FROM bot_simulation_sessions
      WHERE company_id = @companyId AND employee_id = @employeeId;

      DELETE FROM employee_absence_balances
      WHERE company_id = @companyId AND employee_id = @employeeId;

      DELETE FROM work_team_members
      WHERE company_id = @companyId AND employee_id = @employeeId;

      DELETE FROM employee_workdays
      WHERE company_id = @companyId AND employee_id = @employeeId;

      DELETE FROM operation_assignments
      WHERE company_id = @companyId AND employee_id = @employeeId;

      DELETE FROM employees
      WHERE company_id = @companyId AND id = @employeeId;
    `);
};

export const deleteCompanyCascade = async (companyId: string): Promise<void> => {
  await deleteCompanyOperationalDataSetBased(companyId);
  await deleteCompanyIdentityAndConfigSetBased(companyId);
  const pool = getPool();
  await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
    DELETE FROM companies WHERE id = @companyId
  `);
};
