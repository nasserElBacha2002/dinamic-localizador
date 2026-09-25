import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { env } from "../config/env";
import { getPool } from "../database/connection";
import { companyAlertRecipientRepository } from "../repositories/company-alert-recipient.repository";
import { monthlyAttendanceReportDeliveryRepository } from "../repositories/monthly-attendance-report-delivery.repository";
import { monthlyAttendanceReportRunRepository } from "../repositories/monthly-attendance-report-run.repository";
import { buildMonthlyAttendanceReportEmail } from "./monthly-attendance-report-email.builder";
import { buildMonthlyAttendanceXlsx } from "./monthly-attendance-report-xlsx.builder";
import { sendEmail } from "./email.service";
import { monthlyAttendanceReportService } from "./monthly-attendance-report.service";

const owner = () => `monthly-${process.pid}-${randomUUID()}`;
const retryAt = (attempt: number) => new Date(Date.now() + env.DAILY_ATTENDANCE_REPORT_RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1));
const eligibleCompanies = async (): Promise<Array<{ id: string; name: string; timezone: string; reportTime: string }>> => {
  const r = await getPool().request().query("SELECT c.id,c.name,COALESCE(cs.operation_timezone,c.default_timezone,N'America/Argentina/Buenos_Aires') timezone,CONVERT(varchar(5),COALESCE(cs.daily_attendance_report_time,'08:00'),108) report_time FROM companies c INNER JOIN company_settings cs ON cs.company_id=c.id WHERE c.status=N'ACTIVE' AND cs.daily_attendance_report_enabled=1");
  return r.recordset.map((row) => ({ id: String(row.id), name: String(row.name), timezone: String(row.timezone), reportTime: String(row.report_time).slice(0, 5) }));
};

export const monthlyAttendanceReportDeliveryService = {
  async processPreviousMonth(company: { id: string; name: string; timezone: string; reportTime?: string }, now = new Date()): Promise<void> {
    const localNow = DateTime.fromJSDate(now, { zone: company.timezone });
    if (localNow.day === 1 && localNow.toFormat("HH:mm") < (company.reportTime ?? "08:00")) return;
    const previous = DateTime.fromJSDate(now, { zone: company.timezone }).startOf("month").minus({ months: 1 });
    const year = previous.year; const month = previous.month;
    const run = await monthlyAttendanceReportRunRepository.ensure(company.id, year, month, company.timezone);
    const leaseOwner = owner();
    const claimed = await monthlyAttendanceReportRunRepository.claim(run.id, company.id, leaseOwner, Math.ceil(env.DAILY_ATTENDANCE_REPORT_LEASE_MS / 1000));
    if (!claimed) return;
    try {
      let current = claimed;
      const recipients = await companyAlertRecipientRepository.listEnabledWithUserEmailForDailyReport(company.id);
      if (!recipients.length) { await monthlyAttendanceReportRunRepository.mark(current.id, company.id, leaseOwner, "SKIPPED_NO_RECIPIENTS"); return; }
      if (!current.subject || !current.xlsx) {
        const dataset = await monthlyAttendanceReportService.buildMonthlyAttendanceReport({ companyId: company.id, year, month, timezone: company.timezone, evaluatedAt: now });
        const email = buildMonthlyAttendanceReportEmail(dataset, company.name);
        const xlsx = buildMonthlyAttendanceXlsx(dataset);
        const snapshotWritten = await monthlyAttendanceReportRunRepository.snapshot({ run: current, owner: leaseOwner, subject: email.subject, text: email.text, html: email.html, xlsx });
        if (!snapshotWritten) throw new Error("MONTHLY_REPORT_SNAPSHOT_LEASE_LOST");
        await monthlyAttendanceReportDeliveryRepository.snapshot(current.id, company.id, recipients);
        current = (await monthlyAttendanceReportRunRepository.ensure(company.id, year, month, company.timezone));
      }
      await monthlyAttendanceReportDeliveryRepository.snapshot(current.id, company.id, recipients);
      for (;;) {
        const delivery = await monthlyAttendanceReportDeliveryRepository.claim(current.id, company.id, leaseOwner, Math.ceil(env.DAILY_ATTENDANCE_REPORT_LEASE_MS / 1000));
        if (!delivery) break;
        try {
          const result = await sendEmail({ to: delivery.email, subject: current.subject!, text: current.text!, html: current.html!, attachments: [{ filename: `reporte-asistencia-${year}-${String(month).padStart(2, "0")}.xlsx`, content: current.xlsx!, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }] });
          if (result.sent) await monthlyAttendanceReportDeliveryRepository.sent(delivery.id, company.id, leaseOwner, result.messageId);
          else await monthlyAttendanceReportDeliveryRepository.failed(delivery.id, company.id, leaseOwner, result.publicErrorCode ?? "EMAIL_NOT_DELIVERED", delivery.attemptCount >= env.DAILY_ATTENDANCE_REPORT_MAX_ATTEMPTS ? null : retryAt(delivery.attemptCount), delivery.attemptCount >= env.DAILY_ATTENDANCE_REPORT_MAX_ATTEMPTS || result.transport !== "smtp");
        } catch (error) { await monthlyAttendanceReportDeliveryRepository.failed(delivery.id, company.id, leaseOwner, error instanceof Error ? error.message : "EMAIL_SEND_FAILED", delivery.attemptCount >= env.DAILY_ATTENDANCE_REPORT_MAX_ATTEMPTS ? null : retryAt(delivery.attemptCount), delivery.attemptCount >= env.DAILY_ATTENDANCE_REPORT_MAX_ATTEMPTS); }
      }
      const counts = await monthlyAttendanceReportDeliveryRepository.counts(current.id, company.id);
      const status = counts.sent === counts.total ? "SENT" : counts.retryable > 0 ? (counts.sent > 0 ? "PARTIAL" : "FAILED") : counts.sent > 0 ? "PARTIAL" : "FAILED";
      await monthlyAttendanceReportRunRepository.mark(current.id, company.id, leaseOwner, status, null, counts.retryable > 0 ? counts.nextAttemptAt : null);
    } catch (error) { await monthlyAttendanceReportRunRepository.mark(claimed.id, company.id, leaseOwner, "FAILED", error instanceof Error ? error.message : "MONTHLY_REPORT_FAILED"); throw error; }
  },
  async processTick(now = new Date()): Promise<void> { for (const company of await eligibleCompanies()) await this.processPreviousMonth(company, now); },
};
