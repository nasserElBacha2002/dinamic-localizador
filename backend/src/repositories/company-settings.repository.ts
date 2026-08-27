import sql from "mssql";
import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../constants/company-settings";
import { getPool } from "../database/connection";
import type { CompanySettings } from "../types/company";
import { isDuplicateKeyError } from "../utils/sql-server-errors";
import { parseSqlTimeToHHmm, toSqlTimeValue } from "../utils/sql-time";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export type CompanySettingsInput = {
  operationTimezone: string;
  defaultRadiusMeters: number;
  lateGraceMinutes: number;
  earlyLeaveToleranceMinutes: number;
  requireCheckoutLocation: boolean;
  allowManualAttendanceCorrections: boolean;
  defaultEarlyArrivalToleranceMinutes: number;
  defaultLateArrivalToleranceMinutes: number;
  defaultOperationStartTime?: string | null;
  defaultOperationEndTime?: string | null;
  geofenceReviewMarginMeters?: number | null;
  confirmationReminderEnabled: boolean;
  confirmationReminderHoursBefore: number;
  pendingOperationExpirationHours: number;
};

const mapSettingsRow = (row: Record<string, unknown>): CompanySettings => ({
  id: String(row.id),
  companyId: String(row.company_id),
  operationTimezone: String(row.operation_timezone),
  defaultRadiusMeters: Number(row.default_radius_meters),
  lateGraceMinutes: Number(row.late_grace_minutes),
  earlyLeaveToleranceMinutes: Number(row.early_leave_tolerance_minutes),
  requireCheckoutLocation: Boolean(row.require_checkout_location),
  allowManualAttendanceCorrections: Boolean(row.allow_manual_attendance_corrections),
  defaultEarlyArrivalToleranceMinutes: Number(row.default_early_arrival_tolerance_minutes ?? 60),
  defaultLateArrivalToleranceMinutes: Number(row.default_late_arrival_tolerance_minutes ?? 90),
  defaultOperationStartTime: parseSqlTimeToHHmm(row.default_operation_start_time),
  defaultOperationEndTime: parseSqlTimeToHHmm(row.default_operation_end_time),
  geofenceReviewMarginMeters:
    row.geofence_review_margin_meters == null
      ? null
      : Number(row.geofence_review_margin_meters),
  confirmationReminderEnabled: Boolean(row.confirmation_reminder_enabled ?? true),
  confirmationReminderHoursBefore: Number(row.confirmation_reminder_hours_before ?? 24),
  pendingOperationExpirationHours: Number(
    row.pending_operation_expiration_hours ??
      DEFAULT_COMPANY_OPERATIONAL_SETTINGS.pendingOperationExpirationHours,
  ),
  absenceAdvancedCalendarEnabled:
    row.absence_advanced_calendar_enabled == null
      ? false
      : Boolean(row.absence_advanced_calendar_enabled),
  absenceBalanceLedgerEnabled:
    row.absence_balance_ledger_enabled == null
      ? false
      : Boolean(row.absence_balance_ledger_enabled),
  absenceAttachmentsEnabled:
    row.absence_attachments_enabled == null
      ? false
      : Boolean(row.absence_attachments_enabled),
  absenceOperationalIntegrationEnabled:
    row.absence_operational_integration_enabled == null
      ? false
      : Boolean(row.absence_operational_integration_enabled),
  adminAlertsEnabled:
    row.admin_alerts_enabled == null ? false : Boolean(row.admin_alerts_enabled),
  adminAlertsEnabledAt: row.admin_alerts_enabled_at
    ? toIsoString(row.admin_alerts_enabled_at as Date | string)
    : null,
  attendanceThresholdAlertsEnabled:
    row.attendance_threshold_alerts_enabled == null
      ? false
      : Boolean(row.attendance_threshold_alerts_enabled),
  attendanceAlertThresholdPercent: Number(
    row.attendance_alert_threshold_percent ?? 80,
  ),
  attendanceAlertWindowDays: Number(row.attendance_alert_window_days ?? 30),
  attendanceAlertMinimumWorkdays: Number(
    row.attendance_alert_minimum_workdays ?? 5,
  ),
  attendanceAlertCooldownDays: Number(row.attendance_alert_cooldown_days ?? 7),
  attendanceAlertConfigVersion: Number(row.attendance_alert_config_version ?? 0),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const companySettingsRepository = {
  async findByCompanyId(companyId: string): Promise<CompanySettings | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query("SELECT * FROM company_settings WHERE company_id = @companyId");

    if (!result.recordset[0]) {
      return null;
    }

    return mapSettingsRow(result.recordset[0] as Record<string, unknown>);
  },

  async create(
    companyId: string,
    input: CompanySettingsInput,
    transaction?: sql.Transaction,
  ): Promise<CompanySettings> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationTimezone", sql.NVarChar(80), input.operationTimezone)
      .input("defaultRadiusMeters", sql.Int, input.defaultRadiusMeters)
      .input("lateGraceMinutes", sql.Int, input.lateGraceMinutes)
      .input("earlyLeaveToleranceMinutes", sql.Int, input.earlyLeaveToleranceMinutes)
      .input("requireCheckoutLocation", sql.Bit, input.requireCheckoutLocation ? 1 : 0)
      .input(
        "allowManualAttendanceCorrections",
        sql.Bit,
        input.allowManualAttendanceCorrections ? 1 : 0,
      )
      .input(
        "defaultEarlyArrivalToleranceMinutes",
        sql.Int,
        input.defaultEarlyArrivalToleranceMinutes,
      )
      .input("defaultLateArrivalToleranceMinutes", sql.Int, input.defaultLateArrivalToleranceMinutes)
      .input(
        "defaultOperationStartTime",
        sql.VarChar(8),
        toSqlTimeValue(input.defaultOperationStartTime),
      )
      .input("defaultOperationEndTime", sql.VarChar(8), toSqlTimeValue(input.defaultOperationEndTime))
      .input("geofenceReviewMarginMeters", sql.Int, input.geofenceReviewMarginMeters ?? null)
      .input(
        "confirmationReminderEnabled",
        sql.Bit,
        input.confirmationReminderEnabled ? 1 : 0,
      )
      .input(
        "confirmationReminderHoursBefore",
        sql.Int,
        input.confirmationReminderHoursBefore,
      )
      .input(
        "pendingOperationExpirationHours",
        sql.Int,
        input.pendingOperationExpirationHours,
      )
      .query(`
        INSERT INTO company_settings (
          company_id, operation_timezone, default_radius_meters,
          late_grace_minutes, early_leave_tolerance_minutes,
          require_checkout_location, allow_manual_attendance_corrections,
          default_early_arrival_tolerance_minutes, default_late_arrival_tolerance_minutes,
          default_operation_start_time, default_operation_end_time,
          geofence_review_margin_meters,
          confirmation_reminder_enabled, confirmation_reminder_hours_before,
          pending_operation_expiration_hours
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @operationTimezone, @defaultRadiusMeters,
          @lateGraceMinutes, @earlyLeaveToleranceMinutes,
          @requireCheckoutLocation, @allowManualAttendanceCorrections,
          @defaultEarlyArrivalToleranceMinutes, @defaultLateArrivalToleranceMinutes,
          @defaultOperationStartTime, @defaultOperationEndTime,
          @geofenceReviewMarginMeters,
          @confirmationReminderEnabled, @confirmationReminderHoursBefore,
          @pendingOperationExpirationHours
        )
      `);

    return mapSettingsRow(result.recordset[0] as Record<string, unknown>);
  },

  async findOrCreateByCompanyId(
    companyId: string,
    defaults: CompanySettingsInput,
  ): Promise<CompanySettings> {
    const existing = await this.findByCompanyId(companyId);
    if (existing) {
      return existing;
    }

    try {
      return await this.create(companyId, defaults);
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const raced = await this.findByCompanyId(companyId);
      if (raced) {
        return raced;
      }

      throw error;
    }
  },

  async update(
    companyId: string,
    input: Partial<
      Pick<
        CompanySettings,
        | "operationTimezone"
        | "defaultRadiusMeters"
        | "lateGraceMinutes"
        | "earlyLeaveToleranceMinutes"
        | "requireCheckoutLocation"
        | "allowManualAttendanceCorrections"
        | "defaultEarlyArrivalToleranceMinutes"
        | "defaultLateArrivalToleranceMinutes"
        | "defaultOperationStartTime"
        | "defaultOperationEndTime"
        | "geofenceReviewMarginMeters"
        | "confirmationReminderEnabled"
        | "confirmationReminderHoursBefore"
        | "pendingOperationExpirationHours"
        | "absenceAdvancedCalendarEnabled"
        | "absenceAttachmentsEnabled"
        | "absenceOperationalIntegrationEnabled"
        | "adminAlertsEnabled"
        | "attendanceThresholdAlertsEnabled"
        | "attendanceAlertThresholdPercent"
        | "attendanceAlertWindowDays"
        | "attendanceAlertMinimumWorkdays"
        | "attendanceAlertCooldownDays"
      >
    >,
  ): Promise<CompanySettings | null> {
    const pool = getPool();
    const fields: string[] = [];
    const request = pool.request().input("companyId", sql.UniqueIdentifier, companyId);
    let bumpAttendanceConfigVersion = false;

    if (input.operationTimezone !== undefined) {
      request.input("operationTimezone", sql.NVarChar(80), input.operationTimezone);
      fields.push("operation_timezone = @operationTimezone");
    }
    if (input.defaultRadiusMeters !== undefined) {
      request.input("defaultRadiusMeters", sql.Int, input.defaultRadiusMeters);
      fields.push("default_radius_meters = @defaultRadiusMeters");
    }
    if (input.lateGraceMinutes !== undefined) {
      request.input("lateGraceMinutes", sql.Int, input.lateGraceMinutes);
      fields.push("late_grace_minutes = @lateGraceMinutes");
    }
    if (input.earlyLeaveToleranceMinutes !== undefined) {
      request.input(
        "earlyLeaveToleranceMinutes",
        sql.Int,
        input.earlyLeaveToleranceMinutes,
      );
      fields.push("early_leave_tolerance_minutes = @earlyLeaveToleranceMinutes");
    }
    if (input.requireCheckoutLocation !== undefined) {
      request.input("requireCheckoutLocation", sql.Bit, input.requireCheckoutLocation ? 1 : 0);
      fields.push("require_checkout_location = @requireCheckoutLocation");
    }
    if (input.allowManualAttendanceCorrections !== undefined) {
      request.input(
        "allowManualAttendanceCorrections",
        sql.Bit,
        input.allowManualAttendanceCorrections ? 1 : 0,
      );
      fields.push("allow_manual_attendance_corrections = @allowManualAttendanceCorrections");
    }
    if (input.defaultEarlyArrivalToleranceMinutes !== undefined) {
      request.input(
        "defaultEarlyArrivalToleranceMinutes",
        sql.Int,
        input.defaultEarlyArrivalToleranceMinutes,
      );
      fields.push("default_early_arrival_tolerance_minutes = @defaultEarlyArrivalToleranceMinutes");
    }
    if (input.defaultLateArrivalToleranceMinutes !== undefined) {
      request.input(
        "defaultLateArrivalToleranceMinutes",
        sql.Int,
        input.defaultLateArrivalToleranceMinutes,
      );
      fields.push("default_late_arrival_tolerance_minutes = @defaultLateArrivalToleranceMinutes");
    }
    if (input.defaultOperationStartTime !== undefined) {
      request.input(
        "defaultOperationStartTime",
        sql.VarChar(8),
        toSqlTimeValue(input.defaultOperationStartTime),
      );
      fields.push("default_operation_start_time = @defaultOperationStartTime");
    }
    if (input.defaultOperationEndTime !== undefined) {
      request.input(
        "defaultOperationEndTime",
        sql.VarChar(8),
        toSqlTimeValue(input.defaultOperationEndTime),
      );
      fields.push("default_operation_end_time = @defaultOperationEndTime");
    }
    if (input.geofenceReviewMarginMeters !== undefined) {
      request.input("geofenceReviewMarginMeters", sql.Int, input.geofenceReviewMarginMeters);
      fields.push("geofence_review_margin_meters = @geofenceReviewMarginMeters");
    }
    if (input.confirmationReminderEnabled !== undefined) {
      request.input(
        "confirmationReminderEnabled",
        sql.Bit,
        input.confirmationReminderEnabled ? 1 : 0,
      );
      fields.push("confirmation_reminder_enabled = @confirmationReminderEnabled");
    }
    if (input.confirmationReminderHoursBefore !== undefined) {
      request.input(
        "confirmationReminderHoursBefore",
        sql.Int,
        input.confirmationReminderHoursBefore,
      );
      fields.push("confirmation_reminder_hours_before = @confirmationReminderHoursBefore");
    }
    if (input.pendingOperationExpirationHours !== undefined) {
      request.input(
        "pendingOperationExpirationHours",
        sql.Int,
        input.pendingOperationExpirationHours,
      );
      fields.push("pending_operation_expiration_hours = @pendingOperationExpirationHours");
    }
    if (input.absenceAdvancedCalendarEnabled !== undefined) {
      request.input(
        "absenceAdvancedCalendarEnabled",
        sql.Bit,
        input.absenceAdvancedCalendarEnabled ? 1 : 0,
      );
      fields.push("absence_advanced_calendar_enabled = @absenceAdvancedCalendarEnabled");
    }
    if (input.absenceAttachmentsEnabled !== undefined) {
      request.input(
        "absenceAttachmentsEnabled",
        sql.Bit,
        input.absenceAttachmentsEnabled ? 1 : 0,
      );
      fields.push("absence_attachments_enabled = @absenceAttachmentsEnabled");
    }
    if (input.absenceOperationalIntegrationEnabled !== undefined) {
      request.input(
        "absenceOperationalIntegrationEnabled",
        sql.Bit,
        input.absenceOperationalIntegrationEnabled ? 1 : 0,
      );
      fields.push(
        "absence_operational_integration_enabled = @absenceOperationalIntegrationEnabled",
      );
    }
    if (input.adminAlertsEnabled !== undefined) {
      request.input("adminAlertsEnabled", sql.Bit, input.adminAlertsEnabled ? 1 : 0);
      // false→true: stamp a new frontier. true stays true / true→false: keep enabled_at.
      fields.push(`admin_alerts_enabled = @adminAlertsEnabled`);
      fields.push(`admin_alerts_enabled_at = CASE
        WHEN @adminAlertsEnabled = 1 AND ISNULL(admin_alerts_enabled, 0) = 0
          THEN SYSUTCDATETIME()
        ELSE admin_alerts_enabled_at
      END`);
    }
    if (input.attendanceThresholdAlertsEnabled !== undefined) {
      request.input(
        "attendanceThresholdAlertsEnabled",
        sql.Bit,
        input.attendanceThresholdAlertsEnabled ? 1 : 0,
      );
      fields.push(
        "attendance_threshold_alerts_enabled = @attendanceThresholdAlertsEnabled",
      );
      bumpAttendanceConfigVersion = true;
    }
    if (input.attendanceAlertThresholdPercent !== undefined) {
      request.input(
        "attendanceAlertThresholdPercent",
        sql.Int,
        input.attendanceAlertThresholdPercent,
      );
      fields.push("attendance_alert_threshold_percent = @attendanceAlertThresholdPercent");
      bumpAttendanceConfigVersion = true;
    }
    if (input.attendanceAlertWindowDays !== undefined) {
      request.input("attendanceAlertWindowDays", sql.Int, input.attendanceAlertWindowDays);
      fields.push("attendance_alert_window_days = @attendanceAlertWindowDays");
      bumpAttendanceConfigVersion = true;
    }
    if (input.attendanceAlertMinimumWorkdays !== undefined) {
      request.input(
        "attendanceAlertMinimumWorkdays",
        sql.Int,
        input.attendanceAlertMinimumWorkdays,
      );
      fields.push("attendance_alert_minimum_workdays = @attendanceAlertMinimumWorkdays");
      bumpAttendanceConfigVersion = true;
    }
    if (input.attendanceAlertCooldownDays !== undefined) {
      request.input(
        "attendanceAlertCooldownDays",
        sql.Int,
        input.attendanceAlertCooldownDays,
      );
      fields.push("attendance_alert_cooldown_days = @attendanceAlertCooldownDays");
      bumpAttendanceConfigVersion = true;
    }
    if (bumpAttendanceConfigVersion) {
      fields.push(
        "attendance_alert_config_version = ISNULL(attendance_alert_config_version, 0) + 1",
      );
    }

    if (fields.length === 0) {
      return this.findByCompanyId(companyId);
    }

    fields.push("updated_at = SYSUTCDATETIME()");

    const result = await request.query(`
      UPDATE company_settings
      SET ${fields.join(", ")}
      OUTPUT INSERTED.*
      WHERE company_id = @companyId
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapSettingsRow(result.recordset[0] as Record<string, unknown>);
  },
};
