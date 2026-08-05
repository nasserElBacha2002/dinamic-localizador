import sql from "mssql";
import { getPool } from "../database/connection";
import {
  PAYROLL_RECEIPT_NOTIFICATION_DEFAULT_MAX_ATTEMPTS,
  PAYROLL_RECEIPT_NOTIFICATION_TYPE,
  type PayrollReceiptNotificationStatus,
  type PayrollReceiptNotificationType,
} from "../constants/payroll-receipt-notification";
import type { PayrollReceiptNotification } from "../types/payroll-receipt-notification";
import { isDuplicateKeyError } from "../utils/sql-server-errors";
import { payrollReceiptMetrics } from "../utils/payroll-receipts/metrics";

const requestFrom = (transaction?: sql.Transaction) =>
  transaction ? new sql.Request(transaction) : getPool().request();

const mapRow = (row: Record<string, unknown>): PayrollReceiptNotification => ({
  id: String(row.id),
  companyId: String(row.company_id),
  payrollReceiptId: String(row.payroll_receipt_id),
  employeeId: String(row.employee_id),
  notificationType: String(row.notification_type) as PayrollReceiptNotificationType,
  status: String(row.status) as PayrollReceiptNotificationStatus,
  attemptCount: Number(row.attempt_count ?? 0),
  nextAttemptAt: row.next_attempt_at
    ? new Date(row.next_attempt_at as Date | string).toISOString()
    : null,
  leaseOwner: row.lease_owner ? String(row.lease_owner) : null,
  leaseExpiresAt: row.lease_expires_at
    ? new Date(row.lease_expires_at as Date | string).toISOString()
    : null,
  providerMessageSid: row.provider_message_sid ? String(row.provider_message_sid) : null,
  lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
  lastErrorMessage: row.last_error_message ? String(row.last_error_message) : null,
  sentAt: row.sent_at ? new Date(row.sent_at as Date | string).toISOString() : null,
  createdAt: new Date(row.created_at as Date | string).toISOString(),
  updatedAt: new Date(row.updated_at as Date | string).toISOString(),
});

const findExisting = async (
  companyId: string,
  payrollReceiptId: string,
  notificationType: string,
  transaction?: sql.Transaction,
): Promise<PayrollReceiptNotification | null> => {
  const result = await requestFrom(transaction)
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("payrollReceiptId", sql.UniqueIdentifier, payrollReceiptId)
    .input("notificationType", sql.NVarChar(40), notificationType)
    .query(`
      SELECT TOP 1 *
      FROM whatsapp_payroll_receipt_notifications WITH (UPDLOCK, HOLDLOCK)
      WHERE company_id = @companyId
        AND payroll_receipt_id = @payrollReceiptId
        AND notification_type = @notificationType
    `);
  if (!result.recordset[0]) {
    return null;
  }
  return mapRow(result.recordset[0] as Record<string, unknown>);
};

export const payrollReceiptNotificationRepository = {
  async enqueueAvailable(
    companyId: string,
    receiptId: string,
    employeeId: string,
    transaction?: sql.Transaction,
  ): Promise<PayrollReceiptNotification> {
    const notificationType = PAYROLL_RECEIPT_NOTIFICATION_TYPE;
    try {
      const inserted = await requestFrom(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("payrollReceiptId", sql.UniqueIdentifier, receiptId)
        .input("employeeId", sql.UniqueIdentifier, employeeId)
        .input("notificationType", sql.NVarChar(40), notificationType)
        .query(`
          INSERT INTO whatsapp_payroll_receipt_notifications (
            company_id, payroll_receipt_id, employee_id, notification_type, status
          )
          OUTPUT INSERTED.*
          VALUES (
            @companyId, @payrollReceiptId, @employeeId, @notificationType, N'PENDING'
          )
        `);
      const created = mapRow(inserted.recordset[0] as Record<string, unknown>);
      payrollReceiptMetrics.notificationCreated({ status: "PENDING" });
      return created;
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      const existing = await findExisting(companyId, receiptId, notificationType, transaction);
      if (existing) {
        return existing;
      }
      throw error;
    }
  },

  /**
   * Cancel pending / retryable failed notifications for a receipt (replace / soft-delete).
   */
  async cancelPendingForReceipt(
    companyId: string,
    receiptId: string,
    transaction?: sql.Transaction,
  ): Promise<number> {
    const result = await requestFrom(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("payrollReceiptId", sql.UniqueIdentifier, receiptId)
      .query(`
        UPDATE whatsapp_payroll_receipt_notifications
        SET status = N'CANCELLED',
            lease_owner = NULL,
            lease_expires_at = NULL,
            next_attempt_at = NULL,
            last_error_code = N'CANCELLED',
            last_error_message = N'Receipt superseded or deleted',
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND payroll_receipt_id = @payrollReceiptId
          AND status IN (N'PENDING', N'FAILED')
      `);
    return Number(result.rowsAffected[0] ?? 0);
  },

  /**
   * Recover expired PROCESSING leases back to PENDING (or FAILED when max attempts reached).
   */
  async recoverExpiredLeases(
    batchSize = 50,
    maxAttempts = PAYROLL_RECEIPT_NOTIFICATION_DEFAULT_MAX_ATTEMPTS,
  ): Promise<number> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const selected = await new sql.Request(transaction)
        .input("batchSize", sql.Int, batchSize)
        .query(`
          SELECT TOP (@batchSize) id, company_id
          FROM whatsapp_payroll_receipt_notifications WITH (UPDLOCK, READPAST, ROWLOCK)
          WHERE status = N'PROCESSING'
            AND lease_expires_at IS NOT NULL
            AND lease_expires_at < SYSUTCDATETIME()
          ORDER BY lease_expires_at ASC
        `);

      let recovered = 0;
      for (const row of selected.recordset as Array<Record<string, unknown>>) {
        const result = await new sql.Request(transaction)
          .input("id", sql.UniqueIdentifier, String(row.id))
          .input("companyId", sql.UniqueIdentifier, String(row.company_id))
          .input("maxAttempts", sql.Int, maxAttempts)
          .query(`
            UPDATE whatsapp_payroll_receipt_notifications
            SET attempt_count = attempt_count + 1,
                last_error_code = N'LEASE_EXPIRED',
                last_error_message = N'Lease expired before completion',
                status = CASE
                  WHEN attempt_count + 1 >= @maxAttempts THEN N'FAILED'
                  ELSE N'PENDING'
                END,
                next_attempt_at = CASE
                  WHEN attempt_count + 1 >= @maxAttempts THEN NULL
                  ELSE SYSUTCDATETIME()
                END,
                lease_owner = NULL,
                lease_expires_at = NULL,
                updated_at = SYSUTCDATETIME()
            WHERE id = @id
              AND company_id = @companyId
              AND status = N'PROCESSING'
              AND lease_expires_at IS NOT NULL
              AND lease_expires_at < SYSUTCDATETIME()
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

  /**
   * Claim up to `limit` due PENDING/FAILED rows with UPDLOCK READPAST ROWLOCK.
   */
  async claimNextBatch(
    workerId: string,
    limit: number,
    leaseSeconds: number,
    maxAttempts = PAYROLL_RECEIPT_NOTIFICATION_DEFAULT_MAX_ATTEMPTS,
  ): Promise<PayrollReceiptNotification[]> {
    const claimed: PayrollReceiptNotification[] = [];
    const pool = getPool();

    for (let i = 0; i < limit; i += 1) {
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
              FROM whatsapp_payroll_receipt_notifications WITH (UPDLOCK, READPAST, ROWLOCK)
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
            FROM whatsapp_payroll_receipt_notifications n
            INNER JOIN next_row r ON r.id = n.id AND r.company_id = n.company_id
            WHERE n.status IN (N'PENDING', N'FAILED')
          `);

        if (!result.recordset[0]) {
          await transaction.commit();
          break;
        }

        await transaction.commit();
        claimed.push(mapRow(result.recordset[0] as Record<string, unknown>));
      } catch (error) {
        try {
          await transaction.rollback();
        } catch {
          /* ignore */
        }
        throw error;
      }
    }

    return claimed;
  },

  async markSent(input: {
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
        UPDATE whatsapp_payroll_receipt_notifications
        SET status = N'SENT',
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
          AND status = N'PROCESSING'
      `);
    if ((result.rowsAffected[0] ?? 0) === 0) {
      throw new Error("MARK_SENT_NOOP");
    }
  },

  async markFailed(input: {
    companyId: string;
    notificationId: string;
    errorCode: string;
    errorMessage: string;
    nextAttemptAt: Date | null;
    permanent?: boolean;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.notificationId)
      .input("errorCode", sql.NVarChar(80), input.errorCode.slice(0, 80))
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage.slice(0, 1000))
      .input("nextAttemptAt", sql.DateTime2, input.nextAttemptAt)
      .query(`
        UPDATE whatsapp_payroll_receipt_notifications
        SET status = N'FAILED',
            last_error_code = @errorCode,
            last_error_message = @errorMessage,
            next_attempt_at = @nextAttemptAt,
            lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND company_id = @companyId
          AND status = N'PROCESSING'
      `);
  },

  async markCancelled(input: {
    companyId: string;
    notificationId: string;
    errorCode?: string;
    errorMessage?: string;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.notificationId)
      .input("errorCode", sql.NVarChar(80), (input.errorCode ?? "CANCELLED").slice(0, 80))
      .input(
        "errorMessage",
        sql.NVarChar(1000),
        (input.errorMessage ?? "Notification cancelled").slice(0, 1000),
      )
      .query(`
        UPDATE whatsapp_payroll_receipt_notifications
        SET status = N'CANCELLED',
            last_error_code = @errorCode,
            last_error_message = @errorMessage,
            lease_owner = NULL,
            lease_expires_at = NULL,
            next_attempt_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND company_id = @companyId
          AND status = N'PROCESSING'
      `);
  },

  async markSentRecoveryRequired(input: {
    companyId: string;
    notificationId: string;
    providerMessageSid: string;
    errorMessage: string;
  }): Promise<void> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.notificationId)
      .input("providerMessageSid", sql.NVarChar(100), input.providerMessageSid)
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage.slice(0, 1000))
      .query(`
        UPDATE whatsapp_payroll_receipt_notifications
        SET status = N'SENT_RECOVERY_REQUIRED',
            provider_message_sid = @providerMessageSid,
            last_error_code = N'MARK_SENT_FAILED',
            last_error_message = @errorMessage,
            lease_owner = NULL,
            lease_expires_at = NULL,
            next_attempt_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND company_id = @companyId
          AND status = N'PROCESSING'
      `);
    if ((result.rowsAffected[0] ?? 0) === 0) {
      throw new Error("MARK_SENT_RECOVERY_REQUIRED_NOOP");
    }
  },
};
