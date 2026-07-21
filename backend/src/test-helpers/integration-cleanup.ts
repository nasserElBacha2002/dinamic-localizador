import sql from "mssql";
import { getPool } from "../database/connection";

/**
 * Cascades deletes for a scheduled operation and all dependent rows.
 * Safe for integration fixtures that insert into a shared company (e.g. Dinamic Systems).
 */
export const deleteOperationCascade = async (
  companyId: string,
  operationId: string,
): Promise<void> => {
  const pool = getPool();
  await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("operationId", sql.UniqueIdentifier, operationId)
    .query(`
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

      DELETE FROM whatsapp_attendance_notifications
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

/**
 * Cascades deletes for an employee and rows that reference them.
 * Prefer deleting operations first when the employee is the only assignee.
 */
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

      DELETE FROM absence_requests
      WHERE company_id = @companyId AND employee_id = @employeeId;

      DELETE FROM attendance_records
      WHERE company_id = @companyId AND employee_id = @employeeId;

      DELETE FROM whatsapp_attendance_notifications
      WHERE company_id = @companyId AND employee_id = @employeeId;

      DELETE FROM whatsapp_messages
      WHERE employee_id = @employeeId;

      DELETE FROM bot_sessions
      WHERE company_id = @companyId AND employee_id = @employeeId;

      DELETE FROM bot_simulation_sessions
      WHERE company_id = @companyId AND employee_id = @employeeId;

      DELETE FROM employee_absence_balances
      WHERE company_id = @companyId AND employee_id = @employeeId;

      DELETE FROM work_team_members
      WHERE employee_id = @employeeId;

      DELETE FROM employee_workdays
      WHERE company_id = @companyId AND employee_id = @employeeId;

      DELETE FROM operation_assignments
      WHERE company_id = @companyId AND employee_id = @employeeId;

      DELETE FROM employees
      WHERE company_id = @companyId AND id = @employeeId;
    `);
};

export const deleteCompanyCascade = async (companyId: string): Promise<void> => {
  const pool = getPool();

  const operations = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .query(`SELECT id FROM scheduled_operations WHERE company_id = @companyId`);

  for (const row of operations.recordset as Array<{ id: string }>) {
    await deleteOperationCascade(companyId, String(row.id));
  }

  const employees = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .query(`SELECT id FROM employees WHERE company_id = @companyId`);

  for (const row of employees.recordset as Array<{ id: string }>) {
    await deleteEmployeeCascade(companyId, String(row.id));
  }

  await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
    DELETE FROM work_team_members
    WHERE work_team_id IN (SELECT id FROM work_teams WHERE company_id = @companyId);

    DELETE FROM work_teams WHERE company_id = @companyId;

    DELETE FROM company_work_schedule_days WHERE company_id = @companyId;
    DELETE FROM company_work_schedules WHERE company_id = @companyId;

    DELETE FROM audit_logs WHERE company_id = @companyId;
    DELETE FROM attendance_reviews WHERE company_id = @companyId;
    DELETE FROM whatsapp_attendance_notifications WHERE company_id = @companyId;
    DELETE FROM whatsapp_messages WHERE company_id = @companyId;
    DELETE FROM bot_sessions WHERE company_id = @companyId;
    DELETE FROM bot_simulation_sessions WHERE company_id = @companyId;
    DELETE FROM absence_request_events WHERE company_id = @companyId;
    DELETE FROM absence_requests WHERE company_id = @companyId;

    DELETE FROM operational_locations WHERE company_id = @companyId;
    DELETE FROM employee_absence_balances WHERE company_id = @companyId;
    DELETE FROM employee_categories WHERE company_id = @companyId;
    DELETE FROM company_absence_settings WHERE company_id = @companyId;
    DELETE FROM absence_types WHERE company_id = @companyId;
    DELETE FROM company_location_types WHERE company_id = @companyId;
    DELETE FROM user_company_memberships WHERE company_id = @companyId;
    DELETE FROM company_modules WHERE company_id = @companyId;
    DELETE FROM company_settings WHERE company_id = @companyId;
    DELETE FROM companies WHERE id = @companyId;
  `);
};

export interface IntegrationFixtureTracker {
  trackOperation: (companyId: string, operationId: string) => void;
  trackEmployee: (companyId: string, employeeId: string) => void;
  trackCompany: (companyId: string) => void;
  cleanup: () => Promise<void>;
}

/** Tracks fixture IDs created during a suite and deletes them in reverse dependency order. */
export const createIntegrationFixtureTracker = (): IntegrationFixtureTracker => {
  const operations: Array<{ companyId: string; operationId: string }> = [];
  const employees: Array<{ companyId: string; employeeId: string }> = [];
  const companies: string[] = [];

  return {
    trackOperation: (companyId, operationId) => {
      operations.push({ companyId, operationId });
    },
    trackEmployee: (companyId, employeeId) => {
      employees.push({ companyId, employeeId });
    },
    trackCompany: (companyId) => {
      companies.push(companyId);
    },
    cleanup: async () => {
      for (const { companyId, operationId } of [...operations].reverse()) {
        await deleteOperationCascade(companyId, operationId);
      }
      operations.length = 0;

      for (const { companyId, employeeId } of [...employees].reverse()) {
        await deleteEmployeeCascade(companyId, employeeId);
      }
      employees.length = 0;

      for (const companyId of [...companies].reverse()) {
        await deleteCompanyCascade(companyId);
      }
      companies.length = 0;
    },
  };
};
