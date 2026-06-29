import sql from "mssql";
import { getPool } from "../database/connection";
import type {
  AttendanceNotificationStatus,
  AttendanceNotificationType,
} from "../constants/attendance-notification";
import type {
  AttendanceNotification,
  AttendanceReminderCandidate,
} from "../types/attendance-notification";

const mapNotificationRow = (row: Record<string, unknown>): AttendanceNotification => ({
  id: String(row.id),
  inventoryId: String(row.inventory_id),
  employeeId: String(row.employee_id),
  notificationType: String(row.notification_type) as AttendanceNotificationType,
  twilioMessageSid: row.twilio_message_sid ? String(row.twilio_message_sid) : null,
  status: String(row.status) as AttendanceNotificationStatus,
  errorMessage: row.error_message ? String(row.error_message) : null,
  sentAt: row.sent_at ? new Date(row.sent_at as Date | string).toISOString() : null,
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

const isDuplicateNotificationError = (error: unknown): boolean =>
  error instanceof Error &&
  error.message.includes("UQ_whatsapp_attendance_notifications_inventory_employee_type");

export const attendanceNotificationRepository = {
  async findArrivalReminderCandidates(input: {
    windowStart: Date;
    windowEnd: Date;
  }): Promise<AttendanceReminderCandidate[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("windowStart", sql.DateTime2, input.windowStart)
      .input("windowEnd", sql.DateTime2, input.windowEnd)
      .query(`
        SELECT
          i.id AS inventory_id,
          i.scheduled_start,
          i.scheduled_end,
          s.name AS store_name,
          e.id AS employee_id,
          e.name AS employee_name,
          e.phone_number AS employee_phone_number
        FROM inventories i
        INNER JOIN stores s ON s.id = i.store_id
        INNER JOIN inventory_employees ie ON ie.inventory_id = i.id
        INNER JOIN employees e ON e.id = ie.employee_id
        LEFT JOIN whatsapp_attendance_notifications wan
          ON wan.inventory_id = i.id
          AND wan.employee_id = e.id
          AND wan.notification_type = 'ARRIVAL_REMINDER_15_MIN'
        WHERE i.status NOT IN ('CANCELLED', 'COMPLETED')
          AND s.active = 1
          AND e.active = 1
          AND i.scheduled_start >= @windowStart
          AND i.scheduled_start < @windowEnd
          AND wan.id IS NULL
      `);

    return result.recordset.map((row) => mapCandidateRow(row as Record<string, unknown>));
  },

  async findExitReminderCandidates(input: {
    windowStart: Date;
    windowEnd: Date;
  }): Promise<AttendanceReminderCandidate[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("windowStart", sql.DateTime2, input.windowStart)
      .input("windowEnd", sql.DateTime2, input.windowEnd)
      .query(`
        SELECT
          i.id AS inventory_id,
          i.scheduled_start,
          i.scheduled_end,
          s.name AS store_name,
          e.id AS employee_id,
          e.name AS employee_name,
          e.phone_number AS employee_phone_number
        FROM inventories i
        INNER JOIN stores s ON s.id = i.store_id
        INNER JOIN inventory_employees ie ON ie.inventory_id = i.id
        INNER JOIN employees e ON e.id = ie.employee_id
        INNER JOIN attendance_records ar
          ON ar.inventory_id = i.id
          AND ar.employee_id = e.id
          AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
          AND ar.checkout_at IS NULL
        LEFT JOIN whatsapp_attendance_notifications wan
          ON wan.inventory_id = i.id
          AND wan.employee_id = e.id
          AND wan.notification_type = 'EXIT_REMINDER_15_MIN'
        WHERE i.status <> 'CANCELLED'
          AND i.scheduled_end IS NOT NULL
          AND s.active = 1
          AND e.active = 1
          AND i.scheduled_end >= @windowStart
          AND i.scheduled_end < @windowEnd
          AND wan.id IS NULL
      `);

    return result.recordset.map((row) => mapCandidateRow(row as Record<string, unknown>));
  },

  async isExitReminderEligible(inventoryId: string, employeeId: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("inventoryId", sql.UniqueIdentifier, inventoryId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT TOP 1 1 AS found
        FROM attendance_records ar
        INNER JOIN inventories i ON i.id = ar.inventory_id
        WHERE ar.inventory_id = @inventoryId
          AND ar.employee_id = @employeeId
          AND ar.validation_status IN ('VALID', 'PENDING_REVIEW')
          AND ar.checkout_at IS NULL
          AND i.status <> 'CANCELLED'
          AND i.scheduled_end IS NOT NULL
      `);

    return Boolean(result.recordset[0]);
  },

  async findReminderCandidateByIds(input: {
    inventoryId: string;
    employeeId: string;
    notificationType: AttendanceNotificationType;
  }): Promise<AttendanceReminderCandidate | null> {
    const pool = getPool();
    const scheduledColumn =
      input.notificationType === "ARRIVAL_REMINDER_15_MIN" ? "i.scheduled_start" : "i.scheduled_end";

    const result = await pool
      .request()
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
        FROM inventories i
        INNER JOIN stores s ON s.id = i.store_id
        INNER JOIN inventory_employees ie ON ie.inventory_id = i.id AND ie.employee_id = @employeeId
        INNER JOIN employees e ON e.id = ie.employee_id
        WHERE i.id = @inventoryId
          AND s.active = 1
          AND e.active = 1
          AND ${scheduledColumn} IS NOT NULL
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapCandidateRow(result.recordset[0] as Record<string, unknown>);
  },

  async reserveNotification(input: {
    inventoryId: string;
    employeeId: string;
    notificationType: AttendanceNotificationType;
  }): Promise<AttendanceNotification | null> {
    const pool = getPool();

    try {
      const result = await pool
        .request()
        .input("inventoryId", sql.UniqueIdentifier, input.inventoryId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("notificationType", sql.NVarChar(40), input.notificationType)
        .query(`
          INSERT INTO whatsapp_attendance_notifications (
            inventory_id, employee_id, notification_type, status
          )
          OUTPUT INSERTED.*
          VALUES (@inventoryId, @employeeId, @notificationType, 'PENDING')
        `);

      return mapNotificationRow(result.recordset[0] as Record<string, unknown>);
    } catch (error) {
      if (isDuplicateNotificationError(error)) {
        return null;
      }

      throw error;
    }
  },

  async markSent(input: {
    notificationId: string;
    twilioMessageSid: string;
    sentAt: Date;
  }): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("notificationId", sql.UniqueIdentifier, input.notificationId)
      .input("twilioMessageSid", sql.NVarChar(100), input.twilioMessageSid)
      .input("sentAt", sql.DateTime2, input.sentAt)
      .query(`
        UPDATE whatsapp_attendance_notifications
        SET status = 'SENT',
            twilio_message_sid = @twilioMessageSid,
            sent_at = @sentAt,
            error_message = NULL
        WHERE id = @notificationId
      `);
  },

  async markFailed(input: {
    notificationId: string;
    errorMessage: string;
    sentAt: Date;
  }): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("notificationId", sql.UniqueIdentifier, input.notificationId)
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage.slice(0, 1000))
      .input("sentAt", sql.DateTime2, input.sentAt)
      .query(`
        UPDATE whatsapp_attendance_notifications
        SET status = 'FAILED',
            error_message = @errorMessage,
            sent_at = @sentAt
        WHERE id = @notificationId
      `);
  },
};
