import sql from "mssql";
import { getPool } from "../database/connection";
import {
  ADMIN_ALERT_DEFAULT_MAX_ATTEMPTS,
  type AdminAlertNotificationStatus,
  type AdminAlertSendAttemptStatus,
  type AdminAlertSeverity,
  type AdminAlertTemplateCategory,
  type AdminAlertType,
} from "../constants/admin-alert";
import type {
  AdminAlertNotification,
  AdminAlertNotificationSendAttempt,
} from "../types/admin-alert";
import { isDuplicateKeyError } from "../utils/sql-server-errors";
import { monotonicProviderStatusAdvanceSql } from "../utils/whatsapp-observability";

const requestFrom = (transaction?: sql.Transaction) =>
  transaction ? new sql.Request(transaction) : getPool().request();

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapRow = (row: Record<string, unknown>): AdminAlertNotification => ({
  id: String(row.id),
  companyId: String(row.company_id),
  recipientId: String(row.recipient_id),
  employeeId: row.employee_id ? String(row.employee_id) : null,
  operationId: row.operation_id ? String(row.operation_id) : null,
  absenceRequestId: row.absence_request_id ? String(row.absence_request_id) : null,
  alertType: String(row.alert_type) as AdminAlertType,
  severity: String(row.severity) as AdminAlertSeverity,
  templateCategory: String(row.template_category) as AdminAlertTemplateCategory,
  deduplicationKey: String(row.deduplication_key),
  recipientPhone: String(row.recipient_phone),
  contentVariablesJson: String(row.content_variables_json),
  status: String(row.status) as AdminAlertNotificationStatus,
  attemptCount: Number(row.attempt_count ?? 0),
  nextAttemptAt: row.next_attempt_at ? toIso(row.next_attempt_at as Date | string) : null,
  leaseOwner: row.lease_owner ? String(row.lease_owner) : null,
  leaseExpiresAt: row.lease_expires_at
    ? toIso(row.lease_expires_at as Date | string)
    : null,
  providerMessageSid: row.provider_message_sid ? String(row.provider_message_sid) : null,
  providerStatus: row.provider_status ? String(row.provider_status) : null,
  activeSendAttemptId: row.active_send_attempt_id
    ? String(row.active_send_attempt_id)
    : null,
  lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
  lastErrorMessage: row.last_error_message ? String(row.last_error_message) : null,
  occurredAt: toIso(row.occurred_at as Date | string),
  sentAt: row.sent_at ? toIso(row.sent_at as Date | string) : null,
  createdAt: toIso(row.created_at as Date | string),
  updatedAt: toIso(row.updated_at as Date | string),
});

const mapAttemptRow = (row: Record<string, unknown>): AdminAlertNotificationSendAttempt => ({
  id: String(row.id),
  companyId: String(row.company_id),
  notificationId: String(row.notification_id),
  attemptNumber: Number(row.attempt_number),
  status: String(row.status) as AdminAlertSendAttemptStatus,
  providerMessageSid: row.provider_message_sid ? String(row.provider_message_sid) : null,
  lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
  lastErrorMessage: row.last_error_message ? String(row.last_error_message) : null,
  startedAt: toIso(row.started_at as Date | string),
  finishedAt: row.finished_at ? toIso(row.finished_at as Date | string) : null,
  createdAt: toIso(row.created_at as Date | string),
  updatedAt: toIso(row.updated_at as Date | string),
});

export type AdminAlertEnqueueInput = {
  companyId: string;
  recipientId: string;
  employeeId?: string | null;
  operationId?: string | null;
  absenceRequestId?: string | null;
  alertType: AdminAlertType;
  severity: AdminAlertSeverity;
  templateCategory: AdminAlertTemplateCategory;
  deduplicationKey: string;
  recipientPhone: string;
  contentVariablesJson: string;
  occurredAt?: Date;
};

export const adminAlertNotificationRepository = {
  async enqueue(
    input: AdminAlertEnqueueInput,
    transaction?: sql.Transaction,
  ): Promise<{ notification: AdminAlertNotification; created: boolean }> {
    try {
      const inserted = await requestFrom(transaction)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("recipientId", sql.UniqueIdentifier, input.recipientId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId ?? null)
        .input("operationId", sql.UniqueIdentifier, input.operationId ?? null)
        .input("absenceRequestId", sql.UniqueIdentifier, input.absenceRequestId ?? null)
        .input("alertType", sql.NVarChar(60), input.alertType)
        .input("severity", sql.NVarChar(20), input.severity)
        .input("templateCategory", sql.NVarChar(20), input.templateCategory)
        .input("deduplicationKey", sql.NVarChar(200), input.deduplicationKey)
        .input("recipientPhone", sql.NVarChar(20), input.recipientPhone)
        .input("contentVariablesJson", sql.NVarChar(sql.MAX), input.contentVariablesJson)
        .input("occurredAt", sql.DateTime2, input.occurredAt ?? new Date())
        .query(`
          INSERT INTO whatsapp_admin_alert_notifications (
            company_id, recipient_id, employee_id, operation_id, absence_request_id,
            alert_type, severity, template_category, deduplication_key, recipient_phone,
            content_variables_json, status, occurred_at
          )
          OUTPUT INSERTED.*
          VALUES (
            @companyId, @recipientId, @employeeId, @operationId, @absenceRequestId,
            @alertType, @severity, @templateCategory, @deduplicationKey, @recipientPhone,
            @contentVariablesJson, N'PENDING', @occurredAt
          )
        `);
      return {
        notification: mapRow(inserted.recordset[0] as Record<string, unknown>),
        created: true,
      };
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      const existing = await requestFrom(transaction)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("deduplicationKey", sql.NVarChar(200), input.deduplicationKey)
        .input("recipientId", sql.UniqueIdentifier, input.recipientId)
        .query(`
          SELECT TOP 1 *
          FROM whatsapp_admin_alert_notifications
          WHERE company_id = @companyId
            AND deduplication_key = @deduplicationKey
            AND recipient_id = @recipientId
        `);
      const row = existing.recordset[0] as Record<string, unknown> | undefined;
      if (!row) {
        throw error;
      }
      return { notification: mapRow(row), created: false };
    }
  },

  async recoverExpiredLeases(batchSize = 50): Promise<number> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const selected = await new sql.Request(transaction)
        .input("batchSize", sql.Int, batchSize)
        .query(`
          SELECT TOP (@batchSize) id, company_id
          FROM whatsapp_admin_alert_notifications WITH (UPDLOCK, READPAST, ROWLOCK)
          WHERE status IN (N'PROCESSING', N'SEND_STARTED')
            AND lease_expires_at IS NOT NULL
            AND lease_expires_at < SYSUTCDATETIME()
          ORDER BY lease_expires_at ASC
        `);

      let recovered = 0;
      for (const row of selected.recordset as Array<Record<string, unknown>>) {
        const result = await new sql.Request(transaction)
          .input("id", sql.UniqueIdentifier, String(row.id))
          .input("companyId", sql.UniqueIdentifier, String(row.company_id))
          .query(`
            UPDATE n
            SET last_error_code = N'LEASE_EXPIRED',
                last_error_message = N'Lease expired before completion',
                status = CASE
                  WHEN n.status = N'SEND_STARTED' THEN N'RECONCILIATION_REQUIRED'
                  WHEN EXISTS (
                    SELECT 1
                    FROM whatsapp_admin_alert_notification_send_attempts a
                    WHERE a.id = n.active_send_attempt_id
                      AND a.company_id = n.company_id
                      AND a.status IN (N'STARTED', N'AMBIGUOUS')
                  ) THEN N'RECONCILIATION_REQUIRED'
                  ELSE N'PENDING'
                END,
                lease_owner = NULL,
                lease_expires_at = NULL,
                next_attempt_at = CASE
                  WHEN n.status = N'SEND_STARTED'
                    OR EXISTS (
                      SELECT 1
                      FROM whatsapp_admin_alert_notification_send_attempts a
                      WHERE a.id = n.active_send_attempt_id
                        AND a.company_id = n.company_id
                        AND a.status IN (N'STARTED', N'AMBIGUOUS')
                    )
                  THEN NULL
                  ELSE SYSUTCDATETIME()
                END,
                updated_at = SYSUTCDATETIME()
            FROM whatsapp_admin_alert_notifications n
            WHERE n.id = @id
              AND n.company_id = @companyId
              AND n.status IN (N'PROCESSING', N'SEND_STARTED')
              AND n.lease_expires_at IS NOT NULL
              AND n.lease_expires_at < SYSUTCDATETIME()
          `);
        recovered += result.rowsAffected[0] ?? 0;
      }

      await transaction.commit();
      return recovered;
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
      throw error;
    }
  },

  async claimNextOne(
    workerId: string,
    leaseSeconds: number,
    maxAttempts = ADMIN_ALERT_DEFAULT_MAX_ATTEMPTS,
  ): Promise<AdminAlertNotification | null> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const result = await new sql.Request(transaction)
        .input("maxAttempts", sql.Int, maxAttempts)
        .input("leaseOwner", sql.NVarChar(100), workerId)
        .input("leaseSeconds", sql.Int, leaseSeconds)
        .query(`
          ;WITH next_row AS (
            SELECT TOP (1) id, company_id
            FROM whatsapp_admin_alert_notifications WITH (UPDLOCK, READPAST, ROWLOCK)
            WHERE attempt_count < @maxAttempts
              AND (lease_expires_at IS NULL OR lease_expires_at < SYSUTCDATETIME())
              AND (
                status = N'PENDING'
                OR (
                  status = N'FAILED'
                  AND next_attempt_at IS NOT NULL
                  AND next_attempt_at <= SYSUTCDATETIME()
                )
              )
            ORDER BY
              CASE WHEN status = N'PENDING' THEN 0 ELSE 1 END,
              COALESCE(next_attempt_at, created_at) ASC,
              created_at ASC
          )
          UPDATE n
          SET status = N'PROCESSING',
              attempt_count = attempt_count + 1,
              lease_owner = @leaseOwner,
              lease_expires_at = DATEADD(SECOND, @leaseSeconds, SYSUTCDATETIME()),
              next_attempt_at = NULL,
              updated_at = SYSUTCDATETIME()
          OUTPUT INSERTED.*
          FROM whatsapp_admin_alert_notifications n
          INNER JOIN next_row r ON r.id = n.id AND r.company_id = n.company_id
          WHERE n.status IN (N'PENDING', N'FAILED')
        `);

      await transaction.commit();
      if (!result.recordset[0]) {
        return null;
      }
      return mapRow(result.recordset[0] as Record<string, unknown>);
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
      throw error;
    }
  },

  async claimNextBatch(
    workerId: string,
    limit: number,
    leaseSeconds: number,
    maxAttempts = ADMIN_ALERT_DEFAULT_MAX_ATTEMPTS,
  ): Promise<AdminAlertNotification[]> {
    const claimed: AdminAlertNotification[] = [];
    for (let i = 0; i < limit; i += 1) {
      const row = await this.claimNextOne(workerId, leaseSeconds, maxAttempts);
      if (!row) {
        break;
      }
      claimed.push(row);
    }
    return claimed;
  },

  async beginSendAttempt(input: {
    companyId: string;
    notificationId: string;
    leaseOwner: string;
    attemptNumber: number;
  }): Promise<AdminAlertNotificationSendAttempt | null> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const inserted = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("notificationId", sql.UniqueIdentifier, input.notificationId)
        .input("attemptNumber", sql.Int, input.attemptNumber)
        .query(`
          INSERT INTO whatsapp_admin_alert_notification_send_attempts (
            company_id, notification_id, attempt_number, status
          )
          OUTPUT INSERTED.*
          VALUES (@companyId, @notificationId, @attemptNumber, N'STARTED')
        `);
      const attempt = mapAttemptRow(inserted.recordset[0] as Record<string, unknown>);

      const cas = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("id", sql.UniqueIdentifier, input.notificationId)
        .input("leaseOwner", sql.NVarChar(100), input.leaseOwner)
        .input("attemptId", sql.UniqueIdentifier, attempt.id)
        .query(`
          UPDATE whatsapp_admin_alert_notifications
          SET status = N'SEND_STARTED',
              active_send_attempt_id = @attemptId,
              updated_at = SYSUTCDATETIME()
          WHERE id = @id
            AND company_id = @companyId
            AND lease_owner = @leaseOwner
            AND status = N'PROCESSING'
        `);

      if ((cas.rowsAffected[0] ?? 0) === 0) {
        await transaction.rollback();
        return null;
      }

      await transaction.commit();
      return attempt;
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
      throw error;
    }
  },

  async markSendAttemptAccepted(input: {
    companyId: string;
    attemptId: string;
    providerMessageSid: string;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.attemptId)
      .input("providerMessageSid", sql.NVarChar(100), input.providerMessageSid)
      .query(`
        UPDATE whatsapp_admin_alert_notification_send_attempts
        SET status = N'PROVIDER_ACCEPTED',
            provider_message_sid = @providerMessageSid,
            finished_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId
      `);
  },

  async markSendAttemptFailed(input: {
    companyId: string;
    attemptId: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.attemptId)
      .input("errorCode", sql.NVarChar(80), input.errorCode.slice(0, 80))
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage.slice(0, 1000))
      .query(`
        UPDATE whatsapp_admin_alert_notification_send_attempts
        SET status = N'PROVIDER_FAILED',
            last_error_code = @errorCode,
            last_error_message = @errorMessage,
            finished_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId
      `);
  },

  async markSendAttemptAmbiguous(input: {
    companyId: string;
    attemptId: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.attemptId)
      .input("errorCode", sql.NVarChar(80), input.errorCode.slice(0, 80))
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage.slice(0, 1000))
      .query(`
        UPDATE whatsapp_admin_alert_notification_send_attempts
        SET status = N'AMBIGUOUS',
            last_error_code = @errorCode,
            last_error_message = @errorMessage,
            finished_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId
      `);
  },

  async markSendAccepted(input: {
    companyId: string;
    notificationId: string;
    providerMessageSid: string;
    sentAt?: Date;
  }): Promise<void> {
    const sentAt = input.sentAt ?? new Date();
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.notificationId)
      .input("providerMessageSid", sql.NVarChar(100), input.providerMessageSid)
      .input("sentAt", sql.DateTime2, sentAt)
      .query(`
        UPDATE whatsapp_admin_alert_notifications
        SET status = N'SEND_ACCEPTED',
            provider_message_sid = @providerMessageSid,
            sent_at = @sentAt,
            lease_owner = NULL,
            lease_expires_at = NULL,
            next_attempt_at = NULL,
            last_error_code = NULL,
            last_error_message = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND company_id = @companyId
          AND status IN (N'PROCESSING', N'SEND_STARTED')
      `);
    if ((result.rowsAffected[0] ?? 0) === 0) {
      throw new Error("MARK_SEND_ACCEPTED_NOOP");
    }
  },

  async markFailed(input: {
    companyId: string;
    notificationId: string;
    errorCode: string;
    errorMessage: string;
    nextAttemptAt: Date | null;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.notificationId)
      .input("errorCode", sql.NVarChar(80), input.errorCode.slice(0, 80))
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage.slice(0, 1000))
      .input("nextAttemptAt", sql.DateTime2, input.nextAttemptAt)
      .query(`
        UPDATE whatsapp_admin_alert_notifications
        SET status = N'FAILED',
            last_error_code = @errorCode,
            last_error_message = @errorMessage,
            next_attempt_at = @nextAttemptAt,
            lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND company_id = @companyId
          AND status IN (N'PROCESSING', N'SEND_STARTED')
      `);
  },

  async markSkipped(input: {
    companyId: string;
    notificationId: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.notificationId)
      .input("errorCode", sql.NVarChar(80), input.errorCode.slice(0, 80))
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage.slice(0, 1000))
      .query(`
        UPDATE whatsapp_admin_alert_notifications
        SET status = N'SKIPPED',
            last_error_code = @errorCode,
            last_error_message = @errorMessage,
            lease_owner = NULL,
            lease_expires_at = NULL,
            next_attempt_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND company_id = @companyId
          AND status IN (N'PROCESSING', N'SEND_STARTED')
      `);
  },

  async markSentRecoveryRequired(input: {
    companyId: string;
    notificationId: string;
    providerMessageSid: string;
    errorMessage: string;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.notificationId)
      .input("providerMessageSid", sql.NVarChar(100), input.providerMessageSid)
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage.slice(0, 1000))
      .query(`
        UPDATE whatsapp_admin_alert_notifications
        SET status = N'SENT_RECOVERY_REQUIRED',
            provider_message_sid = @providerMessageSid,
            last_error_code = N'MARK_SEND_ACCEPTED_FAILED',
            last_error_message = @errorMessage,
            lease_owner = NULL,
            lease_expires_at = NULL,
            next_attempt_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND company_id = @companyId
          AND status IN (N'PROCESSING', N'SEND_STARTED')
      `);
  },

  async markReconciliationRequired(input: {
    companyId: string;
    notificationId: string;
    errorCode?: string;
    errorMessage?: string;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.notificationId)
      .input("errorCode", sql.NVarChar(80), (input.errorCode ?? "AMBIGUOUS_SEND").slice(0, 80))
      .input(
        "errorMessage",
        sql.NVarChar(1000),
        (input.errorMessage ?? "Send outcome ambiguous; manual reconcile required").slice(
          0,
          1000,
        ),
      )
      .query(`
        UPDATE whatsapp_admin_alert_notifications
        SET status = N'RECONCILIATION_REQUIRED',
            last_error_code = @errorCode,
            last_error_message = @errorMessage,
            lease_owner = NULL,
            lease_expires_at = NULL,
            next_attempt_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND company_id = @companyId
          AND status IN (N'PROCESSING', N'SEND_STARTED')
      `);
  },

  async applyProviderStatusUpdate(input: {
    providerMessageSid: string;
    providerStatus: string;
  }): Promise<number> {
    const advance = monotonicProviderStatusAdvanceSql("provider_status", "@providerStatus");
    const result = await getPool()
      .request()
      .input("providerMessageSid", sql.NVarChar(100), input.providerMessageSid)
      .input("providerStatus", sql.NVarChar(40), input.providerStatus.toLowerCase())
      .query(`
        UPDATE whatsapp_admin_alert_notifications
        SET provider_status = @providerStatus,
            updated_at = SYSUTCDATETIME()
        WHERE provider_message_sid = @providerMessageSid
          AND ${advance}
      `);
    return result.rowsAffected[0] ?? 0;
  },

  async projectProviderStatusById(input: {
    notificationId: string;
    providerStatus: string;
  }): Promise<void> {
    const advance = monotonicProviderStatusAdvanceSql("provider_status", "@providerStatus");
    await getPool()
      .request()
      .input("notificationId", sql.UniqueIdentifier, input.notificationId)
      .input("providerStatus", sql.NVarChar(40), input.providerStatus.toLowerCase())
      .query(`
        UPDATE whatsapp_admin_alert_notifications
        SET provider_status = @providerStatus,
            updated_at = SYSUTCDATETIME()
        WHERE id = @notificationId
          AND ${advance}
      `);
  },

  async projectProviderStatusByMessageSid(input: {
    providerMessageSid: string;
    providerStatus: string;
  }): Promise<void> {
    const advance = monotonicProviderStatusAdvanceSql("provider_status", "@providerStatus");
    await getPool()
      .request()
      .input("providerMessageSid", sql.NVarChar(100), input.providerMessageSid)
      .input("providerStatus", sql.NVarChar(40), input.providerStatus.toLowerCase())
      .query(`
        UPDATE whatsapp_admin_alert_notifications
        SET provider_status = @providerStatus,
            updated_at = SYSUTCDATETIME()
        WHERE provider_message_sid = @providerMessageSid
          AND ${advance}
      `);
  },
};
