import sql from "mssql";
import { getPool } from "../database/connection";
import type { AdminAlertOutboxObligation } from "../types/admin-alert";
import { minutesBetween } from "../utils/admin-alert/dynamic-attendance-due-at";
import {
  buildConfirmationMissingDedupKey,
  buildMissingCheckinAfterStartDedupKey,
  buildMissingCheckoutAfterEndDedupKey,
} from "../utils/admin-alert/dedup-keys";

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const WORKDAY_SCHEDULE_VERSION_SQL = `
  CASE
    WHEN i.operation_kind = N'RECURRING' THEN
      (YEAR(ow.work_date) * 10000 + MONTH(ow.work_date) * 100 + DAY(ow.work_date))
    ELSE ow.schedule_version
  END
`;

const mapOperationalPayload = (
  record: Record<string, unknown>,
  extras?: { minutesUntilStart?: number; minutesLate?: number },
) => ({
  employeeName: String(record.employee_name),
  serviceName: String(record.service_name),
  serviceAddress: record.service_address ? String(record.service_address) : null,
  serviceLocality: record.service_locality ? String(record.service_locality) : null,
  scheduledStart: toIso(record.scheduled_start as Date | string),
  scheduledEnd:
    record.scheduled_end === null || record.scheduled_end === undefined
      ? null
      : toIso(record.scheduled_end as Date | string),
  operationTimezone: String(record.operation_timezone ?? "America/Argentina/Buenos_Aires"),
  ...extras,
});

/**
 * Dynamic admin attendance alert candidate queries.
 * dueAt window: dueAt <= @referenceAt AND dueAt >= @referenceAt - maxLateness
 * plus dueAt >= admin_alerts_enabled_at (no historical backfill).
 */
export const adminDynamicAttendanceAlertRepository = {
  async listConfirmationMissingObligations(
    referenceAt: Date,
    batchSize = 50,
  ): Promise<AdminAlertOutboxObligation[]> {
    const result = await getPool()
      .request()
      .input("referenceAt", sql.DateTime2, referenceAt)
      .input("batchSize", sql.Int, batchSize)
      .query(`
        SELECT TOP (@batchSize)
          i.company_id,
          car.id AS recipient_id,
          car.phone_number AS recipient_phone,
          oa.id AS assignment_id,
          oa.employee_id,
          e.name AS employee_name,
          i.id AS operation_id,
          s.name AS service_name,
          s.address AS service_address,
          s.locality AS service_locality,
          i.scheduled_start,
          i.scheduled_end,
          cs.operation_timezone,
          oa.confirmation_schedule_version AS schedule_version,
          DATEADD(MINUTE, -cs.admin_confirmation_escalation_minutes, i.scheduled_start) AS due_at,
          CONCAT(
            N'confirmation-missing:',
            LOWER(CONVERT(NVARCHAR(36), oa.id)),
            N':',
            CAST(oa.confirmation_schedule_version AS NVARCHAR(20))
          ) AS deduplication_key
        FROM operation_assignments oa
        INNER JOIN company_settings cs
          ON cs.company_id = oa.company_id
          AND cs.admin_alerts_enabled = 1
          AND cs.admin_alerts_enabled_at IS NOT NULL
          AND cs.admin_attendance_confirmation_missing_enabled = 1
        INNER JOIN scheduled_operations i
          ON i.id = oa.operation_id AND i.company_id = oa.company_id
        INNER JOIN operational_locations s
          ON s.id = i.service_id AND s.company_id = oa.company_id
        INNER JOIN employees e
          ON e.id = oa.employee_id AND e.company_id = oa.company_id
        INNER JOIN company_alert_recipients car
          ON car.company_id = oa.company_id
          AND car.is_enabled = 1
          AND car.receive_operational_alerts = 1
          AND car.created_at <= DATEADD(
            MINUTE, -cs.admin_confirmation_escalation_minutes, i.scheduled_start
          )
        WHERE i.operation_kind = N'ONE_TIME'
          AND i.status NOT IN (N'CANCELLED', N'COMPLETED')
          AND oa.cancelled_at IS NULL
          AND oa.confirmation_status = N'PENDING'
          AND e.active = 1
          AND s.active = 1
          AND NOT EXISTS (
            SELECT 1
            FROM employee_workdays ewj
            INNER JOIN operation_workdays owj
              ON owj.id = ewj.operation_workday_id AND owj.company_id = ewj.company_id
            WHERE ewj.company_id = oa.company_id
              AND ewj.employee_id = oa.employee_id
              AND owj.operation_id = i.id
              AND ewj.expectation_status = N'JUSTIFIED'
          )
          AND DATEADD(MINUTE, -cs.admin_confirmation_escalation_minutes, i.scheduled_start)
            <= @referenceAt
          AND DATEADD(MINUTE, -cs.admin_confirmation_escalation_minutes, i.scheduled_start)
            >= DATEADD(MINUTE, -cs.admin_alert_max_lateness_minutes, @referenceAt)
          AND DATEADD(MINUTE, -cs.admin_confirmation_escalation_minutes, i.scheduled_start)
            >= cs.admin_alerts_enabled_at
          AND NOT EXISTS (
            SELECT 1
            FROM attendance_records ar
            INNER JOIN employee_workdays ew
              ON ew.id = ar.employee_workday_id AND ew.company_id = ar.company_id
            INNER JOIN operation_workdays ow
              ON ow.id = ew.operation_workday_id AND ow.company_id = ew.company_id
            WHERE ar.company_id = oa.company_id
              AND ar.employee_id = oa.employee_id
              AND ow.operation_id = i.id
              AND ar.validation_status IN (N'VALID', N'PENDING_REVIEW')
              AND ar.is_simulation = 0
          )
          AND NOT EXISTS (
            SELECT 1
            FROM whatsapp_admin_alert_notifications n
            WHERE n.company_id = oa.company_id
              AND n.recipient_id = car.id
              AND n.deduplication_key = CONCAT(
                N'confirmation-missing:',
                LOWER(CONVERT(NVARCHAR(36), oa.id)),
                N':',
                CAST(oa.confirmation_schedule_version AS NVARCHAR(20))
              )
          )
        ORDER BY due_at ASC, oa.id ASC, car.id ASC
      `);

    return result.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      const dueAt = toIso(record.due_at as Date | string);
      const scheduledStart = toIso(record.scheduled_start as Date | string);
      return {
        companyId: String(record.company_id),
        recipientId: String(record.recipient_id),
        recipientPhone: String(record.recipient_phone),
        alertType: "ATTENDANCE_CONFIRMATION_MISSING" as const,
        category: "OPERATIONAL" as const,
        severity: "INFO" as const,
        employeeId: String(record.employee_id),
        operationId: String(record.operation_id),
        absenceRequestId: null,
        assignmentId: String(record.assignment_id),
        employeeWorkdayId: null,
        deduplicationKey:
          String(record.deduplication_key) ||
          buildConfirmationMissingDedupKey(
            String(record.assignment_id),
            Number(record.schedule_version),
          ),
        occurredAt: dueAt,
        dueAt,
        payload: mapOperationalPayload(record, {
          minutesUntilStart: minutesBetween(new Date(dueAt), new Date(scheduledStart)),
        }),
      };
    });
  },

  async listMissingCheckinAfterStartObligations(
    referenceAt: Date,
    batchSize = 50,
  ): Promise<AdminAlertOutboxObligation[]> {
    const result = await getPool()
      .request()
      .input("referenceAt", sql.DateTime2, referenceAt)
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
          oa.id AS assignment_id,
          s.name AS service_name,
          s.address AS service_address,
          s.locality AS service_locality,
          ow.expected_start_at AS scheduled_start,
          ow.expected_end_at AS scheduled_end,
          cs.operation_timezone,
          i.late_tolerance_minutes,
          (${WORKDAY_SCHEDULE_VERSION_SQL}) AS schedule_version,
          DATEADD(MINUTE, i.late_tolerance_minutes, ow.expected_start_at) AS due_at,
          CONCAT(
            N'missing-checkin-after-start:',
            LOWER(CONVERT(NVARCHAR(36), ew.id)),
            N':',
            CAST((${WORKDAY_SCHEDULE_VERSION_SQL}) AS NVARCHAR(20))
          ) AS deduplication_key
        FROM employee_workdays ew
        INNER JOIN operation_workdays ow
          ON ow.id = ew.operation_workday_id AND ow.company_id = ew.company_id
          AND ow.status = N'ACTIVE'
        INNER JOIN scheduled_operations i
          ON i.id = ow.operation_id AND i.company_id = ew.company_id
        INNER JOIN company_settings cs
          ON cs.company_id = ew.company_id
          AND cs.admin_alerts_enabled = 1
          AND cs.admin_alerts_enabled_at IS NOT NULL
          AND cs.admin_missing_checkin_enabled = 1
        INNER JOIN operation_assignments oa
          ON oa.id = ew.operation_assignment_id AND oa.company_id = ew.company_id
          AND oa.cancelled_at IS NULL
          AND oa.confirmation_status <> N'UNAVAILABLE'
        INNER JOIN employees e
          ON e.id = ew.employee_id AND e.company_id = ew.company_id
        INNER JOIN operational_locations s
          ON s.id = i.service_id AND s.company_id = ew.company_id
        INNER JOIN company_alert_recipients car
          ON car.company_id = ew.company_id
          AND car.is_enabled = 1
          AND car.receive_operational_alerts = 1
          AND car.created_at <= DATEADD(MINUTE, i.late_tolerance_minutes, ow.expected_start_at)
        WHERE ew.expectation_status = N'EXPECTED'
          AND i.status NOT IN (N'CANCELLED')
          AND i.operation_kind IN (N'ONE_TIME', N'RECURRING')
          AND e.active = 1
          AND s.active = 1
          AND ow.work_date >= oa.valid_from
          AND (oa.valid_until IS NULL OR ow.work_date <= oa.valid_until)
          AND DATEADD(MINUTE, i.late_tolerance_minutes, ow.expected_start_at) <= @referenceAt
          AND DATEADD(MINUTE, i.late_tolerance_minutes, ow.expected_start_at)
            >= DATEADD(MINUTE, -cs.admin_alert_max_lateness_minutes, @referenceAt)
          AND DATEADD(MINUTE, i.late_tolerance_minutes, ow.expected_start_at)
            >= cs.admin_alerts_enabled_at
          AND NOT EXISTS (
            SELECT 1
            FROM attendance_records ar
            WHERE ar.employee_workday_id = ew.id
              AND ar.company_id = ew.company_id
              AND ar.validation_status IN (N'VALID', N'PENDING_REVIEW')
              AND ar.received_at IS NOT NULL
              AND ar.is_simulation = 0
          )
          AND NOT EXISTS (
            SELECT 1
            FROM whatsapp_admin_alert_notifications n
            WHERE n.company_id = ew.company_id
              AND n.recipient_id = car.id
              AND n.deduplication_key = CONCAT(
                N'missing-checkin-after-start:',
                LOWER(CONVERT(NVARCHAR(36), ew.id)),
                N':',
                CAST((${WORKDAY_SCHEDULE_VERSION_SQL}) AS NVARCHAR(20))
              )
          )
        ORDER BY due_at ASC, ew.id ASC, car.id ASC
      `);

    return result.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      const dueAt = toIso(record.due_at as Date | string);
      const scheduledStart = toIso(record.scheduled_start as Date | string);
      const scheduleVersion = Number(record.schedule_version);
      return {
        companyId: String(record.company_id),
        recipientId: String(record.recipient_id),
        recipientPhone: String(record.recipient_phone),
        alertType: "MISSING_CHECKIN_AFTER_START" as const,
        category: "OPERATIONAL" as const,
        severity: "INFO" as const,
        employeeId: String(record.employee_id),
        operationId: String(record.operation_id),
        absenceRequestId: null,
        assignmentId: record.assignment_id ? String(record.assignment_id) : null,
        employeeWorkdayId: String(record.employee_workday_id),
        deduplicationKey:
          String(record.deduplication_key) ||
          buildMissingCheckinAfterStartDedupKey(String(record.employee_workday_id), scheduleVersion),
        occurredAt: dueAt,
        dueAt,
        payload: mapOperationalPayload(record, {
          minutesLate: minutesBetween(new Date(scheduledStart), new Date(dueAt)),
        }),
      };
    });
  },

  async listMissingCheckoutAfterEndObligations(
    referenceAt: Date,
    batchSize = 50,
  ): Promise<AdminAlertOutboxObligation[]> {
    const result = await getPool()
      .request()
      .input("referenceAt", sql.DateTime2, referenceAt)
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
          oa.id AS assignment_id,
          s.name AS service_name,
          s.address AS service_address,
          s.locality AS service_locality,
          ow.expected_start_at AS scheduled_start,
          ow.expected_end_at AS scheduled_end,
          cs.operation_timezone,
          (${WORKDAY_SCHEDULE_VERSION_SQL}) AS schedule_version,
          DATEADD(MINUTE, cs.admin_missing_checkout_delay_minutes, ow.expected_end_at) AS due_at,
          CONCAT(
            N'missing-checkout-after-end:',
            LOWER(CONVERT(NVARCHAR(36), ew.id)),
            N':',
            CAST((${WORKDAY_SCHEDULE_VERSION_SQL}) AS NVARCHAR(20))
          ) AS deduplication_key
        FROM employee_workdays ew
        INNER JOIN operation_workdays ow
          ON ow.id = ew.operation_workday_id AND ow.company_id = ew.company_id
          AND ow.status = N'ACTIVE'
          AND ow.expected_end_at IS NOT NULL
        INNER JOIN scheduled_operations i
          ON i.id = ow.operation_id AND i.company_id = ew.company_id
        INNER JOIN company_settings cs
          ON cs.company_id = ew.company_id
          AND cs.admin_alerts_enabled = 1
          AND cs.admin_alerts_enabled_at IS NOT NULL
          AND cs.admin_missing_checkout_enabled = 1
        INNER JOIN operation_assignments oa
          ON oa.id = ew.operation_assignment_id AND oa.company_id = ew.company_id
          AND oa.cancelled_at IS NULL
        INNER JOIN employees e
          ON e.id = ew.employee_id AND e.company_id = ew.company_id
        INNER JOIN operational_locations s
          ON s.id = i.service_id AND s.company_id = ew.company_id
        INNER JOIN attendance_records ar
          ON ar.employee_workday_id = ew.id
          AND ar.company_id = ew.company_id
          AND ar.validation_status IN (N'VALID', N'PENDING_REVIEW')
          AND ar.received_at IS NOT NULL
          AND ar.checkout_at IS NULL
          AND ar.is_simulation = 0
        INNER JOIN company_alert_recipients car
          ON car.company_id = ew.company_id
          AND car.is_enabled = 1
          AND car.receive_operational_alerts = 1
          AND car.created_at <= DATEADD(
            MINUTE, cs.admin_missing_checkout_delay_minutes, ow.expected_end_at
          )
        WHERE ew.expectation_status = N'EXPECTED'
          AND i.status NOT IN (N'CANCELLED')
          AND i.operation_kind IN (N'ONE_TIME', N'RECURRING')
          AND e.active = 1
          AND s.active = 1
          AND ow.work_date >= oa.valid_from
          AND (oa.valid_until IS NULL OR ow.work_date <= oa.valid_until)
          AND DATEADD(MINUTE, cs.admin_missing_checkout_delay_minutes, ow.expected_end_at)
            <= @referenceAt
          AND DATEADD(MINUTE, cs.admin_missing_checkout_delay_minutes, ow.expected_end_at)
            >= DATEADD(MINUTE, -cs.admin_alert_max_lateness_minutes, @referenceAt)
          AND DATEADD(MINUTE, cs.admin_missing_checkout_delay_minutes, ow.expected_end_at)
            >= cs.admin_alerts_enabled_at
          AND NOT EXISTS (
            SELECT 1
            FROM whatsapp_admin_alert_notifications n
            WHERE n.company_id = ew.company_id
              AND n.recipient_id = car.id
              AND n.deduplication_key = CONCAT(
                N'missing-checkout-after-end:',
                LOWER(CONVERT(NVARCHAR(36), ew.id)),
                N':',
                CAST((${WORKDAY_SCHEDULE_VERSION_SQL}) AS NVARCHAR(20))
              )
          )
        ORDER BY due_at ASC, ew.id ASC, car.id ASC
      `);

    return result.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      const dueAt = toIso(record.due_at as Date | string);
      const scheduledEnd = record.scheduled_end
        ? toIso(record.scheduled_end as Date | string)
        : dueAt;
      const scheduleVersion = Number(record.schedule_version);
      return {
        companyId: String(record.company_id),
        recipientId: String(record.recipient_id),
        recipientPhone: String(record.recipient_phone),
        alertType: "MISSING_CHECKOUT_AFTER_END" as const,
        category: "OPERATIONAL" as const,
        severity: "INFO" as const,
        employeeId: String(record.employee_id),
        operationId: String(record.operation_id),
        absenceRequestId: null,
        assignmentId: record.assignment_id ? String(record.assignment_id) : null,
        employeeWorkdayId: String(record.employee_workday_id),
        deduplicationKey:
          String(record.deduplication_key) ||
          buildMissingCheckoutAfterEndDedupKey(String(record.employee_workday_id), scheduleVersion),
        occurredAt: dueAt,
        dueAt,
        payload: mapOperationalPayload(record, {
          minutesLate: minutesBetween(new Date(scheduledEnd), new Date(dueAt)),
        }),
      };
    });
  },

  /**
   * Obligations whose dueAt is already past max lateness but still within a bounded
   * lookback (max(maxLateness, 120) minutes beyond the window). Materialized as EXPIRED.
   */
  async listExpiredConfirmationMissingObligations(
    referenceAt: Date,
    batchSize = 50,
  ): Promise<AdminAlertOutboxObligation[]> {
    const result = await getPool()
      .request()
      .input("referenceAt", sql.DateTime2, referenceAt)
      .input("batchSize", sql.Int, batchSize)
      .query(`
        SELECT TOP (@batchSize)
          i.company_id,
          car.id AS recipient_id,
          car.phone_number AS recipient_phone,
          oa.id AS assignment_id,
          oa.employee_id,
          e.name AS employee_name,
          i.id AS operation_id,
          s.name AS service_name,
          s.address AS service_address,
          s.locality AS service_locality,
          i.scheduled_start,
          i.scheduled_end,
          cs.operation_timezone,
          oa.confirmation_schedule_version AS schedule_version,
          DATEADD(MINUTE, -cs.admin_confirmation_escalation_minutes, i.scheduled_start) AS due_at,
          CONCAT(
            N'confirmation-missing:',
            LOWER(CONVERT(NVARCHAR(36), oa.id)),
            N':',
            CAST(oa.confirmation_schedule_version AS NVARCHAR(20))
          ) AS deduplication_key
        FROM operation_assignments oa
        INNER JOIN company_settings cs
          ON cs.company_id = oa.company_id
          AND cs.admin_alerts_enabled = 1
          AND cs.admin_alerts_enabled_at IS NOT NULL
          AND cs.admin_attendance_confirmation_missing_enabled = 1
        INNER JOIN scheduled_operations i
          ON i.id = oa.operation_id AND i.company_id = oa.company_id
        INNER JOIN operational_locations s
          ON s.id = i.service_id AND s.company_id = oa.company_id
        INNER JOIN employees e
          ON e.id = oa.employee_id AND e.company_id = oa.company_id
        INNER JOIN company_alert_recipients car
          ON car.company_id = oa.company_id
          AND car.is_enabled = 1
          AND car.receive_operational_alerts = 1
        WHERE i.operation_kind = N'ONE_TIME'
          AND oa.cancelled_at IS NULL
          AND DATEADD(MINUTE, -cs.admin_confirmation_escalation_minutes, i.scheduled_start)
            < DATEADD(MINUTE, -cs.admin_alert_max_lateness_minutes, @referenceAt)
          AND DATEADD(MINUTE, -cs.admin_confirmation_escalation_minutes, i.scheduled_start)
            >= DATEADD(
              MINUTE,
              -(cs.admin_alert_max_lateness_minutes + CASE
                WHEN cs.admin_alert_max_lateness_minutes > 120 THEN cs.admin_alert_max_lateness_minutes
                ELSE 120
              END),
              @referenceAt
            )
          AND DATEADD(MINUTE, -cs.admin_confirmation_escalation_minutes, i.scheduled_start)
            >= cs.admin_alerts_enabled_at
          AND NOT EXISTS (
            SELECT 1
            FROM whatsapp_admin_alert_notifications n
            WHERE n.company_id = oa.company_id
              AND n.recipient_id = car.id
              AND n.deduplication_key = CONCAT(
                N'confirmation-missing:',
                LOWER(CONVERT(NVARCHAR(36), oa.id)),
                N':',
                CAST(oa.confirmation_schedule_version AS NVARCHAR(20))
              )
          )
        ORDER BY due_at ASC, oa.id ASC, car.id ASC
      `);

    return result.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      const dueAt = toIso(record.due_at as Date | string);
      return {
        companyId: String(record.company_id),
        recipientId: String(record.recipient_id),
        recipientPhone: String(record.recipient_phone),
        alertType: "ATTENDANCE_CONFIRMATION_MISSING" as const,
        category: "OPERATIONAL" as const,
        severity: "INFO" as const,
        employeeId: String(record.employee_id),
        operationId: String(record.operation_id),
        absenceRequestId: null,
        assignmentId: String(record.assignment_id),
        employeeWorkdayId: null,
        deduplicationKey: String(record.deduplication_key),
        occurredAt: dueAt,
        dueAt,
        enqueueAsExpired: true,
        latenessMinutes: minutesBetween(new Date(dueAt), referenceAt),
        payload: mapOperationalPayload(record),
      };
    });
  },

  async listExpiredMissingCheckinAfterStartObligations(
    referenceAt: Date,
    batchSize = 50,
  ): Promise<AdminAlertOutboxObligation[]> {
    const result = await getPool()
      .request()
      .input("referenceAt", sql.DateTime2, referenceAt)
      .input("batchSize", sql.Int, batchSize)
      .query(`
        ;WITH incidents AS (
          SELECT TOP (@batchSize)
            ew.id AS employee_workday_id,
            ew.employee_id,
            e.name AS employee_name,
            i.company_id,
            i.id AS operation_id,
            oa.id AS assignment_id,
            s.name AS service_name,
            s.address AS service_address,
            s.locality AS service_locality,
            ow.expected_start_at AS scheduled_start,
            ow.expected_end_at AS scheduled_end,
            cs.operation_timezone,
            (${WORKDAY_SCHEDULE_VERSION_SQL}) AS schedule_version,
            DATEADD(MINUTE, i.late_tolerance_minutes, ow.expected_start_at) AS due_at
          FROM employee_workdays ew
          INNER JOIN operation_workdays ow
            ON ow.id = ew.operation_workday_id AND ow.company_id = ew.company_id
            AND ow.status = N'ACTIVE'
          INNER JOIN scheduled_operations i
            ON i.id = ow.operation_id AND i.company_id = ew.company_id
          INNER JOIN company_settings cs
            ON cs.company_id = ew.company_id
            AND cs.admin_alerts_enabled = 1
            AND cs.admin_alerts_enabled_at IS NOT NULL
            AND cs.admin_missing_checkin_enabled = 1
          INNER JOIN operation_assignments oa
            ON oa.id = ew.operation_assignment_id AND oa.company_id = ew.company_id
            AND oa.cancelled_at IS NULL
            AND oa.confirmation_status <> N'UNAVAILABLE'
          INNER JOIN employees e
            ON e.id = ew.employee_id AND e.company_id = ew.company_id
          INNER JOIN operational_locations s
            ON s.id = i.service_id AND s.company_id = ew.company_id
          WHERE ew.expectation_status = N'EXPECTED'
            AND i.status NOT IN (N'CANCELLED')
            AND i.operation_kind IN (N'ONE_TIME', N'RECURRING')
            AND e.active = 1
            AND s.active = 1
            AND ow.work_date >= oa.valid_from
            AND (oa.valid_until IS NULL OR ow.work_date <= oa.valid_until)
            AND DATEADD(MINUTE, i.late_tolerance_minutes, ow.expected_start_at)
              < DATEADD(MINUTE, -cs.admin_alert_max_lateness_minutes, @referenceAt)
            AND DATEADD(MINUTE, i.late_tolerance_minutes, ow.expected_start_at)
              >= DATEADD(
                MINUTE,
                -(cs.admin_alert_max_lateness_minutes + CASE
                  WHEN cs.admin_alert_max_lateness_minutes > 120 THEN cs.admin_alert_max_lateness_minutes
                  ELSE 120
                END),
                @referenceAt
              )
            AND DATEADD(MINUTE, i.late_tolerance_minutes, ow.expected_start_at)
              >= cs.admin_alerts_enabled_at
            AND NOT EXISTS (
              SELECT 1
              FROM attendance_records ar
              WHERE ar.employee_workday_id = ew.id
                AND ar.company_id = ew.company_id
                AND ar.validation_status IN (N'VALID', N'PENDING_REVIEW')
                AND ar.received_at IS NOT NULL
                AND ar.is_simulation = 0
            )
          ORDER BY due_at ASC, ew.id ASC
        )
        SELECT
          i.*,
          car.id AS recipient_id,
          car.phone_number AS recipient_phone,
          CONCAT(
            N'missing-checkin-after-start:',
            LOWER(CONVERT(NVARCHAR(36), i.employee_workday_id)),
            N':',
            CAST(i.schedule_version AS NVARCHAR(20))
          ) AS deduplication_key
        FROM incidents i
        INNER JOIN company_alert_recipients car
          ON car.company_id = i.company_id
          AND car.is_enabled = 1
          AND car.receive_operational_alerts = 1
        WHERE NOT EXISTS (
          SELECT 1
          FROM whatsapp_admin_alert_notifications n
          WHERE n.company_id = i.company_id
            AND n.recipient_id = car.id
            AND n.deduplication_key = CONCAT(
              N'missing-checkin-after-start:',
              LOWER(CONVERT(NVARCHAR(36), i.employee_workday_id)),
              N':',
              CAST(i.schedule_version AS NVARCHAR(20))
            )
        )
        ORDER BY i.due_at ASC, i.employee_workday_id ASC, car.id ASC
      `);

    return result.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      const dueAt = toIso(record.due_at as Date | string);
      return {
        companyId: String(record.company_id),
        recipientId: String(record.recipient_id),
        recipientPhone: String(record.recipient_phone),
        alertType: "MISSING_CHECKIN_AFTER_START" as const,
        category: "OPERATIONAL" as const,
        severity: "INFO" as const,
        employeeId: String(record.employee_id),
        operationId: String(record.operation_id),
        absenceRequestId: null,
        assignmentId: record.assignment_id ? String(record.assignment_id) : null,
        employeeWorkdayId: String(record.employee_workday_id),
        deduplicationKey: String(record.deduplication_key),
        occurredAt: dueAt,
        dueAt,
        enqueueAsExpired: true,
        latenessMinutes: minutesBetween(new Date(dueAt), referenceAt),
        payload: mapOperationalPayload(record),
      };
    });
  },

  async listExpiredMissingCheckoutAfterEndObligations(
    referenceAt: Date,
    batchSize = 50,
  ): Promise<AdminAlertOutboxObligation[]> {
    const result = await getPool()
      .request()
      .input("referenceAt", sql.DateTime2, referenceAt)
      .input("batchSize", sql.Int, batchSize)
      .query(`
        ;WITH incidents AS (
          SELECT TOP (@batchSize)
            ew.id AS employee_workday_id,
            ew.employee_id,
            e.name AS employee_name,
            i.company_id,
            i.id AS operation_id,
            oa.id AS assignment_id,
            s.name AS service_name,
            s.address AS service_address,
            s.locality AS service_locality,
            ow.expected_start_at AS scheduled_start,
            ow.expected_end_at AS scheduled_end,
            cs.operation_timezone,
            (${WORKDAY_SCHEDULE_VERSION_SQL}) AS schedule_version,
            DATEADD(MINUTE, cs.admin_missing_checkout_delay_minutes, ow.expected_end_at) AS due_at
          FROM employee_workdays ew
          INNER JOIN operation_workdays ow
            ON ow.id = ew.operation_workday_id AND ow.company_id = ew.company_id
            AND ow.status = N'ACTIVE'
            AND ow.expected_end_at IS NOT NULL
          INNER JOIN scheduled_operations i
            ON i.id = ow.operation_id AND i.company_id = ew.company_id
          INNER JOIN company_settings cs
            ON cs.company_id = ew.company_id
            AND cs.admin_alerts_enabled = 1
            AND cs.admin_alerts_enabled_at IS NOT NULL
            AND cs.admin_missing_checkout_enabled = 1
          INNER JOIN operation_assignments oa
            ON oa.id = ew.operation_assignment_id AND oa.company_id = ew.company_id
            AND oa.cancelled_at IS NULL
          INNER JOIN employees e
            ON e.id = ew.employee_id AND e.company_id = ew.company_id
          INNER JOIN operational_locations s
            ON s.id = i.service_id AND s.company_id = ew.company_id
          INNER JOIN attendance_records ar
            ON ar.employee_workday_id = ew.id
            AND ar.company_id = ew.company_id
            AND ar.validation_status IN (N'VALID', N'PENDING_REVIEW')
            AND ar.received_at IS NOT NULL
            AND ar.checkout_at IS NULL
            AND ar.is_simulation = 0
          WHERE ew.expectation_status = N'EXPECTED'
            AND i.status NOT IN (N'CANCELLED')
            AND i.operation_kind IN (N'ONE_TIME', N'RECURRING')
            AND e.active = 1
            AND s.active = 1
            AND ow.work_date >= oa.valid_from
            AND (oa.valid_until IS NULL OR ow.work_date <= oa.valid_until)
            AND DATEADD(MINUTE, cs.admin_missing_checkout_delay_minutes, ow.expected_end_at)
              < DATEADD(MINUTE, -cs.admin_alert_max_lateness_minutes, @referenceAt)
            AND DATEADD(MINUTE, cs.admin_missing_checkout_delay_minutes, ow.expected_end_at)
              >= DATEADD(
                MINUTE,
                -(cs.admin_alert_max_lateness_minutes + CASE
                  WHEN cs.admin_alert_max_lateness_minutes > 120 THEN cs.admin_alert_max_lateness_minutes
                  ELSE 120
                END),
                @referenceAt
              )
            AND DATEADD(MINUTE, cs.admin_missing_checkout_delay_minutes, ow.expected_end_at)
              >= cs.admin_alerts_enabled_at
          ORDER BY due_at ASC, ew.id ASC
        )
        SELECT
          i.*,
          car.id AS recipient_id,
          car.phone_number AS recipient_phone,
          CONCAT(
            N'missing-checkout-after-end:',
            LOWER(CONVERT(NVARCHAR(36), i.employee_workday_id)),
            N':',
            CAST(i.schedule_version AS NVARCHAR(20))
          ) AS deduplication_key
        FROM incidents i
        INNER JOIN company_alert_recipients car
          ON car.company_id = i.company_id
          AND car.is_enabled = 1
          AND car.receive_operational_alerts = 1
        WHERE NOT EXISTS (
          SELECT 1
          FROM whatsapp_admin_alert_notifications n
          WHERE n.company_id = i.company_id
            AND n.recipient_id = car.id
            AND n.deduplication_key = CONCAT(
              N'missing-checkout-after-end:',
              LOWER(CONVERT(NVARCHAR(36), i.employee_workday_id)),
              N':',
              CAST(i.schedule_version AS NVARCHAR(20))
            )
        )
        ORDER BY i.due_at ASC, i.employee_workday_id ASC, car.id ASC
      `);

    return result.recordset.map((row) => {
      const record = row as Record<string, unknown>;
      const dueAt = toIso(record.due_at as Date | string);
      return {
        companyId: String(record.company_id),
        recipientId: String(record.recipient_id),
        recipientPhone: String(record.recipient_phone),
        alertType: "MISSING_CHECKOUT_AFTER_END" as const,
        category: "OPERATIONAL" as const,
        severity: "INFO" as const,
        employeeId: String(record.employee_id),
        operationId: String(record.operation_id),
        absenceRequestId: null,
        assignmentId: record.assignment_id ? String(record.assignment_id) : null,
        employeeWorkdayId: String(record.employee_workday_id),
        deduplicationKey: String(record.deduplication_key),
        occurredAt: dueAt,
        dueAt,
        enqueueAsExpired: true,
        latenessMinutes: minutesBetween(new Date(dueAt), referenceAt),
        payload: mapOperationalPayload(record),
      };
    });
  },

  /**
   * Send-time domain gate using structured identity columns (fallback: dedup regex for legacy rows).
   */
  async getDynamicAlertSendGate(
    companyId: string,
    alertType:
      | "ATTENDANCE_CONFIRMATION_MISSING"
      | "MISSING_CHECKIN_AFTER_START"
      | "MISSING_CHECKOUT_AFTER_END",
    input: {
      operationId: string | null;
      employeeId: string | null;
      assignmentId: string | null;
      employeeWorkdayId: string | null;
      deduplicationKey: string;
    },
  ): Promise<
    | "ELIGIBLE"
    | "RESOLVED_BEFORE_SEND"
    | "OPERATION_CANCELLED"
    | "NO_LONGER_APPLICABLE"
    | "JUSTIFIED_ABSENCE"
  > {
    if (!input.operationId || !input.employeeId) {
      return "NO_LONGER_APPLICABLE";
    }

    const pool = getPool();
    if (alertType === "ATTENDANCE_CONFIRMATION_MISSING") {
      let assignmentId = input.assignmentId;
      if (!assignmentId) {
        const match = /^confirmation-missing:([0-9a-f-]{36}):(\d+)$/i.exec(input.deduplicationKey);
        assignmentId = match?.[1] ?? null;
      }
      if (!assignmentId) {
        return "NO_LONGER_APPLICABLE";
      }
      const result = await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("assignmentId", sql.UniqueIdentifier, assignmentId)
        .input("operationId", sql.UniqueIdentifier, input.operationId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .query(`
          SELECT TOP 1
            oa.confirmation_status,
            oa.confirmation_schedule_version,
            oa.cancelled_at,
            i.status AS operation_status,
            i.operation_kind,
            e.active AS employee_active,
            s.active AS service_active,
            (
              SELECT TOP 1 1
              FROM employee_workdays ewj
              INNER JOIN operation_workdays owj
                ON owj.id = ewj.operation_workday_id AND owj.company_id = ewj.company_id
              WHERE ewj.company_id = oa.company_id
                AND ewj.employee_id = oa.employee_id
                AND owj.operation_id = i.id
                AND ewj.expectation_status = N'JUSTIFIED'
            ) AS justified_flag,
            (
              SELECT TOP 1 1
              FROM attendance_records ar
              INNER JOIN employee_workdays ew
                ON ew.id = ar.employee_workday_id AND ew.company_id = ar.company_id
              INNER JOIN operation_workdays ow
                ON ow.id = ew.operation_workday_id AND ow.company_id = ew.company_id
              WHERE ar.company_id = oa.company_id
                AND ar.employee_id = oa.employee_id
                AND ow.operation_id = i.id
                AND ar.validation_status IN (N'VALID', N'PENDING_REVIEW')
                AND ar.is_simulation = 0
            ) AS attendance_flag
          FROM operation_assignments oa
          INNER JOIN scheduled_operations i
            ON i.id = oa.operation_id AND i.company_id = oa.company_id
          INNER JOIN employees e
            ON e.id = oa.employee_id AND e.company_id = oa.company_id
          INNER JOIN operational_locations s
            ON s.id = i.service_id AND s.company_id = oa.company_id
          WHERE oa.company_id = @companyId
            AND oa.id = @assignmentId
            AND oa.operation_id = @operationId
            AND oa.employee_id = @employeeId
        `);
      const row = result.recordset[0] as Record<string, unknown> | undefined;
      if (!row) {
        return "NO_LONGER_APPLICABLE";
      }
      if (String(row.operation_status) === "CANCELLED") {
        return "OPERATION_CANCELLED";
      }
      const dedupMatch =
        /^confirmation-missing:([0-9a-f-]{36}):(\d+)$/i.exec(input.deduplicationKey);
      const expectedScheduleVersion = dedupMatch?.[2]
        ? Number(dedupMatch[2])
        : null;
      if (
        expectedScheduleVersion != null &&
        Number(row.confirmation_schedule_version) !== expectedScheduleVersion
      ) {
        return "NO_LONGER_APPLICABLE";
      }
      if (
        String(row.operation_kind) !== "ONE_TIME" ||
        String(row.operation_status) === "COMPLETED" ||
        row.cancelled_at != null ||
        !row.employee_active ||
        !row.service_active
      ) {
        return "NO_LONGER_APPLICABLE";
      }
      if (row.justified_flag != null) {
        return "JUSTIFIED_ABSENCE";
      }
      if (row.attendance_flag != null || String(row.confirmation_status) !== "PENDING") {
        return "RESOLVED_BEFORE_SEND";
      }
      return "ELIGIBLE";
    }

    let employeeWorkdayId = input.employeeWorkdayId;
    if (!employeeWorkdayId) {
      const match =
        /^(?:missing-checkin-after-start|missing-checkout-after-end):([0-9a-f-]{36}):(\d+)$/i.exec(
          input.deduplicationKey,
        );
      employeeWorkdayId = match?.[1] ?? null;
    }
    if (!employeeWorkdayId) {
      return "NO_LONGER_APPLICABLE";
    }

    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .query(`
        SELECT TOP 1
          ew.expectation_status,
          i.status AS operation_status,
          oa.cancelled_at,
          oa.confirmation_status,
          e.active AS employee_active,
          s.active AS service_active,
          ow.status AS workday_status,
          ow.work_date,
          oa.valid_from,
          oa.valid_until,
          (
            SELECT TOP 1 ar.id
            FROM attendance_records ar
            WHERE ar.employee_workday_id = ew.id
              AND ar.company_id = ew.company_id
              AND ar.validation_status IN (N'VALID', N'PENDING_REVIEW')
              AND ar.received_at IS NOT NULL
              AND ar.is_simulation = 0
          ) AS checkin_id,
          (
            SELECT TOP 1 ar.checkout_at
            FROM attendance_records ar
            WHERE ar.employee_workday_id = ew.id
              AND ar.company_id = ew.company_id
              AND ar.validation_status IN (N'VALID', N'PENDING_REVIEW')
              AND ar.received_at IS NOT NULL
              AND ar.is_simulation = 0
          ) AS checkout_at
        FROM employee_workdays ew
        INNER JOIN operation_workdays ow
          ON ow.id = ew.operation_workday_id AND ow.company_id = ew.company_id
        INNER JOIN scheduled_operations i
          ON i.id = ow.operation_id AND i.company_id = ew.company_id
        INNER JOIN operation_assignments oa
          ON oa.id = ew.operation_assignment_id AND oa.company_id = ew.company_id
        INNER JOIN employees e
          ON e.id = ew.employee_id AND e.company_id = ew.company_id
        INNER JOIN operational_locations s
          ON s.id = i.service_id AND s.company_id = ew.company_id
        WHERE ew.company_id = @companyId
          AND ew.id = @employeeWorkdayId
      `);

    const row = result.recordset[0] as Record<string, unknown> | undefined;
    if (!row) {
      return "NO_LONGER_APPLICABLE";
    }
    if (String(row.operation_status) === "CANCELLED") {
      return "OPERATION_CANCELLED";
    }
    if (String(row.expectation_status) === "JUSTIFIED") {
      return "JUSTIFIED_ABSENCE";
    }
    if (
      String(row.workday_status) !== "ACTIVE" ||
      String(row.expectation_status) !== "EXPECTED" ||
      row.cancelled_at != null ||
      !row.employee_active ||
      !row.service_active
    ) {
      return "NO_LONGER_APPLICABLE";
    }
    const workDate = String(row.work_date).slice(0, 10);
    const validFrom = String(row.valid_from).slice(0, 10);
    const validUntil = row.valid_until ? String(row.valid_until).slice(0, 10) : null;
    if (workDate < validFrom || (validUntil && workDate > validUntil)) {
      return "NO_LONGER_APPLICABLE";
    }

    if (alertType === "MISSING_CHECKIN_AFTER_START") {
      if (row.checkin_id != null) {
        return "RESOLVED_BEFORE_SEND";
      }
      if (String(row.confirmation_status) === "UNAVAILABLE") {
        return "NO_LONGER_APPLICABLE";
      }
      return "ELIGIBLE";
    }

    if (row.checkin_id == null) {
      return "NO_LONGER_APPLICABLE";
    }
    if (row.checkout_at != null) {
      return "RESOLVED_BEFORE_SEND";
    }
    return "ELIGIBLE";
  },
};
