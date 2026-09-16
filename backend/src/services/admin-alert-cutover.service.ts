import sql from "mssql";
import { getPool } from "../database/connection";
import { env } from "../config/env";
import { companyAlertRecipientRepository } from "../repositories/company-alert-recipient.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { assertDailyReportAudienceSchemaReady } from "../utils/daily-attendance-report-schema-guard";
import { ADMIN_DAILY_REPORT_ALERT_TYPES } from "../utils/admin-notification-channel-policy";
import { logAdminAlertEvent } from "../utils/admin-alert/observability";
import type { AdminAlertDeliveryMode } from "../utils/admin-notification-channel-policy";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import { normalizeReportTimeHHmm } from "../utils/daily-attendance-report-time";

const INFORMATIONAL_TYPES_SQL = ADMIN_DAILY_REPORT_ALERT_TYPES.map((t) => `N'${t}'`).join(", ");

export type AdminAlertCutoverResult = {
  companyId: string;
  before: AdminAlertDeliveryMode;
  after: AdminAlertDeliveryMode;
  suppressedCount: number;
  configVersion: string;
};

const validateDailyEmailPreconditions = async (companyId: string): Promise<void> => {
  const schema = await assertDailyReportAudienceSchemaReady();
  if (!schema.ok) {
    throw Object.assign(new Error("SCHEMA_INCOMPATIBLE"), {
      code: "SCHEMA_INCOMPATIBLE",
      message: schema.reason,
    });
  }

  if (env.EMAIL_TRANSPORT !== "smtp") {
    throw Object.assign(new Error("SMTP_NOT_OPERATIONAL"), {
      code: "SMTP_NOT_OPERATIONAL",
      message: "EMAIL_TRANSPORT debe ser smtp para activar DAILY_EMAIL.",
    });
  }

  const settings = await companySettingsRepository.findByCompanyId(companyId);
  if (!settings) {
    throw Object.assign(new Error("COMPANY_SETTINGS_NOT_FOUND"), {
      code: "COMPANY_SETTINGS_NOT_FOUND",
    });
  }
  if (!settings.dailyAttendanceReportEnabled) {
    throw Object.assign(new Error("DAILY_REPORT_DISABLED"), {
      code: "DAILY_REPORT_DISABLED",
      message: "Habilitá el reporte diario antes de migrar a DAILY_EMAIL.",
    });
  }

  try {
    resolveOperationTimezone(settings.operationTimezone);
    normalizeReportTimeHHmm(settings.dailyAttendanceReportTime);
  } catch (error) {
    throw Object.assign(new Error("INVALID_TIMEZONE_OR_TIME"), {
      code: "INVALID_TIMEZONE_OR_TIME",
      message: error instanceof Error ? error.message : "Timezone u horario inválido.",
    });
  }

  const recipients =
    await companyAlertRecipientRepository.listEnabledWithUserEmailForDailyReport(companyId);
  if (recipients.length === 0) {
    throw Object.assign(new Error("NO_EMAIL_RECIPIENTS"), {
      code: "NO_EMAIL_RECIPIENTS",
      message:
        "Se requiere al menos un destinatario activo de alertas operativas con email válido.",
    });
  }
};

/**
 * Suppress informational admin WhatsApp rows that are still sendable.
 * Does not touch SENT / urgents. Idempotent.
 */
const suppressInformationalPending = async (
  companyId: string,
  configVersion: string,
  transaction: sql.Transaction,
): Promise<number> => {
  const result = await new sql.Request(transaction)
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("reason", sql.NVarChar(80), "CUTOVER_DAILY_EMAIL")
    .input("configVersion", sql.NVarChar(64), configVersion)
    .query(`
      UPDATE whatsapp_admin_alert_notifications
      SET status = N'CANCELLED',
          suppressed_at = SYSUTCDATETIME(),
          suppressed_reason = @reason,
          suppressed_config_version = @configVersion,
          lease_owner = NULL,
          lease_expires_at = NULL,
          next_attempt_at = NULL,
          last_error_code = N'CUTOVER_DAILY_EMAIL',
          last_error_message = N'Suppressed during DAILY_EMAIL cutover',
          updated_at = SYSUTCDATETIME()
      WHERE company_id = @companyId
        AND alert_type IN (${INFORMATIONAL_TYPES_SQL})
        AND status IN (
          N'PENDING', N'PROCESSING', N'SEND_STARTED', N'FAILED', N'RECONCILIATION_REQUIRED'
        )
        AND (suppressed_at IS NULL)
    `);
  return Number(result.rowsAffected[0] ?? 0);
};

export const adminAlertCutoverService = {
  /**
   * Automatic cutover: if the company already qualifies for DAILY_EMAIL and is still
   * on WHATSAPP_LEGACY, migrate without operator UI. Failures are soft (logged) so
   * report enable / workers are not blocked when preconditions are incomplete.
   */
  async tryAutoCutoverToDailyEmail(input: {
    companyId: string;
    actorUserId?: string;
  }): Promise<AdminAlertCutoverResult | null> {
    const settings = await companySettingsRepository.findByCompanyId(input.companyId);
    if (!settings) {
      return null;
    }
    if ((settings.adminAlertDeliveryMode ?? "WHATSAPP_LEGACY") === "DAILY_EMAIL") {
      return null;
    }
    if (!settings.dailyAttendanceReportEnabled) {
      return null;
    }

    try {
      return await this.setDeliveryMode({
        companyId: input.companyId,
        mode: "DAILY_EMAIL",
        actorUserId: input.actorUserId ?? "system:auto-cutover",
      });
    } catch (error) {
      const code = (error as { code?: string }).code ?? "AUTO_CUTOVER_FAILED";
      logAdminAlertEvent("ADMIN_ALERT_CHANNEL_SUPPRESSED", {
        companyId: input.companyId,
        reason: code,
        mode: "WHATSAPP_LEGACY",
        channel: "DAILY_REPORT_ONLY",
        origin: "auto-cutover",
      });
      console.warn("[admin-alert-cutover] auto cutover deferred", {
        companyId: input.companyId,
        code,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },

  async setDeliveryMode(input: {
    companyId: string;
    mode: AdminAlertDeliveryMode;
    actorUserId: string;
  }): Promise<AdminAlertCutoverResult> {
    const settings = await companySettingsRepository.findByCompanyId(input.companyId);
    if (!settings) {
      throw Object.assign(new Error("COMPANY_SETTINGS_NOT_FOUND"), {
        code: "COMPANY_SETTINGS_NOT_FOUND",
      });
    }

    const before = settings.adminAlertDeliveryMode ?? "WHATSAPP_LEGACY";
    const after = input.mode;
    if (before === after) {
      return {
        companyId: input.companyId,
        before,
        after,
        suppressedCount: 0,
        configVersion: `noop:${before}`,
      };
    }

    if (after === "DAILY_EMAIL") {
      await validateDailyEmailPreconditions(input.companyId);
    }

    const configVersion = `${after}:${input.actorUserId}:${new Date().toISOString()}`;
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      let suppressedCount = 0;
      if (after === "DAILY_EMAIL") {
        suppressedCount = await suppressInformationalPending(
          input.companyId,
          configVersion,
          transaction,
        );
      }

      const updated = await companySettingsRepository.update(
        input.companyId,
        { adminAlertDeliveryMode: after },
        transaction,
      );
      if (!updated) {
        throw Object.assign(new Error("COMPANY_SETTINGS_NOT_FOUND"), {
          code: "COMPANY_SETTINGS_NOT_FOUND",
        });
      }

      await transaction.commit();

      logAdminAlertEvent(
        after === "DAILY_EMAIL" ? "ADMIN_ALERT_CUTOVER_APPLIED" : "ADMIN_ALERT_CUTOVER_ROLLBACK",
        {
          companyId: input.companyId,
          actorUserId: input.actorUserId,
          before,
          after,
          suppressedCount,
          configVersion,
        },
      );
      if (suppressedCount > 0) {
        logAdminAlertEvent("ADMIN_ALERT_PENDING_SUPPRESSED", {
          companyId: input.companyId,
          suppressedCount,
          configVersion,
          reason: "CUTOVER_DAILY_EMAIL",
        });
      }

      return {
        companyId: input.companyId,
        before,
        after,
        suppressedCount,
        configVersion,
      };
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // ignore
      }
      throw error;
    }
  },
};
