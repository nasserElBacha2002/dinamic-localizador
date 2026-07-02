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

const mapNotificationRow = (row: Record<string, unknown>): AttendanceNotification => ({
  id: String(row.id),
  inventoryId: String(row.inventory_id),
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
  inventoryId: String(row.inventory_id),
  employeeId: String(row.employee_id),
  employeeName: String(row.employee_name),
  employeePhoneNumber: String(row.employee_phone_number),
  storeName: String(row.store_name),
  scheduledStart: new Date(row.scheduled_start as Date | string).toISOString(),
  scheduledEnd: row.scheduled_end
    ? new Date(row.scheduled_end as Date | string).toISOString()
    : null,
});

const PHONE_FILTER_SQL = `
  AND e.phone_number IS NOT NULL
  AND LTRIM(RTRIM(e.phone_number)) <> ''
`;

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
  async findByInventoryEmployeeType(
    companyId: string,
    input: {
      inventoryId: string;
      employeeId: string;
      notificationType: AttendanceNotificationType;
    },
  ): Promise<AttendanceNotification | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("inventoryId", sql.UniqueIdentifier, input.inventoryId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("notificationType", sql.NVarChar(40), input.notificationType)
      .query(`
        SELECT TOP 1 *
        FROM whatsapp_attendance_notifications
        WHERE inventory_id = @inventoryId
          AND employee_id = @employeeId
          AND notification_type = @notificationType
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
          i.id AS inventory_id,
          i.scheduled_start,
          i.scheduled_end,
          s.name AS store_name,
          e.id AS employee_id,
          e.name AS employee_name,
          e.phone_number AS employee_phone_number
        FROM scheduled_operations i
        INNER JOIN operational_locations s ON s.id = i.store_id AND s.company_id = @companyId
        INNER JOIN operation_assignments ie ON ie.inventory_id = i.id AND ie.company_id = @companyId
        INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
        LEFT JOIN whatsapp_attendance_notifications wan
          ON wan.inventory_id = i.id
          AND wan.employee_id = e.id
          AND wan.notification_type = 'ARRIVAL_REMINDER_15_MIN'
          AND wan.company_id = @companyId
        WHERE i.company_id = @companyId
          AND i.status NOT IN ('CANCELLED', 'COMPLETED')
          AND s.active = 1
          AND e.active = 1
          ${PHONE_FILTER_SQL}
          AND i.scheduled_start >= @windowStart
          AND i.scheduled_start <= @windowEnd
          ${buildNotificationEligibilitySql()}
      `);

    return result.recordset.map((row) => mapCandidateRow(row as Record<string, unknown>));
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
          i.id AS inventory_id,
          i.scheduled_start,
          i.scheduled_end,
          s.name AS store_name,
          e.id AS employee_id,
          e.name AS employee_name,
          e.phone_number AS employee_phone_number
        FROM scheduled_operations i
        INNER JOIN operational_locations s ON s.id = i.store_id AND s.company_id = @companyId
        INNER JOIN operation_assignments ie ON ie.inventory_id = i.id AND ie.company_id = @companyId
        INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
        LEFT JOIN attendance_records ar
          ON ar.inventory_id = i.id
          AND ar.employee_id = e.id
          AND ar.company_id = @companyId
        LEFT JOIN whatsapp_attendance_notifications wan
          ON wan.inventory_id = i.id
          AND wan.employee_id = e.id
          AND wan.notification_type = 'NO_CHECKIN_AT_START'
          AND wan.company_id = @companyId
        WHERE i.company_id = @companyId
          AND i.status NOT IN ('CANCELLED', 'COMPLETED')
          AND s.active = 1
          AND e.active = 1
          AND ar.id IS NULL
          AND i.scheduled_start >= @windowStart
          AND i.scheduled_start <= @windowEnd
          ${buildNotificationEligibilitySql()}
      `);

    return result.recordset.map((row) => mapCandidateRow(row as Record<string, unknown>));
  },

  async isNoCheckInAtStartEligible(
    companyId: string,
    inventoryId: string,
    employeeId: string,
  ): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT TOP 1 1 AS found
        FROM operation_assignments ie
        INNER JOIN scheduled_operations i ON i.id = ie.inventory_id AND i.company_id = @companyId
        INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
        LEFT JOIN attendance_records ar
          ON ar.inventory_id = ie.inventory_id
          AND ar.employee_id = ie.employee_id
          AND ar.company_id = @companyId
        WHERE ie.inventory_id = @inventoryId
          AND ie.employee_id = @employeeId
          AND ie.company_id = @companyId
          AND i.status NOT IN ('CANCELLED', 'COMPLETED')
          AND e.active = 1
          AND ar.id IS NULL
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
          i.id AS inventory_id,
          i.scheduled_start,
          i.scheduled_end,
          s.name AS store_name,
          e.id AS employee_id,
          e.name AS employee_name,
          e.phone_number AS employee_phone_number
        FROM scheduled_operations i
        INNER JOIN operational_locations s ON s.id = i.store_id AND s.company_id = @companyId
        INNER JOIN operation_assignments ie ON ie.inventory_id = i.id AND ie.company_id = @companyId
        INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
        INNER JOIN attendance_records ar
          ON ar.inventory_id = i.id
          AND ar.employee_id = e.id
          AND ar.company_id = @companyId
          AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
          AND ar.checkout_at IS NULL
        LEFT JOIN whatsapp_attendance_notifications wan
          ON wan.inventory_id = i.id
          AND wan.employee_id = e.id
          AND wan.notification_type = 'EXIT_REMINDER_15_MIN'
          AND wan.company_id = @companyId
        WHERE i.company_id = @companyId
          AND i.status <> 'CANCELLED'
          AND i.scheduled_end IS NOT NULL
          AND s.active = 1
          AND e.active = 1
          ${PHONE_FILTER_SQL}
          AND i.scheduled_end >= @windowStart
          AND i.scheduled_end <= @windowEnd
          ${buildNotificationEligibilitySql()}
      `);

    return result.recordset.map((row) => mapCandidateRow(row as Record<string, unknown>));
  },

  async isExitReminderEligible(
    companyId: string,
    inventoryId: string,
    employeeId: string,
  ): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT TOP 1 1 AS found
        FROM attendance_records ar
        INNER JOIN scheduled_operations i ON i.id = ar.inventory_id AND i.company_id = @companyId
        INNER JOIN employees e ON e.id = ar.employee_id AND e.company_id = @companyId
        WHERE ar.inventory_id = @inventoryId
          AND ar.employee_id = @employeeId
          AND ar.company_id = @companyId
          AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
          AND ar.checkout_at IS NULL
          AND i.status <> 'CANCELLED'
          AND i.scheduled_end IS NOT NULL
          AND e.phone_number IS NOT NULL
          AND LTRIM(RTRIM(e.phone_number)) <> ''
      `);

    return Boolean(result.recordset[0]);
  },

  async findReminderCandidateByIds(
    companyId: string,
    input: {
      inventoryId: string;
      employeeId: string;
      notificationType: AttendanceNotificationType;
    },
  ): Promise<AttendanceReminderCandidate | null> {
    const pool = getPool();
    const scheduledColumn =
      input.notificationType === "EXIT_REMINDER_15_MIN" ? "i.scheduled_end" : "i.scheduled_start";

    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("inventoryId", sql.UniqueIdentifier, input.inventoryId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .query(`
        SELECT
          i.id AS inventory_id,
          i.scheduled_start,
          i.scheduled_end,
          s.name AS store_name,
          e.id AS employee_id,
          e.name AS employee_name,
          e.phone_number AS employee_phone_number
        FROM scheduled_operations i
        INNER JOIN operational_locations s ON s.id = i.store_id AND s.company_id = @companyId
        INNER JOIN operation_assignments ie
          ON ie.inventory_id = i.id AND ie.employee_id = @employeeId AND ie.company_id = @companyId
        INNER JOIN employees e ON e.id = ie.employee_id AND e.company_id = @companyId
        WHERE i.id = @inventoryId
          AND i.company_id = @companyId
          AND s.active = 1
          AND e.active = 1
          ${PHONE_FILTER_SQL}
          AND ${scheduledColumn} IS NOT NULL
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapCandidateRow(result.recordset[0] as Record<string, unknown>);
  },

  async claimNotificationForAttempt(
    companyId: string,
    input: {
      inventoryId: string;
      employeeId: string;
      notificationType: AttendanceNotificationType;
      attemptedAt?: Date;
    },
  ): Promise<AttendanceNotification | null> {
    const attemptedAt = input.attemptedAt ?? new Date();
    const { staleBefore, maxAttempts } = getRetryThresholds();

    const reclaimed = await this.reclaimNotificationForAttempt(companyId, {
      inventoryId: input.inventoryId,
      employeeId: input.employeeId,
      notificationType: input.notificationType,
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
        .input("inventoryId", sql.UniqueIdentifier, input.inventoryId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("notificationType", sql.NVarChar(40), input.notificationType)
        .query(`
          INSERT INTO whatsapp_attendance_notifications (
            company_id, inventory_id, employee_id, notification_type, status, attempt_count
          )
          OUTPUT INSERTED.*
          VALUES (@companyId, @inventoryId, @employeeId, @notificationType, 'PENDING', 0)
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
        inventoryId: input.inventoryId,
        employeeId: input.employeeId,
        notificationType: input.notificationType,
        attemptedAt,
        staleBefore,
        maxAttempts,
      });
      if (reclaimedAfterRace) {
        return reclaimedAfterRace;
      }

      const existing = await this.findByInventoryEmployeeType(companyId, input);
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
      inventoryId?: string;
      employeeId?: string;
      notificationType?: AttendanceNotificationType;
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
    } else if (input.inventoryId && input.employeeId && input.notificationType) {
      request
        .input("inventoryId", sql.UniqueIdentifier, input.inventoryId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("notificationType", sql.NVarChar(40), input.notificationType);
      whereClause = `
        inventory_id = @inventoryId
        AND employee_id = @employeeId
        AND notification_type = @notificationType
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
      inventoryId: string;
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
};
