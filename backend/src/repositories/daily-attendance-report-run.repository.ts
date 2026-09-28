import sql from "mssql";
import { getPool } from "../database/connection";
import type { DailyAttendanceReportRunStatus } from "../constants/daily-attendance-report";
import type {
  DailyAttendanceReportEmailSnapshot,
  DailyAttendanceReportRun,
  DailyAttendanceReportTotals,
} from "../types/daily-attendance-report";
import { normalizeReportTimeHHmm } from "../utils/daily-attendance-report-time";
import { toDateOnlyString } from "../utils/row-mappers";
import { parseSqlTimeToHHmm } from "../utils/sql-time";

const toIso = (value: Date | string | null | undefined): string | null => {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const emptyTotals = (): DailyAttendanceReportTotals => ({
  scheduledWorkdays: 0, presentWorkdays: 0, absentWorkdays: 0, justifiedWorkdays: 0,
  confirmedButAbsentWorkdays: 0, unannouncedAbsenceWorkdays: 0, pendingReviewAttendances: 0,
  rejectedAttendances: 0, outsideGeofenceAttendances: 0, workedMinutes: 0, extraWorkedMinutes: 0,
  operationsCount: 0,
  scheduledEmployeesCount: 0,
  presentCount: 0,
  checkinCount: 0,
  checkoutCount: 0,
  lateCount: 0,
  earlyLeaveCount: 0,
  unavailableCount: 0,
  justifiedCount: 0,
  pendingConfirmationCount: 0,
  missingCheckinCount: 0,
  missingCheckoutCount: 0,
  incompleteCount: 0,
});

const mapRun = (row: Record<string, unknown>): DailyAttendanceReportRun => ({
  id: String(row.id),
  companyId: String(row.company_id),
  reportDate: toDateOnlyString(row.report_date as Date | string),
  timezoneId: String(row.timezone_id),
  reportTimeLocal: normalizeReportTimeHHmm(
    parseSqlTimeToHHmm(row.report_time_local) ?? String(row.report_time_local ?? ""),
  ),
  status: String(row.status) as DailyAttendanceReportRunStatus,
  recipientCount: Number(row.recipient_count ?? 0),
  totals: {
    scheduledWorkdays: Number(row.scheduled_employees_count ?? 0), presentWorkdays: Number(row.present_count ?? 0),
    absentWorkdays: Number(row.missing_checkin_count ?? 0), justifiedWorkdays: Number(row.justified_count ?? 0),
    confirmedButAbsentWorkdays: 0, unannouncedAbsenceWorkdays: 0, pendingReviewAttendances: 0, rejectedAttendances: 0, outsideGeofenceAttendances: 0, workedMinutes: 0, extraWorkedMinutes: 0,
    operationsCount: Number(row.operations_count ?? 0),
    scheduledEmployeesCount: Number(row.scheduled_employees_count ?? 0),
    presentCount: Number(row.present_count ?? 0),
    checkinCount: Number(row.checkin_count ?? 0),
    checkoutCount: Number(row.checkout_count ?? 0),
    lateCount: Number(row.late_count ?? 0),
    earlyLeaveCount: Number(row.early_leave_count ?? 0),
    unavailableCount: Number(row.unavailable_count ?? 0),
    justifiedCount: Number(row.justified_count ?? 0),
    pendingConfirmationCount: Number(row.pending_confirmation_count ?? 0),
    missingCheckinCount: Number(row.missing_checkin_count ?? 0),
    missingCheckoutCount: Number(row.missing_checkout_count ?? 0),
    incompleteCount: Number(row.incomplete_count ?? 0),
  },
  totalIncidentCount: Number(row.total_incident_count ?? 0),
  templateVersion: row.template_version ? String(row.template_version) : null,
  emailSnapshot:
    row.email_subject_snapshot != null
      ? {
          subject: String(row.email_subject_snapshot),
          text: String(row.email_text_snapshot ?? ""),
          html: String(row.email_html_snapshot ?? ""),
        }
      : null,
  xlsxSnapshot: row.xlsx_snapshot ? Buffer.from(row.xlsx_snapshot as Uint8Array) : null,
  evaluatedAt: toIso(row.evaluated_at as Date | string | null),
  attemptCount: Number(row.attempt_count ?? 0),
  nextAttemptAt: toIso(row.next_attempt_at as Date | string | null),
  leaseOwner: row.lease_owner ? String(row.lease_owner) : null,
  leaseExpiresAt: toIso(row.lease_expires_at as Date | string | null),
  lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
  lastErrorMessage: row.last_error_message ? String(row.last_error_message) : null,
  generatedAt: toIso(row.generated_at as Date | string | null),
  startedAt: toIso(row.started_at as Date | string | null),
  finishedAt: toIso(row.finished_at as Date | string | null),
  createdAt: toIso(row.created_at as Date | string) ?? new Date().toISOString(),
  updatedAt: toIso(row.updated_at as Date | string) ?? new Date().toISOString(),
});

export const dailyAttendanceReportRunRepository = {
  emptyTotals,

  async findByCompanyAndDate(
    companyId: string,
    reportDate: string,
  ): Promise<DailyAttendanceReportRun | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("reportDate", sql.Date, reportDate)
      .query(`
        SELECT TOP 1 *
        FROM company_daily_attendance_report_runs
        WHERE company_id = @companyId AND report_date = @reportDate
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRun(row) : null;
  },

  async findById(companyId: string, runId: string): Promise<DailyAttendanceReportRun | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, runId)
      .query(`
        SELECT TOP 1 *
        FROM company_daily_attendance_report_runs
        WHERE company_id = @companyId AND id = @id
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRun(row) : null;
  },

  async ensurePendingRun(input: {
    companyId: string;
    reportDate: string;
    timezoneId: string;
    reportTimeLocal: string;
  }): Promise<{ run: DailyAttendanceReportRun; created: boolean }> {
    const existing = await this.findByCompanyAndDate(input.companyId, input.reportDate);
    if (existing) {
      return { run: existing, created: false };
    }
    try {
      const result = await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("reportDate", sql.Date, input.reportDate)
        .input("timezoneId", sql.NVarChar(80), input.timezoneId)
        .input("reportTimeLocal", sql.NVarChar(8), `${input.reportTimeLocal}:00`)
        .query(`
          INSERT INTO company_daily_attendance_report_runs (
            company_id, report_date, timezone_id, report_time_local, status
          )
          OUTPUT INSERTED.*
          VALUES (
            @companyId, @reportDate, @timezoneId, CAST(@reportTimeLocal AS TIME(0)), N'PENDING'
          )
        `);
      return {
        run: mapRun(result.recordset[0] as Record<string, unknown>),
        created: true,
      };
    } catch {
      const raced = await this.findByCompanyAndDate(input.companyId, input.reportDate);
      if (raced) {
        return { run: raced, created: false };
      }
      throw new Error("FAILED_TO_ENSURE_REPORT_RUN");
    }
  },

  /**
   * Claims a run that either still needs generation OR has an eligible delivery now.
   * All retryable statuses respect next_attempt_at. Does not claim PARTIAL early.
   */
  async claimNextRun(
    leaseOwner: string,
    leaseSeconds: number,
    maxAttempts: number,
  ): Promise<DailyAttendanceReportRun | null> {
    const result = await getPool()
      .request()
      .input("leaseOwner", sql.NVarChar(100), leaseOwner)
      .input("leaseSeconds", sql.Int, leaseSeconds)
      .input("maxAttempts", sql.Int, maxAttempts)
      .query(`
        ;WITH next_row AS (
          SELECT TOP (1) r.id
          FROM company_daily_attendance_report_runs r WITH (UPDLOCK, READPAST, ROWLOCK)
          WHERE r.attempt_count < @maxAttempts
            AND (r.lease_expires_at IS NULL OR r.lease_expires_at < SYSUTCDATETIME())
            AND (r.next_attempt_at IS NULL OR r.next_attempt_at <= SYSUTCDATETIME())
            AND (
              (
                r.generated_at IS NULL
                AND r.status IN (N'PENDING', N'PROCESSING')
              )
              OR (
                r.generated_at IS NOT NULL
                AND r.status IN (N'PENDING', N'PARTIAL', N'FAILED', N'PROCESSING')
                AND EXISTS (
                  SELECT 1
                  FROM company_daily_attendance_report_deliveries d
                  WHERE d.report_run_id = r.id
                    AND d.company_id = r.company_id
                    AND d.attempt_count < @maxAttempts
                    AND (d.lease_expires_at IS NULL OR d.lease_expires_at < SYSUTCDATETIME())
                    AND (
                      d.status = N'PENDING'
                      OR (
                        d.status = N'FAILED'
                        AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= SYSUTCDATETIME())
                      )
                      OR (
                        d.status = N'PROCESSING'
                        AND d.lease_expires_at IS NOT NULL
                        AND d.lease_expires_at < SYSUTCDATETIME()
                      )
                    )
                )
              )
            )
            AND NOT EXISTS (
              SELECT 1
              FROM company_daily_attendance_report_deliveries active_d
              WHERE active_d.report_run_id = r.id
                AND active_d.company_id = r.company_id
                AND active_d.status = N'PROCESSING'
                AND active_d.lease_expires_at IS NOT NULL
                AND active_d.lease_expires_at > SYSUTCDATETIME()
            )
          ORDER BY r.created_at ASC
        )
        UPDATE r
        SET status = N'PROCESSING',
            attempt_count = attempt_count + 1,
            lease_owner = @leaseOwner,
            lease_expires_at = DATEADD(SECOND, @leaseSeconds, SYSUTCDATETIME()),
            started_at = COALESCE(started_at, SYSUTCDATETIME()),
            finished_at = NULL,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        FROM company_daily_attendance_report_runs r
        INNER JOIN next_row n ON n.id = r.id
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRun(row) : null;
  },

  async renewLease(
    companyId: string,
    runId: string,
    leaseOwner: string,
    leaseSeconds: number,
  ): Promise<boolean> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, runId)
      .input("leaseOwner", sql.NVarChar(100), leaseOwner)
      .input("leaseSeconds", sql.Int, leaseSeconds)
      .query(`
        UPDATE company_daily_attendance_report_runs
        SET lease_expires_at = DATEADD(SECOND, @leaseSeconds, SYSUTCDATETIME()),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND company_id = @companyId
          AND status = N'PROCESSING'
          AND lease_owner = @leaseOwner
      `);
    return (result.rowsAffected[0] ?? 0) > 0;
  },

  /**
   * Recovers abandoned PROCESSING runs only when no delivery still holds a live lease.
   */
  async recoverExpiredLeases(limit: number): Promise<number> {
    const result = await getPool()
      .request()
      .input("limit", sql.Int, limit)
      .query(`
        ;WITH expired AS (
          SELECT TOP (@limit) r.id
          FROM company_daily_attendance_report_runs r WITH (UPDLOCK, READPAST, ROWLOCK)
          WHERE r.status = N'PROCESSING'
            AND r.lease_expires_at IS NOT NULL
            AND r.lease_expires_at < SYSUTCDATETIME()
            AND NOT EXISTS (
              SELECT 1
              FROM company_daily_attendance_report_deliveries d
              WHERE d.report_run_id = r.id
                AND d.company_id = r.company_id
                AND d.status = N'PROCESSING'
                AND d.lease_expires_at IS NOT NULL
                AND d.lease_expires_at > SYSUTCDATETIME()
            )
          ORDER BY r.lease_expires_at ASC
        )
        UPDATE r
        SET status = CASE WHEN r.generated_at IS NULL THEN N'PENDING' ELSE N'PARTIAL' END,
            lease_owner = NULL,
            lease_expires_at = NULL,
            next_attempt_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        FROM company_daily_attendance_report_runs r
        INNER JOIN expired e ON e.id = r.id
      `);
    return result.rowsAffected[0] ?? 0;
  },

  async markSkipped(
    runId: string,
    companyId: string,
    leaseOwner: string,
    status: "SKIPPED_NO_RECIPIENTS" | "SKIPPED_NO_ACTIVITY",
  ): Promise<boolean> {
    const result = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, runId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("leaseOwner", sql.NVarChar(100), leaseOwner)
      .input("status", sql.NVarChar(40), status)
      .query(`
        UPDATE company_daily_attendance_report_runs
        SET status = @status,
            lease_owner = NULL,
            lease_expires_at = NULL,
            finished_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND company_id = @companyId
          AND status = N'PROCESSING'
          AND lease_owner = @leaseOwner
      `);
    return (result.rowsAffected[0] ?? 0) > 0;
  },

  async persistSnapshotAndAudience(
    input: {
      runId: string;
      companyId: string;
      leaseOwner: string;
      totals: DailyAttendanceReportTotals;
      recipientCount: number;
      totalIncidentCount: number;
      templateVersion: string;
      email: DailyAttendanceReportEmailSnapshot;
      xlsx: Buffer;
      evaluatedAt: Date;
      recipients: Array<{ id: string; email: string; displayName: string | null }>;
    },
  ): Promise<boolean> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const updateResult = await new sql.Request(transaction)
        .input("id", sql.UniqueIdentifier, input.runId)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("leaseOwner", sql.NVarChar(100), input.leaseOwner)
        .input("recipientCount", sql.Int, input.recipientCount)
        .input("operationsCount", sql.Int, input.totals.operationsCount)
        .input("scheduledEmployeesCount", sql.Int, input.totals.scheduledEmployeesCount)
        .input("presentCount", sql.Int, input.totals.presentCount)
        .input("checkinCount", sql.Int, input.totals.checkinCount)
        .input("checkoutCount", sql.Int, input.totals.checkoutCount)
        .input("lateCount", sql.Int, input.totals.lateCount)
        .input("earlyLeaveCount", sql.Int, input.totals.earlyLeaveCount)
        .input("unavailableCount", sql.Int, input.totals.unavailableCount)
        .input("justifiedCount", sql.Int, input.totals.justifiedCount)
        .input("pendingConfirmationCount", sql.Int, input.totals.pendingConfirmationCount)
        .input("missingCheckinCount", sql.Int, input.totals.missingCheckinCount)
        .input("missingCheckoutCount", sql.Int, input.totals.missingCheckoutCount)
        .input("incompleteCount", sql.Int, input.totals.incompleteCount)
        .input("totalIncidentCount", sql.Int, input.totalIncidentCount)
        .input("templateVersion", sql.NVarChar(40), input.templateVersion)
        .input("subject", sql.NVarChar(500), input.email.subject)
        .input("textBody", sql.NVarChar(sql.MAX), input.email.text)
        .input("htmlBody", sql.NVarChar(sql.MAX), input.email.html)
        .input("xlsx", sql.VarBinary(sql.MAX), input.xlsx)
        .input("evaluatedAt", sql.DateTime2, input.evaluatedAt)
        .query(`
          UPDATE company_daily_attendance_report_runs
          SET recipient_count = @recipientCount,
              operations_count = @operationsCount,
              scheduled_employees_count = @scheduledEmployeesCount,
              present_count = @presentCount,
              checkin_count = @checkinCount,
              checkout_count = @checkoutCount,
              late_count = @lateCount,
              early_leave_count = @earlyLeaveCount,
              unavailable_count = @unavailableCount,
              justified_count = @justifiedCount,
              pending_confirmation_count = @pendingConfirmationCount,
              missing_checkin_count = @missingCheckinCount,
              missing_checkout_count = @missingCheckoutCount,
              incomplete_count = @incompleteCount,
              total_incident_count = @totalIncidentCount,
              template_version = @templateVersion,
              email_subject_snapshot = @subject,
              email_text_snapshot = @textBody,
              email_html_snapshot = @htmlBody,
              xlsx_snapshot = @xlsx,
              evaluated_at = @evaluatedAt,
              generated_at = SYSUTCDATETIME(),
              updated_at = SYSUTCDATETIME()
          WHERE id = @id
            AND company_id = @companyId
            AND status = N'PROCESSING'
            AND lease_owner = @leaseOwner
            AND generated_at IS NULL
        `);
      if ((updateResult.rowsAffected[0] ?? 0) === 0) {
        await transaction.rollback();
        return false;
      }

      for (const recipient of input.recipients) {
        await new sql.Request(transaction)
          .input("companyId", sql.UniqueIdentifier, input.companyId)
          .input("reportRunId", sql.UniqueIdentifier, input.runId)
          .input("recipientId", sql.UniqueIdentifier, recipient.id)
          .input("email", sql.NVarChar(320), recipient.email)
          .input("displayName", sql.NVarChar(200), recipient.displayName)
          .query(`
            INSERT INTO company_daily_attendance_report_deliveries (
              report_run_id, company_id, recipient_id, email_snapshot, display_name_snapshot,
              status, recipient_origin
            )
            VALUES (
              @reportRunId, @companyId, @recipientId, @email, @displayName,
              N'PENDING', N'ALERT_RECIPIENT'
            )
          `);
      }

      await transaction.commit();
      return true;
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // ignore rollback errors
      }
      throw error;
    }
  },

  async finalizeStatus(input: {
    runId: string;
    companyId: string;
    leaseOwner: string;
    status: DailyAttendanceReportRunStatus;
    error?: { code: string; message: string } | null;
    nextAttemptAt?: Date | null;
  }): Promise<boolean> {
    const result = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, input.runId)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("leaseOwner", sql.NVarChar(100), input.leaseOwner)
      .input("status", sql.NVarChar(40), input.status)
      .input("errorCode", sql.NVarChar(80), input.error?.code ?? null)
      .input("errorMessage", sql.NVarChar(1000), input.error?.message ?? null)
      .input("nextAttemptAt", sql.DateTime2, input.nextAttemptAt ?? null)
      .query(`
        UPDATE company_daily_attendance_report_runs
        SET status = @status,
            last_error_code = @errorCode,
            last_error_message = @errorMessage,
            next_attempt_at = @nextAttemptAt,
            lease_owner = NULL,
            lease_expires_at = NULL,
            finished_at = CASE
              WHEN @status IN (N'SENT', N'PARTIAL', N'FAILED', N'SKIPPED_NO_RECIPIENTS', N'SKIPPED_NO_ACTIVITY')
                THEN SYSUTCDATETIME()
              ELSE finished_at
            END,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND company_id = @companyId
          AND status = N'PROCESSING'
          AND lease_owner = @leaseOwner
      `);
    return (result.rowsAffected[0] ?? 0) > 0;
  },

  async reopenForManual(input: {
    companyId: string;
    runId: string;
    clearSnapshot: boolean;
  }): Promise<boolean> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.runId)
      .input("clearSnapshot", sql.Bit, input.clearSnapshot ? 1 : 0)
      .query(`
        UPDATE company_daily_attendance_report_runs
        SET status = N'PENDING',
            finished_at = NULL,
            next_attempt_at = NULL,
            lease_owner = NULL,
            lease_expires_at = NULL,
            last_error_code = NULL,
            last_error_message = NULL,
            generated_at = CASE WHEN @clearSnapshot = 1 THEN NULL ELSE generated_at END,
            evaluated_at = CASE WHEN @clearSnapshot = 1 THEN NULL ELSE evaluated_at END,
            email_subject_snapshot = CASE WHEN @clearSnapshot = 1 THEN NULL ELSE email_subject_snapshot END,
            email_text_snapshot = CASE WHEN @clearSnapshot = 1 THEN NULL ELSE email_text_snapshot END,
            email_html_snapshot = CASE WHEN @clearSnapshot = 1 THEN NULL ELSE email_html_snapshot END,
            template_version = CASE WHEN @clearSnapshot = 1 THEN NULL ELSE template_version END,
            recipient_count = CASE WHEN @clearSnapshot = 1 THEN 0 ELSE recipient_count END,
            total_incident_count = CASE WHEN @clearSnapshot = 1 THEN 0 ELSE total_incident_count END,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND company_id = @companyId
          AND status IN (N'SKIPPED_NO_RECIPIENTS', N'SKIPPED_NO_ACTIVITY', N'PARTIAL', N'FAILED', N'PENDING')
      `);
    return (result.rowsAffected[0] ?? 0) > 0;
  },

  async deleteDeliveriesForRegeneration(companyId: string, runId: string): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("reportRunId", sql.UniqueIdentifier, runId)
      .query(`
        DELETE FROM company_daily_attendance_report_deliveries
        WHERE company_id = @companyId AND report_run_id = @reportRunId
      `);
  },
};
