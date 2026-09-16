import sql from "mssql";
import { getPool } from "../database/connection";
import type { DailyAttendanceReportDeliveryStatus } from "../constants/daily-attendance-report";
import type { DailyAttendanceReportDelivery } from "../types/daily-attendance-report";

const toIso = (value: Date | string | null | undefined): string | null => {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const mapDelivery = (row: Record<string, unknown>): DailyAttendanceReportDelivery => ({
  id: String(row.id),
  reportRunId: String(row.report_run_id),
  companyId: String(row.company_id),
  recipientId: String(row.recipient_id ?? ""),
  // Historical SNAPSHOT_ONLY rows may have null recipient_id; callers use emailSnapshot.
  // Empty string preserves prior non-null typing for claim/mark paths that always set FK.
  emailSnapshot: String(row.email_snapshot),
  displayNameSnapshot: row.display_name_snapshot ? String(row.display_name_snapshot) : null,
  status: String(row.status) as DailyAttendanceReportDeliveryStatus,
  attemptCount: Number(row.attempt_count ?? 0),
  nextAttemptAt: toIso(row.next_attempt_at as Date | string | null),
  leaseOwner: row.lease_owner ? String(row.lease_owner) : null,
  leaseExpiresAt: toIso(row.lease_expires_at as Date | string | null),
  providerMessageId: row.provider_message_id ? String(row.provider_message_id) : null,
  lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
  lastErrorMessage: row.last_error_message ? String(row.last_error_message) : null,
  processedAt: toIso(row.processed_at as Date | string | null),
  sentAt: toIso(row.sent_at as Date | string | null),
  createdAt: toIso(row.created_at as Date | string) ?? new Date().toISOString(),
  updatedAt: toIso(row.updated_at as Date | string) ?? new Date().toISOString(),
});

export const dailyAttendanceReportDeliveryRepository = {
  async listByRun(
    companyId: string,
    reportRunId: string,
  ): Promise<DailyAttendanceReportDelivery[]> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("reportRunId", sql.UniqueIdentifier, reportRunId)
      .query(`
        SELECT *
        FROM company_daily_attendance_report_deliveries
        WHERE company_id = @companyId AND report_run_id = @reportRunId
        ORDER BY created_at ASC
      `);
    return result.recordset.map((row) => mapDelivery(row as Record<string, unknown>));
  },

  async claimNextForRun(
    companyId: string,
    reportRunId: string,
    leaseOwner: string,
    leaseSeconds: number,
    maxAttempts: number,
  ): Promise<DailyAttendanceReportDelivery | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("reportRunId", sql.UniqueIdentifier, reportRunId)
      .input("leaseOwner", sql.NVarChar(100), leaseOwner)
      .input("leaseSeconds", sql.Int, leaseSeconds)
      .input("maxAttempts", sql.Int, maxAttempts)
      .query(`
        ;WITH next_row AS (
          SELECT TOP (1) id
          FROM company_daily_attendance_report_deliveries WITH (UPDLOCK, READPAST, ROWLOCK)
          WHERE company_id = @companyId
            AND report_run_id = @reportRunId
            AND attempt_count < @maxAttempts
            AND (lease_expires_at IS NULL OR lease_expires_at < SYSUTCDATETIME())
            AND (
              status = N'PENDING'
              OR (
                status = N'FAILED'
                AND (next_attempt_at IS NULL OR next_attempt_at <= SYSUTCDATETIME())
              )
              OR (
                status = N'PROCESSING'
                AND lease_expires_at IS NOT NULL
                AND lease_expires_at < SYSUTCDATETIME()
              )
            )
          ORDER BY created_at ASC
        )
        UPDATE d
        SET status = N'PROCESSING',
            attempt_count = attempt_count + 1,
            lease_owner = @leaseOwner,
            lease_expires_at = DATEADD(SECOND, @leaseSeconds, SYSUTCDATETIME()),
            processed_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        FROM company_daily_attendance_report_deliveries d
        INNER JOIN next_row n ON n.id = d.id
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapDelivery(row) : null;
  },

  async renewLease(
    companyId: string,
    deliveryId: string,
    leaseOwner: string,
    leaseSeconds: number,
  ): Promise<boolean> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, deliveryId)
      .input("leaseOwner", sql.NVarChar(100), leaseOwner)
      .input("leaseSeconds", sql.Int, leaseSeconds)
      .query(`
        UPDATE company_daily_attendance_report_deliveries
        SET lease_expires_at = DATEADD(SECOND, @leaseSeconds, SYSUTCDATETIME()),
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND id = @id
          AND status = N'PROCESSING'
          AND lease_owner = @leaseOwner
      `);
    return (result.rowsAffected[0] ?? 0) > 0;
  },

  async markSent(input: {
    companyId: string;
    deliveryId: string;
    leaseOwner: string;
    providerMessageId: string | null;
  }): Promise<boolean> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.deliveryId)
      .input("leaseOwner", sql.NVarChar(100), input.leaseOwner)
      .input("providerMessageId", sql.NVarChar(200), input.providerMessageId)
      .query(`
        UPDATE company_daily_attendance_report_deliveries
        SET status = N'SENT',
            provider_message_id = @providerMessageId,
            sent_at = SYSUTCDATETIME(),
            lease_owner = NULL,
            lease_expires_at = NULL,
            last_error_code = NULL,
            last_error_message = NULL,
            next_attempt_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND id = @id
          AND status = N'PROCESSING'
          AND lease_owner = @leaseOwner
      `);
    return (result.rowsAffected[0] ?? 0) > 0;
  },

  /**
   * Retryable failure → FAILED + next_attempt_at.
   * Terminal failure → FAILED_TERMINAL (never reclaimed).
   */
  async markFailed(input: {
    companyId: string;
    deliveryId: string;
    leaseOwner: string;
    error: { code: string; message: string };
    nextAttemptAt: Date | null;
    terminal: boolean;
  }): Promise<boolean> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.deliveryId)
      .input("leaseOwner", sql.NVarChar(100), input.leaseOwner)
      .input("errorCode", sql.NVarChar(80), input.error.code)
      .input("errorMessage", sql.NVarChar(1000), input.error.message)
      .input("nextAttemptAt", sql.DateTime2, input.terminal ? null : input.nextAttemptAt)
      .input("status", sql.NVarChar(30), input.terminal ? "FAILED_TERMINAL" : "FAILED")
      .query(`
        UPDATE company_daily_attendance_report_deliveries
        SET status = @status,
            last_error_code = @errorCode,
            last_error_message = @errorMessage,
            next_attempt_at = @nextAttemptAt,
            lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND id = @id
          AND status = N'PROCESSING'
          AND lease_owner = @leaseOwner
      `);
    return (result.rowsAffected[0] ?? 0) > 0;
  },

  async summarizeForRun(
    companyId: string,
    reportRunId: string,
  ): Promise<{
    sent: number;
    failedRetryable: number;
    failedTerminal: number;
    pending: number;
    total: number;
    minRetryAt: Date | null;
  }> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("reportRunId", sql.UniqueIdentifier, reportRunId)
      .query(`
        SELECT
          SUM(CASE WHEN status = N'SENT' THEN 1 ELSE 0 END) AS sent_count,
          SUM(CASE WHEN status = N'FAILED' THEN 1 ELSE 0 END) AS failed_retryable_count,
          SUM(CASE WHEN status = N'FAILED_TERMINAL' THEN 1 ELSE 0 END) AS failed_terminal_count,
          SUM(CASE WHEN status IN (N'PENDING', N'PROCESSING') THEN 1 ELSE 0 END) AS pending_count,
          COUNT(1) AS total_count,
          MIN(CASE
            WHEN status = N'FAILED' AND next_attempt_at IS NOT NULL THEN next_attempt_at
            WHEN status = N'PENDING' THEN SYSUTCDATETIME()
            ELSE NULL
          END) AS min_retry_at
        FROM company_daily_attendance_report_deliveries
        WHERE company_id = @companyId AND report_run_id = @reportRunId
      `);
    const row = result.recordset[0] as Record<string, unknown>;
    const minRetryRaw = row.min_retry_at as Date | string | null | undefined;
    return {
      sent: Number(row.sent_count ?? 0),
      failedRetryable: Number(row.failed_retryable_count ?? 0),
      failedTerminal: Number(row.failed_terminal_count ?? 0),
      pending: Number(row.pending_count ?? 0),
      total: Number(row.total_count ?? 0),
      minRetryAt: minRetryRaw
        ? minRetryRaw instanceof Date
          ? minRetryRaw
          : new Date(minRetryRaw)
        : null,
    };
  },

  async recoverExpiredDeliveryLeases(companyId: string, reportRunId: string): Promise<number> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("reportRunId", sql.UniqueIdentifier, reportRunId)
      .query(`
        UPDATE company_daily_attendance_report_deliveries
        SET status = N'FAILED',
            next_attempt_at = SYSUTCDATETIME(),
            lease_owner = NULL,
            lease_expires_at = NULL,
            last_error_code = N'LEASE_EXPIRED',
            last_error_message = N'Delivery lease expired',
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND report_run_id = @reportRunId
          AND status = N'PROCESSING'
          AND lease_expires_at IS NOT NULL
          AND lease_expires_at < SYSUTCDATETIME()
      `);
    return result.rowsAffected[0] ?? 0;
  },
};
