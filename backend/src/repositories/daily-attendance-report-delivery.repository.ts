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
  recipientId: String(row.recipient_id),
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
  async ensureDeliveries(
    companyId: string,
    reportRunId: string,
    recipients: Array<{ id: string; email: string; displayName: string | null }>,
  ): Promise<number> {
    let created = 0;
    for (const recipient of recipients) {
      const result = await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("reportRunId", sql.UniqueIdentifier, reportRunId)
        .input("recipientId", sql.UniqueIdentifier, recipient.id)
        .input("email", sql.NVarChar(320), recipient.email)
        .input("displayName", sql.NVarChar(200), recipient.displayName)
        .query(`
          IF NOT EXISTS (
            SELECT 1
            FROM company_daily_attendance_report_deliveries
            WHERE report_run_id = @reportRunId AND recipient_id = @recipientId
          )
          BEGIN
            INSERT INTO company_daily_attendance_report_deliveries (
              report_run_id, company_id, recipient_id, email_snapshot, display_name_snapshot, status
            )
            VALUES (
              @reportRunId, @companyId, @recipientId, @email, @displayName, N'PENDING'
            );
            SELECT 1 AS created;
          END
          ELSE
            SELECT 0 AS created;
        `);
      if (Number(result.recordset[0]?.created ?? 0) === 1) {
        created += 1;
      }
    }
    return created;
  },

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

  async markSent(
    companyId: string,
    deliveryId: string,
    providerMessageId: string | null,
  ): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, deliveryId)
      .input("providerMessageId", sql.NVarChar(200), providerMessageId)
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
        WHERE company_id = @companyId AND id = @id
      `);
  },

  async markFailed(
    companyId: string,
    deliveryId: string,
    error: { code: string; message: string },
    nextAttemptAt: Date | null,
    terminal: boolean,
  ): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, deliveryId)
      .input("errorCode", sql.NVarChar(80), error.code)
      .input("errorMessage", sql.NVarChar(1000), error.message)
      .input("nextAttemptAt", sql.DateTime2, nextAttemptAt)
      .input("terminal", sql.Bit, terminal ? 1 : 0)
      .query(`
        UPDATE company_daily_attendance_report_deliveries
        SET status = N'FAILED',
            last_error_code = @errorCode,
            last_error_message = @errorMessage,
            next_attempt_at = @nextAttemptAt,
            lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId AND id = @id
      `);
  },

  async summarizeForRun(
    companyId: string,
    reportRunId: string,
  ): Promise<{ sent: number; failed: number; pending: number; total: number }> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("reportRunId", sql.UniqueIdentifier, reportRunId)
      .query(`
        SELECT
          SUM(CASE WHEN status = N'SENT' THEN 1 ELSE 0 END) AS sent_count,
          SUM(CASE WHEN status = N'FAILED' THEN 1 ELSE 0 END) AS failed_count,
          SUM(CASE WHEN status IN (N'PENDING', N'PROCESSING') THEN 1 ELSE 0 END) AS pending_count,
          COUNT(1) AS total_count
        FROM company_daily_attendance_report_deliveries
        WHERE company_id = @companyId AND report_run_id = @reportRunId
      `);
    const row = result.recordset[0] as Record<string, unknown>;
    return {
      sent: Number(row.sent_count ?? 0),
      failed: Number(row.failed_count ?? 0),
      pending: Number(row.pending_count ?? 0),
      total: Number(row.total_count ?? 0),
    };
  },
};
