import sql from "mssql";
import { ABSENCE_REQUEST_PENDING_STATUS_LABEL } from "../constants/admin-alert";
import { getPool } from "../database/connection";
import type {
  AdminAlertOutboxObligation,
  AdminAlertRequestTemplatePayload,
  MissingCheckinCandidate,
} from "../types/admin-alert";

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapOperationalPayload = (record: Record<string, unknown>) => ({
  employeeName: String(record.employee_name),
  serviceName: String(record.service_name),
  serviceAddress: record.service_address ? String(record.service_address) : null,
  serviceLocality: record.service_locality ? String(record.service_locality) : null,
  scheduledStart: toIso(record.scheduled_start as Date | string),
  scheduledEnd:
    record.scheduled_end === null || record.scheduled_end === undefined
      ? null
      : toIso(record.scheduled_end as Date | string),
  operationTimezone: record.operation_timezone
    ? String(record.operation_timezone)
    : undefined,
});

/**
 * Reconciliation queries return only missing event×recipient obligations
 * (anti-join against outbox), filtered by admin_alerts_enabled_at and
 * recipient.created_at <= event.occurred_at. Ordered ASC for progress.
 */
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
        scheduledStart: toIso(record.scheduled_start as Date | string),
        scheduledEnd:
          record.scheduled_end === null || record.scheduled_end === undefined
            ? null
            : toIso(record.scheduled_end as Date | string),
        operationTimezone: String(record.operation_timezone ?? "America/Argentina/Buenos_Aires"),
      };
    });
  },

  async listMissingUnavailableObligations(
    batchSize = 50,
  ): Promise<AdminAlertOutboxObligation[]> {
    const result = await getPool()
      .request()
      .input("batchSize", sql.Int, batchSize)
      .query(`
        SELECT TOP (@batchSize)
          oa.company_id,
          car.id AS recipient_id,
          car.phone_number AS recipient_phone,
          oa.id AS assignment_id,
          oa.employee_id,
          oa.operation_id,
          oa.confirmation_schedule_version AS schedule_version,
          e.name AS employee_name,
          s.name AS service_name,
          s.address AS service_address,
          s.locality AS service_locality,
          i.scheduled_start,
          i.scheduled_end,
          oa.unavailable_at AS occurred_at,
          CONCAT(
            N'unavailable:',
            LOWER(CONVERT(NVARCHAR(36), oa.id)),
            N':',
            CAST(oa.confirmation_schedule_version AS NVARCHAR(20))
          ) AS deduplication_key
        FROM operation_assignments oa
        INNER JOIN company_settings cs
          ON cs.company_id = oa.company_id
          AND cs.admin_alerts_enabled = 1
          AND cs.admin_alerts_enabled_at IS NOT NULL
        INNER JOIN company_alert_recipients car
          ON car.company_id = oa.company_id
          AND car.is_enabled = 1
          AND car.receive_operational_alerts = 1
          AND car.created_at <= oa.unavailable_at
        INNER JOIN scheduled_operations i
          ON i.id = oa.operation_id AND i.company_id = oa.company_id
        INNER JOIN employees e
          ON e.id = oa.employee_id AND e.company_id = oa.company_id
        INNER JOIN services s
          ON s.id = i.service_id AND s.company_id = oa.company_id
        WHERE oa.confirmation_status = N'UNAVAILABLE'
          AND oa.cancelled_at IS NULL
          AND oa.unavailable_at IS NOT NULL
          AND oa.unavailable_at >= cs.admin_alerts_enabled_at
          AND NOT EXISTS (
            SELECT 1
            FROM whatsapp_admin_alert_notifications n
            WHERE n.company_id = oa.company_id
              AND n.recipient_id = car.id
              AND n.deduplication_key = CONCAT(
                N'unavailable:',
                LOWER(CONVERT(NVARCHAR(36), oa.id)),
                N':',
                CAST(oa.confirmation_schedule_version AS NVARCHAR(20))
              )
          )
        ORDER BY oa.unavailable_at ASC, oa.id ASC, car.id ASC
      `);

    return result.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      const occurredAt = toIso(record.occurred_at as Date | string);
      return {
        companyId: String(record.company_id),
        recipientId: String(record.recipient_id),
        recipientPhone: String(record.recipient_phone),
        alertType: "EMPLOYEE_UNAVAILABLE" as const,
        category: "OPERATIONAL" as const,
        severity: "INFO" as const,
        employeeId: String(record.employee_id),
        operationId: String(record.operation_id),
        absenceRequestId: null,
        deduplicationKey: String(record.deduplication_key),
        occurredAt,
        payload: mapOperationalPayload(record),
      };
    });
  },

  async listMissingPendingAbsenceObligations(
    batchSize = 50,
  ): Promise<AdminAlertOutboxObligation[]> {
    const result = await getPool()
      .request()
      .input("batchSize", sql.Int, batchSize)
      .query(`
        SELECT TOP (@batchSize)
          ar.company_id,
          car.id AS recipient_id,
          car.phone_number AS recipient_phone,
          ar.id AS request_id,
          ar.employee_id,
          e.name AS employee_name,
          at.name AS absence_type_name,
          ar.start_date,
          ar.end_date,
          ar.created_at AS occurred_at,
          CONCAT(N'absence-pending:', LOWER(CONVERT(NVARCHAR(36), ar.id))) AS deduplication_key
        FROM absence_requests ar
        INNER JOIN company_settings cs
          ON cs.company_id = ar.company_id
          AND cs.admin_alerts_enabled = 1
          AND cs.admin_alerts_enabled_at IS NOT NULL
        INNER JOIN company_alert_recipients car
          ON car.company_id = ar.company_id
          AND car.is_enabled = 1
          AND car.receive_request_alerts = 1
          AND car.created_at <= ar.created_at
        INNER JOIN employees e
          ON e.id = ar.employee_id AND e.company_id = ar.company_id
        INNER JOIN absence_types at
          ON at.id = ar.absence_type_id AND at.company_id = ar.company_id
        WHERE ar.status = N'PENDING'
          AND ar.requested_via = N'WHATSAPP'
          AND ar.created_at >= cs.admin_alerts_enabled_at
          AND NOT EXISTS (
            SELECT 1
            FROM whatsapp_admin_alert_notifications n
            WHERE n.company_id = ar.company_id
              AND n.recipient_id = car.id
              AND n.deduplication_key = CONCAT(
                N'absence-pending:',
                LOWER(CONVERT(NVARCHAR(36), ar.id))
              )
          )
        ORDER BY ar.created_at ASC, ar.id ASC, car.id ASC
      `);

    return result.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      const startDate = String(record.start_date).slice(0, 10);
      const endDate = String(record.end_date).slice(0, 10);
      return {
        companyId: String(record.company_id),
        recipientId: String(record.recipient_id),
        recipientPhone: String(record.recipient_phone),
        alertType: "ABSENCE_REQUEST_PENDING" as const,
        category: "REQUEST" as const,
        severity: "INFO" as const,
        employeeId: String(record.employee_id),
        operationId: null,
        absenceRequestId: String(record.request_id),
        deduplicationKey: String(record.deduplication_key),
        occurredAt: toIso(record.occurred_at as Date | string),
        payload: {
          employeeName: String(record.employee_name),
          absenceTypeName: String(record.absence_type_name),
          startDate,
          endDate,
          statusLabel: ABSENCE_REQUEST_PENDING_STATUS_LABEL,
        } satisfies AdminAlertRequestTemplatePayload,
      };
    });
  },

  async listMissingMissingCheckinObligations(
    batchSize = 50,
  ): Promise<AdminAlertOutboxObligation[]> {
    const result = await getPool()
      .request()
      .input("batchSize", sql.Int, batchSize)
      .query(`
        SELECT TOP (@batchSize)
          i.company_id,
          car.id AS recipient_id,
          car.phone_number AS recipient_phone,
          ew.id AS employee_workday_id,
          ew.employee_id,
          e.name AS employee_name,
          i.id AS operation_id,
          s.name AS service_name,
          s.address AS service_address,
          s.locality AS service_locality,
          ow.expected_start_at AS scheduled_start,
          ow.expected_end_at AS scheduled_end,
          cs.operation_timezone,
          COALESCE(i.scheduled_end, i.scheduled_start) AS occurred_at,
          CONCAT(N'missing-checkin:', LOWER(CONVERT(NVARCHAR(36), ew.id))) AS deduplication_key
        FROM scheduled_operations i
        INNER JOIN company_settings cs
          ON cs.company_id = i.company_id
          AND cs.admin_alerts_enabled = 1
          AND cs.admin_alerts_enabled_at IS NOT NULL
        INNER JOIN operation_workdays ow
          ON ow.operation_id = i.id AND ow.company_id = i.company_id AND ow.status = N'ACTIVE'
        INNER JOIN employee_workdays ew
          ON ew.operation_workday_id = ow.id AND ew.company_id = i.company_id
          AND ew.expectation_status = N'EXPECTED'
        INNER JOIN operation_assignments oa
          ON oa.id = ew.operation_assignment_id AND oa.company_id = i.company_id
          AND oa.cancelled_at IS NULL
          AND oa.confirmation_status <> N'UNAVAILABLE'
        INNER JOIN employees e
          ON e.id = ew.employee_id AND e.company_id = i.company_id
        INNER JOIN services s
          ON s.id = i.service_id AND s.company_id = i.company_id
        INNER JOIN company_alert_recipients car
          ON car.company_id = i.company_id
          AND car.is_enabled = 1
          AND car.receive_operational_alerts = 1
          AND car.created_at <= COALESCE(i.scheduled_end, i.scheduled_start)
        WHERE i.operation_kind = N'ONE_TIME'
          AND i.status = N'COMPLETED'
          AND COALESCE(i.scheduled_end, i.scheduled_start) >= cs.admin_alerts_enabled_at
          AND NOT EXISTS (
            SELECT 1
            FROM attendance_records ar
            WHERE ar.employee_workday_id = ew.id
              AND ar.validation_status IN (N'VALID', N'PENDING_REVIEW')
              AND ar.received_at IS NOT NULL
          )
          AND NOT EXISTS (
            SELECT 1
            FROM whatsapp_admin_alert_notifications n
            WHERE n.company_id = i.company_id
              AND n.recipient_id = car.id
              AND n.deduplication_key = CONCAT(
                N'missing-checkin:',
                LOWER(CONVERT(NVARCHAR(36), ew.id))
              )
          )
        ORDER BY COALESCE(i.scheduled_end, i.scheduled_start) ASC, ew.id ASC, car.id ASC
      `);

    return result.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      const payload = mapOperationalPayload(record);
      return {
        companyId: String(record.company_id),
        recipientId: String(record.recipient_id),
        recipientPhone: String(record.recipient_phone),
        alertType: "MISSING_CHECKIN_AFTER_OPERATION" as const,
        category: "OPERATIONAL" as const,
        severity: "INFO" as const,
        employeeId: String(record.employee_id),
        operationId: String(record.operation_id),
        absenceRequestId: null,
        deduplicationKey: String(record.deduplication_key),
        occurredAt: toIso(record.occurred_at as Date | string),
        payload: {
          ...payload,
          operationTimezone: String(
            record.operation_timezone ?? "America/Argentina/Buenos_Aires",
          ),
        },
      };
    });
  },
};

