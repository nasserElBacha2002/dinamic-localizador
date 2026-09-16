import sql from "mssql";
import { getPool } from "../database/connection";
import type { DailyAttendanceReportRunStatus } from "../constants/daily-attendance-report";
import type {
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
          SELECT TOP (1) id
          FROM company_daily_attendance_report_runs WITH (UPDLOCK, READPAST, ROWLOCK)
          WHERE attempt_count < @maxAttempts
            AND (lease_expires_at IS NULL OR lease_expires_at < SYSUTCDATETIME())
            AND (
              status = N'PENDING'
              OR status = N'PARTIAL'
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
        UPDATE r
        SET status = N'PROCESSING',
            attempt_count = attempt_count + 1,
            lease_owner = @leaseOwner,
            lease_expires_at = DATEADD(SECOND, @leaseSeconds, SYSUTCDATETIME()),
            started_at = COALESCE(started_at, SYSUTCDATETIME()),
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        FROM company_daily_attendance_report_runs r
        INNER JOIN next_row n ON n.id = r.id
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRun(row) : null;
  },

  async recoverExpiredLeases(limit: number): Promise<number> {
    const result = await getPool()
      .request()
      .input("limit", sql.Int, limit)
      .query(`
        ;WITH expired AS (
          SELECT TOP (@limit) id
          FROM company_daily_attendance_report_runs WITH (UPDLOCK, READPAST, ROWLOCK)
          WHERE status = N'PROCESSING'
            AND lease_expires_at IS NOT NULL
            AND lease_expires_at < SYSUTCDATETIME()
          ORDER BY lease_expires_at ASC
        )
        UPDATE r
        SET status = N'PENDING',
            lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        FROM company_daily_attendance_report_runs r
        INNER JOIN expired e ON e.id = r.id
      `);
    return result.rowsAffected[0] ?? 0;
  },

  async markSkipped(
    runId: string,
    companyId: string,
    status: "SKIPPED_NO_RECIPIENTS" | "SKIPPED_NO_ACTIVITY",
  ): Promise<void> {
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, runId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("status", sql.NVarChar(40), status)
      .query(`
        UPDATE company_daily_attendance_report_runs
        SET status = @status,
            lease_owner = NULL,
            lease_expires_at = NULL,
            finished_at = SYSUTCDATETIME(),
            generated_at = COALESCE(generated_at, SYSUTCDATETIME()),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId
      `);
  },

  async updateTotals(
    runId: string,
    companyId: string,
    totals: DailyAttendanceReportTotals,
    recipientCount: number,
  ): Promise<void> {
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, runId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("recipientCount", sql.Int, recipientCount)
      .input("operationsCount", sql.Int, totals.operationsCount)
      .input("scheduledEmployeesCount", sql.Int, totals.scheduledEmployeesCount)
      .input("presentCount", sql.Int, totals.presentCount)
      .input("checkinCount", sql.Int, totals.checkinCount)
      .input("checkoutCount", sql.Int, totals.checkoutCount)
      .input("lateCount", sql.Int, totals.lateCount)
      .input("earlyLeaveCount", sql.Int, totals.earlyLeaveCount)
      .input("unavailableCount", sql.Int, totals.unavailableCount)
      .input("justifiedCount", sql.Int, totals.justifiedCount)
      .input("pendingConfirmationCount", sql.Int, totals.pendingConfirmationCount)
      .input("missingCheckinCount", sql.Int, totals.missingCheckinCount)
      .input("missingCheckoutCount", sql.Int, totals.missingCheckoutCount)
      .input("incompleteCount", sql.Int, totals.incompleteCount)
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
            generated_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId
      `);
  },

  async finalizeStatus(
    runId: string,
    companyId: string,
    status: DailyAttendanceReportRunStatus,
    error?: { code: string; message: string } | null,
    nextAttemptAt?: Date | null,
  ): Promise<void> {
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, runId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("status", sql.NVarChar(40), status)
      .input("errorCode", sql.NVarChar(80), error?.code ?? null)
      .input("errorMessage", sql.NVarChar(1000), error?.message ?? null)
      .input("nextAttemptAt", sql.DateTime2, nextAttemptAt ?? null)
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
        WHERE id = @id AND company_id = @companyId
      `);
  },

  emptyTotals,
};
