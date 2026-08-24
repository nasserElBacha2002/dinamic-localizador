import sql from "mssql";
import { getPool } from "../database/connection";
import type { MissingCheckinCandidate } from "../types/admin-alert";

export const adminAlertContextRepository = {
  async getAssignmentScheduleVersion(
    companyId: string,
    assignmentId: string,
  ): Promise<number | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .query(`
        SELECT TOP 1 confirmation_schedule_version
        FROM operation_assignments
        WHERE company_id = @companyId AND id = @assignmentId
      `);
    const row = result.recordset[0] as { confirmation_schedule_version?: number } | undefined;
    return row ? Number(row.confirmation_schedule_version ?? 1) : null;
  },

  async listMissingCheckinCandidatesForOperation(
    companyId: string,
    operationId: string,
  ): Promise<MissingCheckinCandidate[]> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .query(`
        SELECT
          ew.id AS employee_workday_id,
          ew.employee_id,
          e.name AS employee_name,
          i.id AS operation_id,
          s.name AS service_name,
          s.address AS service_address,
          s.locality AS service_locality,
          ow.expected_start_at AS scheduled_start,
          ow.expected_end_at AS scheduled_end,
          cs.operation_timezone
        FROM operation_workdays ow
        INNER JOIN scheduled_operations i
          ON i.id = ow.operation_id AND i.company_id = @companyId
        INNER JOIN employee_workdays ew
          ON ew.operation_workday_id = ow.id AND ew.company_id = @companyId
        INNER JOIN employees e
          ON e.id = ew.employee_id AND e.company_id = @companyId
        INNER JOIN operation_assignments oa
          ON oa.id = ew.operation_assignment_id AND oa.company_id = @companyId
        INNER JOIN services s
          ON s.id = i.service_id AND s.company_id = @companyId
        INNER JOIN company_settings cs
          ON cs.company_id = @companyId
        WHERE ow.operation_id = @operationId
          AND ow.company_id = @companyId
          AND ow.status = 'ACTIVE'
          AND ew.expectation_status = 'EXPECTED'
          AND oa.cancelled_at IS NULL
          AND oa.confirmation_status <> 'UNAVAILABLE'
          AND NOT EXISTS (
            SELECT 1
            FROM attendance_records ar
            WHERE ar.employee_workday_id = ew.id
              AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
          )
      `);

    return result.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        employeeWorkdayId: String(record.employee_workday_id),
        employeeId: String(record.employee_id),
        employeeName: String(record.employee_name),
        operationId: String(record.operation_id),
        serviceName: String(record.service_name),
        serviceAddress: record.service_address ? String(record.service_address) : null,
        serviceLocality: record.service_locality ? String(record.service_locality) : null,
        scheduledStart: new Date(record.scheduled_start as Date | string).toISOString(),
        scheduledEnd:
          record.scheduled_end === null || record.scheduled_end === undefined
            ? null
            : new Date(record.scheduled_end as Date | string).toISOString(),
        operationTimezone: String(record.operation_timezone ?? "America/Argentina/Buenos_Aires"),
      };
    });
  },
};
