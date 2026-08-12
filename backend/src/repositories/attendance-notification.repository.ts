import sql from "mssql";
import { getPool } from "../database/connection";
import {
  ATTENDANCE_REMINDER_MAX_ATTEMPTS,
  ATTENDANCE_REMINDER_STALE_PENDING_MINUTES,
} from "../constants/attendance-notification";
import type {
  AttendanceNotificationStatus,
  AttendanceNotificationType,
} from "../constants/attendance-notification";
import type {
  AttendanceNotification,
  AttendanceReminderCandidate,
} from "../types/attendance-notification";
import { isDuplicateKeyError } from "../utils/sql-server-errors";
import { monotonicProviderStatusAdvanceSql } from "../utils/whatsapp-observability";

const mapNotificationRow = (row: Record<string, unknown>): AttendanceNotification => ({
  id: String(row.id),
  operationId: String(row.operation_id),
  employeeId: String(row.employee_id),
  notificationType: String(row.notification_type) as AttendanceNotificationType,
  twilioMessageSid: row.twilio_message_sid ? String(row.twilio_message_sid) : null,
  status: String(row.status) as AttendanceNotificationStatus,
  errorMessage: row.error_message ? String(row.error_message) : null,
  sentAt: row.sent_at ? new Date(row.sent_at as Date | string).toISOString() : null,
  attemptCount: Number(row.attempt_count ?? 0),
  lastAttemptAt: row.last_attempt_at
    ? new Date(row.last_attempt_at as Date | string).toISOString()
    : null,
  createdAt: new Date(row.created_at as Date | string).toISOString(),
});

const mapCandidateRow = (row: Record<string, unknown>): AttendanceReminderCandidate => ({
  operationId: String(row.operation_id),
  employeeId: String(row.employee_id),
  employeeName: String(row.employee_name),
  employeePhoneNumber: String(row.employee_phone_number),
  serviceName: String(row.service_name),
  serviceAddress: row.service_address ? String(row.service_address) : null,
  serviceLocality: row.service_locality ? String(row.service_locality) : null,
  scheduledStart: new Date(row.scheduled_start as Date | string).toISOString(),
  scheduledEnd: row.scheduled_end
    ? new Date(row.scheduled_end as Date | string).toISOString()
    : null,
  scheduleVersion: Number(row.schedule_version ?? row.confirmation_schedule_version ?? 1),
  confirmationReminderHoursBefore: Number(row.confirmation_reminder_hours_before ?? 24),
  operationTimezone: row.operation_timezone ? String(row.operation_timezone) : undefined,
  operationKind: row.operation_kind
    ? (String(row.operation_kind) as AttendanceReminderCandidate["operationKind"])
    : undefined,
  employeeWorkdayId: row.employee_workday_id ? String(row.employee_workday_id) : undefined,
  operationWorkdayId: row.operation_workday_id ? String(row.operation_workday_id) : undefined,
});

const PHONE_FILTER_SQL = `
  AND e.phone_number IS NOT NULL
  AND LTRIM(RTRIM(e.phone_number)) <> ''
`;

/**
 * Workday-based reminder discovery (ONE_TIME + RECURRING).
 *
 * Source of truth is the materialized workday snapshot:
 * - ACTIVE operation_workday
 * - EXPECTED employee_workday
 * - assignment covering work_date
 * - operation not cancelled (and not completed for arrival/no-check-in)
 *
 * Window times use ow.expected_start_at / ow.expected_end_at (not scheduled_operations.*).
 * Coherent equality (expected_* = scheduled_*) is intentionally NOT required so schedule
 * drift does not silently drop eventual operations.
 *
 * Idempotency key schedule_version:
 * - ONE_TIME → ow.schedule_version (bumps on timing reconciliation)
 * - RECURRING → YYYYMMDD of work_date (one reminder cycle per calendar workday)
 */
const REMINDER_SCHEDULE_VERSION_SQL = `
  CASE
    WHEN i.operation_kind = N'RECURRING' THEN
      (YEAR(ow.work_date) * 10000 + MONTH(ow.work_date) * 100 + DAY(ow.work_date))
    ELSE ow.schedule_version
  END
`;

const WORKDAY_REMINDER_JOINS = `
        INNER JOIN operation_workdays ow
          ON ow.operation_id = i.id
         AND ow.company_id = @companyId
         AND ow.status = 'ACTIVE'
        INNER JOIN employee_workdays ew
          ON ew.operation_workday_id = ow.id
         AND ew.company_id = @companyId
         AND ew.employee_id = e.id
         AND ew.expectation_status = 'EXPECTED'
`;

const WORKDAY_ASSIGNMENT_COVERAGE_SQL = `
  AND ie.cancelled_at IS NULL
  AND ow.work_date >= ie.valid_from
  AND (ie.valid_until IS NULL OR ow.work_date <= ie.valid_until)
`;

const REMINDER_CANDIDATE_SELECT = `
          i.id AS operation_id,
          i.operation_kind,
          ow.id AS operation_workday_id,
          ew.id AS employee_workday_id,
          ow.expected_start_at AS scheduled_start,
          ow.expected_end_at AS scheduled_end,
          s.name AS service_name,
          s.address AS service_address,
          s.locality AS service_locality,
          e.id AS employee_id,
          e.name AS employee_name,
          e.phone_number AS employee_phone_number,
          (${REMINDER_SCHEDULE_VERSION_SQL}) AS schedule_version
`;

/** SUPERSEDED is never retryable; FAILED retries under attempt budget. */
const buildNotificationEligibilitySql = (): string => `
  AND (
    wan.id IS NULL
    OR (
      wan.status = 'FAILED'
      AND wan.attempt_count < @maxAttempts
    )
    OR (
      wan.status = 'PENDING'
      AND COALESCE(wan.last_attempt_at, wan.created_at) < @staleBefore
    )
  )
`;

const getRetryThresholds = () => ({
  staleBefore: new Date(Date.now() - ATTENDANCE_REMINDER_STALE_PENDING_MINUTES * 60_000),
  maxAttempts: ATTENDANCE_REMINDER_MAX_ATTEMPTS,
});

export const attendanceNotificationRepository = {
  async findByOperationEmployeeType(
    companyId: string,
    input: {
      operationId: string;
      employeeId: string;
      notificationType: AttendanceNotificationType;
      scheduleVersion?: number;
    },
  ): Promise<AttendanceNotification | null> {
    const pool = getPool();
    const scheduleVersion = input.scheduleVersion ?? 1;
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, input.operationId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("notificationType", sql.NVarChar(40), input.notificationType)
      .input("scheduleVersion", sql.Int, scheduleVersion)
      .query(`
        SELECT TOP 1 *
        FROM whatsapp_attendance_notifications
        WHERE operation_id = @operationId
          AND employee_id = @employeeId
          AND notification_type = @notificationType
          AND schedule_version = @scheduleVersion
          AND company_id = @companyId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapNotificationRow(result.recordset[0] as Record<string, unknown>);
  },

  async findArrivalReminderCandidates(
    companyId: string,
    input: {
      windowStart: Date;
      windowEnd: Date;
    },
  ): Promise<AttendanceReminderCandidate[]> {
    const pool = getPool();
    const { staleBefore, maxAttempts } = getRetryThresholds();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("windowStart", sql.DateTime2, input.windowStart)
      .input("windowEnd", sql.DateTime2, input.windowEnd)
      .input("staleBefore", sql.DateTime2, staleBefore)
      .input("maxAttempts", sql.Int, maxAttempts)
      .query(`
        SELECT
          ${REMINDER_CANDIDATE_SELECT}
        FROM scheduled_operations i
        INNER JOIN operational_locations s ON s.id = i.service_id AND s.company_id = @companyId
        INNER JOIN operation_assignments ie ON ie.operation_id = i.id AND ie.company_id = @companyId
        INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
        ${WORKDAY_REMINDER_JOINS}
        LEFT JOIN attendance_records ar
          ON ar.employee_workday_id = ew.id
          AND ar.company_id = @companyId
          AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
        LEFT JOIN whatsapp_attendance_notifications wan
          ON wan.operation_id = i.id
          AND wan.employee_id = e.id
          AND wan.notification_type = 'ARRIVAL_REMINDER_15_MIN'
          AND wan.company_id = @companyId
          AND wan.schedule_version = (${REMINDER_SCHEDULE_VERSION_SQL})
        WHERE i.company_id = @companyId
          AND i.operation_kind IN (N'ONE_TIME', N'RECURRING')
          AND i.status NOT IN ('CANCELLED', 'COMPLETED')
          AND s.active = 1
          AND e.active = 1
          ${WORKDAY_ASSIGNMENT_COVERAGE_SQL}
          ${PHONE_FILTER_SQL}
          AND ar.id IS NULL
          AND ow.expected_start_at >= @windowStart
          AND ow.expected_start_at <= @windowEnd
          ${buildNotificationEligibilitySql()}
      `);

    return result.recordset.map((row) => mapCandidateRow(row as Record<string, unknown>));
  },

  async isArrivalReminderEligible(
    companyId: string,
    operationId: string,
    employeeId: string,
    employeeWorkdayId?: string,
  ): Promise<boolean> {
    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId);

    if (employeeWorkdayId) {
      request.input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId);
    }

    const result = await request.query(`
        SELECT TOP 1 1 AS found
        FROM scheduled_operations i
        INNER JOIN operational_locations s ON s.id = i.service_id AND s.company_id = @companyId
        INNER JOIN operation_assignments ie
          ON ie.operation_id = i.id AND ie.company_id = @companyId AND ie.employee_id = @employeeId
        INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
        ${WORKDAY_REMINDER_JOINS}
        LEFT JOIN attendance_records ar
          ON ar.employee_workday_id = ew.id
          AND ar.company_id = @companyId
          AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
        WHERE i.id = @operationId
          AND i.company_id = @companyId
          AND i.operation_kind IN (N'ONE_TIME', N'RECURRING')
          AND i.status NOT IN ('CANCELLED', 'COMPLETED')
          AND s.active = 1
          AND e.active = 1
          ${WORKDAY_ASSIGNMENT_COVERAGE_SQL}
          ${PHONE_FILTER_SQL}
          AND ar.id IS NULL
          ${employeeWorkdayId ? "AND ew.id = @employeeWorkdayId" : ""}
      `);

    return Boolean(result.recordset[0]);
  },

  async findNoCheckInAtStartCandidates(
    companyId: string,
    input: {
      windowStart: Date;
      windowEnd: Date;
    },
  ): Promise<AttendanceReminderCandidate[]> {
    const pool = getPool();
    const { staleBefore, maxAttempts } = getRetryThresholds();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("windowStart", sql.DateTime2, input.windowStart)
      .input("windowEnd", sql.DateTime2, input.windowEnd)
      .input("staleBefore", sql.DateTime2, staleBefore)
      .input("maxAttempts", sql.Int, maxAttempts)
      .query(`
        SELECT
          ${REMINDER_CANDIDATE_SELECT}
        FROM scheduled_operations i
        INNER JOIN operational_locations s ON s.id = i.service_id AND s.company_id = @companyId
        INNER JOIN operation_assignments ie ON ie.operation_id = i.id AND ie.company_id = @companyId
        INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
        ${WORKDAY_REMINDER_JOINS}
        LEFT JOIN attendance_records ar
          ON ar.employee_workday_id = ew.id
          AND ar.company_id = @companyId
          AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
        LEFT JOIN whatsapp_attendance_notifications wan
          ON wan.operation_id = i.id
          AND wan.employee_id = e.id
          AND wan.notification_type = 'NO_CHECKIN_AT_START'
          AND wan.company_id = @companyId
          AND wan.schedule_version = (${REMINDER_SCHEDULE_VERSION_SQL})
        WHERE i.company_id = @companyId
          AND i.operation_kind IN (N'ONE_TIME', N'RECURRING')
          AND i.status NOT IN ('CANCELLED', 'COMPLETED')
          AND s.active = 1
          AND e.active = 1
          ${WORKDAY_ASSIGNMENT_COVERAGE_SQL}
          AND ar.id IS NULL
          AND ow.expected_start_at >= @windowStart
          AND ow.expected_start_at <= @windowEnd
          ${PHONE_FILTER_SQL}
          ${buildNotificationEligibilitySql()}
      `);

    return result.recordset.map((row) => mapCandidateRow(row as Record<string, unknown>));
  },

  async isNoCheckInAtStartEligible(
    companyId: string,
    operationId: string,
    employeeId: string,
    employeeWorkdayId?: string,
  ): Promise<boolean> {
    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId);

    if (employeeWorkdayId) {
      request.input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId);
    }

    const result = await request.query(`
        SELECT TOP 1 1 AS found
        FROM scheduled_operations i
        INNER JOIN operational_locations s ON s.id = i.service_id AND s.company_id = @companyId
        INNER JOIN operation_assignments ie
          ON ie.operation_id = i.id AND ie.company_id = @companyId AND ie.employee_id = @employeeId
        INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
        ${WORKDAY_REMINDER_JOINS}
        LEFT JOIN attendance_records ar
          ON ar.employee_workday_id = ew.id
          AND ar.company_id = @companyId
          AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
        WHERE i.id = @operationId
          AND i.company_id = @companyId
          AND i.operation_kind IN (N'ONE_TIME', N'RECURRING')
          AND i.status NOT IN ('CANCELLED', 'COMPLETED')
          AND s.active = 1
          AND e.active = 1
          ${WORKDAY_ASSIGNMENT_COVERAGE_SQL}
          ${PHONE_FILTER_SQL}
          AND ar.id IS NULL
          ${employeeWorkdayId ? "AND ew.id = @employeeWorkdayId" : ""}
      `);

    return Boolean(result.recordset[0]);
  },

  async findExitReminderCandidates(
    companyId: string,
    input: {
      windowStart: Date;
      windowEnd: Date;
    },
  ): Promise<AttendanceReminderCandidate[]> {
    const pool = getPool();
    const { staleBefore, maxAttempts } = getRetryThresholds();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("windowStart", sql.DateTime2, input.windowStart)
      .input("windowEnd", sql.DateTime2, input.windowEnd)
      .input("staleBefore", sql.DateTime2, staleBefore)
      .input("maxAttempts", sql.Int, maxAttempts)
      .query(`
        SELECT
          ${REMINDER_CANDIDATE_SELECT}
        FROM scheduled_operations i
        INNER JOIN operational_locations s ON s.id = i.service_id AND s.company_id = @companyId
        INNER JOIN operation_assignments ie ON ie.operation_id = i.id AND ie.company_id = @companyId
        INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
        ${WORKDAY_REMINDER_JOINS}
        INNER JOIN attendance_records ar
          ON ar.employee_workday_id = ew.id
          AND ar.company_id = @companyId
          AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
          AND ar.checkout_at IS NULL
        LEFT JOIN whatsapp_attendance_notifications wan
          ON wan.operation_id = i.id
          AND wan.employee_id = e.id
          AND wan.notification_type = 'EXIT_REMINDER_15_MIN'
          AND wan.company_id = @companyId
          AND wan.schedule_version = (${REMINDER_SCHEDULE_VERSION_SQL})
        WHERE i.company_id = @companyId
          AND i.operation_kind IN (N'ONE_TIME', N'RECURRING')
          AND i.status NOT IN ('CANCELLED', 'COMPLETED')
          AND ow.expected_end_at IS NOT NULL
          AND s.active = 1
          AND e.active = 1
          ${WORKDAY_ASSIGNMENT_COVERAGE_SQL}
          ${PHONE_FILTER_SQL}
          AND ow.expected_end_at >= @windowStart
          AND ow.expected_end_at <= @windowEnd
          ${buildNotificationEligibilitySql()}
      `);

    return result.recordset.map((row) => mapCandidateRow(row as Record<string, unknown>));
  },

  async isExitReminderEligible(
    companyId: string,
    operationId: string,
    employeeId: string,
    employeeWorkdayId?: string,
  ): Promise<boolean> {
    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId);

    if (employeeWorkdayId) {
      request.input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId);
    }

    const result = await request.query(`
        SELECT TOP 1 1 AS found
        FROM scheduled_operations i
        INNER JOIN operational_locations s ON s.id = i.service_id AND s.company_id = @companyId
        INNER JOIN operation_assignments ie
          ON ie.operation_id = i.id AND ie.company_id = @companyId AND ie.employee_id = @employeeId
        INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
        ${WORKDAY_REMINDER_JOINS}
        INNER JOIN attendance_records ar
          ON ar.employee_workday_id = ew.id
          AND ar.company_id = @companyId
          AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
          AND ar.checkout_at IS NULL
        WHERE i.id = @operationId
          AND i.company_id = @companyId
          AND i.operation_kind IN (N'ONE_TIME', N'RECURRING')
          AND i.status NOT IN ('CANCELLED', 'COMPLETED')
          AND ow.expected_end_at IS NOT NULL
          AND s.active = 1
          AND e.active = 1
          ${WORKDAY_ASSIGNMENT_COVERAGE_SQL}
          ${PHONE_FILTER_SQL}
          ${employeeWorkdayId ? "AND ew.id = @employeeWorkdayId" : ""}
      `);

    return Boolean(result.recordset[0]);
  },

  async findReminderCandidateByIds(
    companyId: string,
    input: {
      operationId: string;
      employeeId: string;
      notificationType: AttendanceNotificationType;
      /** Prefer exact workday identity when available (workday-based reminder types). */
      employeeWorkdayId?: string;
      operationWorkdayId?: string;
      /** Matches REMINDER_SCHEDULE_VERSION_SQL (ow.schedule_version or YYYYMMDD). */
      scheduleVersion?: number;
    },
  ): Promise<AttendanceReminderCandidate | null> {
    const pool = getPool();

    // Confirmation reminders are assignment-scoped (ONE_TIME), not workday-scoped.
    if (input.notificationType === "ATTENDANCE_CONFIRMATION_REMINDER") {
      const result = await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("operationId", sql.UniqueIdentifier, input.operationId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .query(`
          SELECT
            i.id AS operation_id,
            i.operation_kind,
            i.scheduled_start,
            i.scheduled_end,
            s.name AS service_name,
            s.address AS service_address,
            s.locality AS service_locality,
            e.id AS employee_id,
            e.name AS employee_name,
            e.phone_number AS employee_phone_number,
            ie.confirmation_schedule_version AS schedule_version,
            cs.confirmation_reminder_hours_before,
            cs.operation_timezone
          FROM scheduled_operations i
          INNER JOIN operational_locations s ON s.id = i.service_id AND s.company_id = @companyId
          INNER JOIN operation_assignments ie
            ON ie.operation_id = i.id AND ie.employee_id = @employeeId AND ie.company_id = @companyId
          INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
          INNER JOIN company_settings cs ON cs.company_id = @companyId
          WHERE i.id = @operationId
            AND i.company_id = @companyId
            AND i.operation_kind = N'ONE_TIME'
            AND s.active = 1
            AND e.active = 1
            AND ie.cancelled_at IS NULL
            ${PHONE_FILTER_SQL}
            AND i.scheduled_start IS NOT NULL
        `);

      if (!result.recordset[0]) {
        return null;
      }

      return mapCandidateRow(result.recordset[0] as Record<string, unknown>);
    }

    const endRequired = input.notificationType === "EXIT_REMINDER_15_MIN";
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, input.operationId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId);

    if (input.employeeWorkdayId) {
      request.input("employeeWorkdayId", sql.UniqueIdentifier, input.employeeWorkdayId);
    }
    if (input.operationWorkdayId) {
      request.input("operationWorkdayId", sql.UniqueIdentifier, input.operationWorkdayId);
    }
    if (input.scheduleVersion !== undefined) {
      request.input("scheduleVersion", sql.Int, input.scheduleVersion);
    }

    const result = await request.query(`
        SELECT TOP 1
          ${REMINDER_CANDIDATE_SELECT}
        FROM scheduled_operations i
        INNER JOIN operational_locations s ON s.id = i.service_id AND s.company_id = @companyId
        INNER JOIN operation_assignments ie
          ON ie.operation_id = i.id AND ie.employee_id = @employeeId AND ie.company_id = @companyId
        INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
        ${WORKDAY_REMINDER_JOINS}
        WHERE i.id = @operationId
          AND i.company_id = @companyId
          AND i.operation_kind IN (N'ONE_TIME', N'RECURRING')
          AND s.active = 1
          AND e.active = 1
          ${WORKDAY_ASSIGNMENT_COVERAGE_SQL}
          ${PHONE_FILTER_SQL}
          AND ow.expected_start_at IS NOT NULL
          ${endRequired ? "AND ow.expected_end_at IS NOT NULL" : ""}
          ${input.employeeWorkdayId ? "AND ew.id = @employeeWorkdayId" : ""}
          ${input.operationWorkdayId ? "AND ow.id = @operationWorkdayId" : ""}
          ${
            input.scheduleVersion !== undefined
              ? `AND (${REMINDER_SCHEDULE_VERSION_SQL}) = @scheduleVersion`
              : ""
          }
        ORDER BY ow.expected_start_at DESC
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapCandidateRow(result.recordset[0] as Record<string, unknown>);
  },

  async claimNotificationForAttempt(
    companyId: string,
    input: {
      operationId: string;
      employeeId: string;
      notificationType: AttendanceNotificationType;
      scheduleVersion?: number;
      reminderSource?: "AUTOMATIC" | "MANUAL";
      attemptedAt?: Date;
    },
  ): Promise<AttendanceNotification | null> {
    const attemptedAt = input.attemptedAt ?? new Date();
    const scheduleVersion = input.scheduleVersion ?? 1;
    const { staleBefore, maxAttempts } = getRetryThresholds();

    const reclaimed = await this.reclaimNotificationForAttempt(companyId, {
      operationId: input.operationId,
      employeeId: input.employeeId,
      notificationType: input.notificationType,
      scheduleVersion,
      attemptedAt,
      staleBefore,
      maxAttempts,
    });
    if (reclaimed) {
      return reclaimed;
    }

    const pool = getPool();

    try {
      const insertResult = await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("operationId", sql.UniqueIdentifier, input.operationId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("notificationType", sql.NVarChar(40), input.notificationType)
        .input("scheduleVersion", sql.Int, scheduleVersion)
        .input("reminderSource", sql.NVarChar(20), input.reminderSource ?? "AUTOMATIC")
        .query(`
          INSERT INTO whatsapp_attendance_notifications (
            company_id, operation_id, employee_id, notification_type, status, attempt_count,
            schedule_version, reminder_source
          )
          OUTPUT INSERTED.*
          VALUES (
            @companyId, @operationId, @employeeId, @notificationType, 'PENDING', 0,
            @scheduleVersion, @reminderSource
          )
        `);

      const inserted = mapNotificationRow(insertResult.recordset[0] as Record<string, unknown>);
      return this.beginAttempt(companyId, {
        notificationId: inserted.id,
        attemptedAt,
        maxAttempts,
        firstAttemptOnly: true,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const reclaimedAfterRace = await this.reclaimNotificationForAttempt(companyId, {
        operationId: input.operationId,
        employeeId: input.employeeId,
        notificationType: input.notificationType,
        scheduleVersion,
        attemptedAt,
        staleBefore,
        maxAttempts,
      });
      if (reclaimedAfterRace) {
        return reclaimedAfterRace;
      }

      const existing = await this.findByOperationEmployeeType(companyId, input);
      if (!existing) {
        return null;
      }

      return this.beginAttempt(companyId, {
        notificationId: existing.id,
        attemptedAt,
        maxAttempts,
        firstAttemptOnly: true,
      });
    }
  },

  async reclaimNotificationForAttempt(
    companyId: string,
    input: {
      notificationId?: string;
      operationId?: string;
      employeeId?: string;
      notificationType?: AttendanceNotificationType;
      scheduleVersion?: number;
      attemptedAt: Date;
      staleBefore: Date;
      maxAttempts: number;
    },
  ): Promise<AttendanceNotification | null> {
    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("attemptedAt", sql.DateTime2, input.attemptedAt)
      .input("staleBefore", sql.DateTime2, input.staleBefore)
      .input("maxAttempts", sql.Int, input.maxAttempts);

    let whereClause = "id = @notificationId AND company_id = @companyId";
    if (input.notificationId) {
      request.input("notificationId", sql.UniqueIdentifier, input.notificationId);
    } else if (input.operationId && input.employeeId && input.notificationType) {
      request
        .input("operationId", sql.UniqueIdentifier, input.operationId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("notificationType", sql.NVarChar(40), input.notificationType)
        .input("scheduleVersion", sql.Int, input.scheduleVersion ?? 1);
      whereClause = `
        operation_id = @operationId
        AND employee_id = @employeeId
        AND notification_type = @notificationType
        AND schedule_version = @scheduleVersion
        AND company_id = @companyId
      `;
    } else {
      throw new Error("RECLAIM_NOTIFICATION_TARGET_REQUIRED");
    }

    const result = await request.query(`
      UPDATE whatsapp_attendance_notifications
      SET status = 'PENDING',
          error_message = NULL,
          attempt_count = attempt_count + 1,
          last_attempt_at = @attemptedAt
      OUTPUT INSERTED.*
      WHERE ${whereClause}
        AND (
          (
            status = 'FAILED'
            AND attempt_count < @maxAttempts
          )
          OR (
            status = 'PENDING'
            AND COALESCE(last_attempt_at, created_at) < @staleBefore
          )
        )
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapNotificationRow(result.recordset[0] as Record<string, unknown>);
  },

  async beginAttempt(
    companyId: string,
    input: {
      notificationId: string;
      attemptedAt: Date;
      maxAttempts?: number;
      firstAttemptOnly?: boolean;
    },
  ): Promise<AttendanceNotification | null> {
    const pool = getPool();
    const maxAttempts = input.maxAttempts ?? ATTENDANCE_REMINDER_MAX_ATTEMPTS;
    const firstAttemptClause = input.firstAttemptOnly
      ? "AND attempt_count = 0 AND last_attempt_at IS NULL"
      : "";

    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("notificationId", sql.UniqueIdentifier, input.notificationId)
      .input("attemptedAt", sql.DateTime2, input.attemptedAt)
      .input("maxAttempts", sql.Int, maxAttempts)
      .query(`
        UPDATE whatsapp_attendance_notifications
        SET attempt_count = attempt_count + 1,
            last_attempt_at = @attemptedAt
        OUTPUT INSERTED.*
        WHERE id = @notificationId
          AND company_id = @companyId
          AND status = 'PENDING'
          AND attempt_count < @maxAttempts
          ${firstAttemptClause}
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapNotificationRow(result.recordset[0] as Record<string, unknown>);
  },

  /** @deprecated Use claimNotificationForAttempt */
  async reserveNotification(
    companyId: string,
    input: {
      operationId: string;
      employeeId: string;
      notificationType: AttendanceNotificationType;
    },
  ): Promise<AttendanceNotification | null> {
    return this.claimNotificationForAttempt(companyId, input);
  },

  /** @deprecated Replaced by reclaimNotificationForAttempt */
  async reclaimNotification(
    companyId: string,
    notificationId: string,
    attemptedAt: Date = new Date(),
  ): Promise<AttendanceNotification | null> {
    const { staleBefore, maxAttempts } = getRetryThresholds();
    return this.reclaimNotificationForAttempt(companyId, {
      notificationId,
      attemptedAt,
      staleBefore,
      maxAttempts,
    });
  },

  async linkObservability(
    companyId: string,
    input: {
      notificationId: string;
      conversationId?: string | null;
      correlationId?: string | null;
      outboundMessageId?: string | null;
    },
  ): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("notificationId", sql.UniqueIdentifier, input.notificationId)
      .input("conversationId", sql.UniqueIdentifier, input.conversationId ?? null)
      .input("correlationId", sql.UniqueIdentifier, input.correlationId ?? null)
      .input("outboundMessageId", sql.UniqueIdentifier, input.outboundMessageId ?? null)
      .query(`
        UPDATE whatsapp_attendance_notifications
        SET conversation_id = COALESCE(@conversationId, conversation_id),
            correlation_id = COALESCE(@correlationId, correlation_id),
            outbound_message_id = COALESCE(@outboundMessageId, outbound_message_id)
        WHERE id = @notificationId AND company_id = @companyId
      `);
  },

  async markSent(
    companyId: string,
    input: {
      notificationId: string;
      twilioMessageSid: string;
      sentAt: Date;
    },
  ): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("notificationId", sql.UniqueIdentifier, input.notificationId)
      .input("twilioMessageSid", sql.NVarChar(100), input.twilioMessageSid)
      .input("sentAt", sql.DateTime2, input.sentAt)
      .query(`
        UPDATE whatsapp_attendance_notifications
        SET status = 'SENT',
            twilio_message_sid = @twilioMessageSid,
            sent_at = @sentAt,
            error_message = NULL
        WHERE id = @notificationId AND company_id = @companyId
      `);
  },

  async markSentRecoveryRequired(
    companyId: string,
    input: {
      notificationId: string;
      twilioMessageSid: string;
      sentAt: Date;
      errorMessage: string;
    },
  ): Promise<void> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("notificationId", sql.UniqueIdentifier, input.notificationId)
      .input("twilioMessageSid", sql.NVarChar(100), input.twilioMessageSid)
      .input("sentAt", sql.DateTime2, input.sentAt)
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage.slice(0, 1000))
      .query(`
        UPDATE whatsapp_attendance_notifications
        SET status = 'SENT_RECOVERY_REQUIRED',
            twilio_message_sid = @twilioMessageSid,
            sent_at = @sentAt,
            error_message = @errorMessage
        WHERE id = @notificationId
          AND company_id = @companyId
          AND status = 'PENDING'
      `);

    if ((result.rowsAffected[0] ?? 0) === 0) {
      throw new Error("MARK_SENT_RECOVERY_REQUIRED_NOOP");
    }
  },

  async reconcileSentRecoveryRequired(companyId: string): Promise<number> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE whatsapp_attendance_notifications
        SET status = 'SENT',
            error_message = NULL
        OUTPUT INSERTED.id
        WHERE company_id = @companyId
          AND status = 'SENT_RECOVERY_REQUIRED'
      `);

    return result.recordset.length;
  },

  async markFailed(
    companyId: string,
    input: {
      notificationId: string;
      errorMessage: string;
    },
  ): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("notificationId", sql.UniqueIdentifier, input.notificationId)
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage.slice(0, 1000))
      .query(`
        UPDATE whatsapp_attendance_notifications
        SET status = 'FAILED',
            error_message = @errorMessage,
            sent_at = NULL
        WHERE id = @notificationId AND company_id = @companyId
      `);
  },

  /**
   * Terminal outcome for claimed reminders that lost business eligibility
   * (check-in arrived, assignment cancelled, etc.). Not retryable — unlike FAILED.
   */
  async markSuperseded(
    companyId: string,
    input: {
      notificationId: string;
      errorMessage: string;
    },
  ): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("notificationId", sql.UniqueIdentifier, input.notificationId)
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage.slice(0, 1000))
      .query(`
        UPDATE whatsapp_attendance_notifications
        SET status = 'SUPERSEDED',
            error_message = @errorMessage,
            sent_at = NULL
        WHERE id = @notificationId
          AND company_id = @companyId
          AND status IN ('PENDING', 'FAILED', 'SENT_RECOVERY_REQUIRED')
      `);
  },

  /**
   * Marks pending notifications as SUPERSEDED after a timing schedule change.
   * SENT rows are preserved as history. SUPERSEDED is not retryable and is not
   * counted as a technical FAILED send.
   */
  async supersedePendingForOperationScheduleChange(
    companyId: string,
    operationId: string,
    transaction: sql.Transaction,
    errorMessage = "OPERATION_SCHEDULE_CHANGED",
  ): Promise<number> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("errorMessage", sql.NVarChar(1000), errorMessage.slice(0, 1000))
      .query(`
        UPDATE whatsapp_attendance_notifications
        SET status = 'SUPERSEDED',
            error_message = @errorMessage,
            sent_at = NULL
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND status IN ('PENDING', 'SENT_RECOVERY_REQUIRED')
      `);

    return result.rowsAffected[0] ?? 0;
  },

  /** @deprecated Prefer supersedePendingForOperationScheduleChange */
  async failPendingForOperationScheduleChange(
    companyId: string,
    operationId: string,
    transaction: sql.Transaction,
    errorMessage = "OPERATION_SCHEDULE_CHANGED",
  ): Promise<number> {
    return this.supersedePendingForOperationScheduleChange(
      companyId,
      operationId,
      transaction,
      errorMessage,
    );
  },

  async findConfirmationReminderCandidates(
    companyId: string,
    referenceAt: Date,
  ): Promise<AttendanceReminderCandidate[]> {
    const pool = getPool();
    const { staleBefore, maxAttempts } = getRetryThresholds();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("referenceAt", sql.DateTime2, referenceAt)
      .input("staleBefore", sql.DateTime2, staleBefore)
      .input("maxAttempts", sql.Int, maxAttempts)
      .query(`
        SELECT
          i.id AS operation_id,
          i.operation_kind,
          i.scheduled_start,
          i.scheduled_end,
          s.name AS service_name,
          s.address AS service_address,
          s.locality AS service_locality,
          e.id AS employee_id,
          e.name AS employee_name,
          e.phone_number AS employee_phone_number,
          ie.confirmation_schedule_version AS schedule_version,
          cs.confirmation_reminder_hours_before,
          cs.operation_timezone
        FROM scheduled_operations i
        INNER JOIN operational_locations s ON s.id = i.service_id AND s.company_id = @companyId
        INNER JOIN operation_assignments ie ON ie.operation_id = i.id AND ie.company_id = @companyId
        INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
        INNER JOIN company_settings cs ON cs.company_id = @companyId
        LEFT JOIN whatsapp_attendance_notifications wan
          ON wan.operation_id = i.id
          AND wan.employee_id = e.id
          AND wan.notification_type = 'ATTENDANCE_CONFIRMATION_REMINDER'
          AND wan.schedule_version = ie.confirmation_schedule_version
          AND wan.company_id = @companyId
        WHERE i.company_id = @companyId
          AND i.operation_kind = N'ONE_TIME'
          AND i.status NOT IN ('CANCELLED', 'COMPLETED')
          AND s.active = 1
          AND e.active = 1
          AND ie.cancelled_at IS NULL
          AND ie.confirmation_status = 'PENDING'
          AND cs.confirmation_reminder_enabled = 1
          AND i.scheduled_start > @referenceAt
          AND DATEADD(HOUR, -cs.confirmation_reminder_hours_before, i.scheduled_start) <= @referenceAt
          ${PHONE_FILTER_SQL}
          ${buildNotificationEligibilitySql()}
      `);

    return result.recordset.map((row) => mapCandidateRow(row as Record<string, unknown>));
  },

  async isConfirmationReminderEligible(
    companyId: string,
    operationId: string,
    employeeId: string,
    scheduleVersion: number,
  ): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("scheduleVersion", sql.Int, scheduleVersion)
      .query(`
        SELECT TOP 1 1 AS eligible
        FROM operation_assignments ie
        INNER JOIN scheduled_operations i ON i.id = ie.operation_id AND i.company_id = @companyId
        INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
        INNER JOIN company_settings cs ON cs.company_id = @companyId
        WHERE ie.company_id = @companyId
          AND ie.operation_id = @operationId
          AND ie.employee_id = @employeeId
          AND ie.confirmation_status = 'PENDING'
          AND ie.confirmation_schedule_version = @scheduleVersion
          AND e.active = 1
          AND e.phone_number IS NOT NULL
          AND LTRIM(RTRIM(e.phone_number)) <> ''
          AND i.status NOT IN ('CANCELLED', 'COMPLETED')
          AND cs.confirmation_reminder_enabled = 1
      `);

    return Boolean(result.recordset[0]);
  },

  async projectProviderStatusById(input: {
    notificationId: string;
    providerStatus: string;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<void> {
    const advance = monotonicProviderStatusAdvanceSql("provider_status", "@providerStatus");
    await getPool()
      .request()
      .input("notificationId", sql.UniqueIdentifier, input.notificationId)
      .input("providerStatus", sql.NVarChar(40), input.providerStatus.toLowerCase())
      .input("providerErrorCode", sql.NVarChar(40), input.errorCode ?? null)
      .input("providerErrorMessage", sql.NVarChar(1000), input.errorMessage ?? null)
      .query(`
        UPDATE whatsapp_attendance_notifications
        SET provider_status = @providerStatus,
            provider_error_code = COALESCE(@providerErrorCode, provider_error_code),
            provider_error_message = COALESCE(@providerErrorMessage, provider_error_message),
            provider_updated_at = SYSUTCDATETIME()
        WHERE id = @notificationId
          AND ${advance}
      `);
  },
};
