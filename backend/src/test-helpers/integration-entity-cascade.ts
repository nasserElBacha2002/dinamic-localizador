import sql from "mssql";
import { getPool } from "../database/connection";
import {
  deleteCompanyIdentityAndConfigSetBased,
  deleteCompanyOperationalDataSetBased,
} from "../repositories/company-purge.repository";

/**
 * Fixture-only cascades for integration cleanup / junk scripts.
 * Production company purge uses set-based helpers in company-purge.repository.
 */


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

      IF OBJECT_ID(N'dbo.absence_request_attachments', N'U') IS NOT NULL
        DELETE FROM absence_request_attachments
        WHERE company_id = @companyId
          AND (
            absence_request_id IN (
              SELECT id FROM absence_requests
              WHERE company_id = @companyId AND employee_id = @employeeId
            )
            OR draft_id IN (
              SELECT id FROM absence_request_drafts
              WHERE company_id = @companyId AND employee_id = @employeeId
            )
          );

      DELETE FROM absence_requests
      WHERE company_id = @companyId AND employee_id = @employeeId;

      IF OBJECT_ID(N'dbo.absence_request_drafts', N'U') IS NOT NULL
        DELETE FROM absence_request_drafts
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

      DELETE FROM attendance_reviews
      WHERE company_id = @companyId
        AND attendance_id IN (
          SELECT id FROM attendance_records
          WHERE company_id = @companyId AND employee_id = @employeeId
        );

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
      WHERE employee_id = @employeeId
         OR conversation_id IN (
           SELECT id FROM whatsapp_conversations
           WHERE company_id = @companyId AND employee_id = @employeeId
         );

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

      UPDATE employee_workdays
      SET operation_assignment_id = NULL
      WHERE company_id = @companyId AND employee_id = @employeeId;

      DELETE FROM employee_workdays
      WHERE company_id = @companyId AND employee_id = @employeeId;

      DELETE FROM operation_assignments
      WHERE company_id = @companyId AND employee_id = @employeeId;

      IF OBJECT_ID(N'dbo.attendance_alert_evaluation_queue', N'U') IS NOT NULL
        DELETE FROM attendance_alert_evaluation_queue
        WHERE company_id = @companyId AND employee_id = @employeeId;

      IF OBJECT_ID(N'dbo.employee_attendance_alert_state', N'U') IS NOT NULL
        DELETE FROM employee_attendance_alert_state
        WHERE company_id = @companyId AND employee_id = @employeeId;

      DELETE FROM employees
      WHERE company_id = @companyId AND id = @employeeId;
    `);
};


export const deleteCompanyCascade = async (companyId: string): Promise<void> => {
  await deleteCompanyOperationalDataSetBased(companyId);
  await deleteCompanyIdentityAndConfigSetBased(companyId);
  // Fixture cleanup also drops pending-storage rows and the company row.
  await getPool().request().input("companyId", sql.UniqueIdentifier, companyId).query(`
    DELETE FROM company_pending_storage_deletions WHERE company_id = @companyId;
    DELETE FROM company_deletion_records WHERE company_id = @companyId;
    DELETE FROM companies WHERE id = @companyId
  `);
};
