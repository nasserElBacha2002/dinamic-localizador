import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Phase 1 must not cut over WhatsApp admin alerts or touch employee reminder flows.
 */
describe("phase-1 daily attendance report regression guards", () => {
  it("does not disable admin WhatsApp alerts in migration 134", () => {
    const migration = readFileSync(
      join(process.cwd(), "../database/migrations/134_daily_attendance_report.sql"),
      "utf8",
    );
    assert.match(migration, /daily_attendance_report_enabled/);
    assert.match(migration, /DEFAULT 0/);
    assert.doesNotMatch(migration, /admin_alerts_enabled\s*=\s*0/i);
    assert.doesNotMatch(migration, /DROP TABLE.*whatsapp_admin_alert/i);
    assert.doesNotMatch(migration, /whatsapp_attendance_notifications/);
  });

  it("keeps employee attendance reminder job and outbox untouched by report service", () => {
    const reportService = readFileSync(
      join(process.cwd(), "src/services/daily-attendance-report.service.ts"),
      "utf8",
    );
    assert.doesNotMatch(reportService, /attendance-reminder/);
    assert.doesNotMatch(reportService, /whatsapp_attendance_notifications/);
    assert.doesNotMatch(reportService, /whatsapp_admin_alert_notifications/);
    assert.doesNotMatch(reportService, /admin-alert\.job/);

    const reminderJob = readFileSync(
      join(process.cwd(), "src/jobs/attendance-reminder.job.ts"),
      "utf8",
    );
    assert.doesNotMatch(reminderJob, /daily-attendance-report/);
    assert.doesNotMatch(reminderJob, /dailyAttendanceReport/);
  });

  it("wires report worker behind DAILY_ATTENDANCE_REPORT_WORKER_ENABLED default false", () => {
    const envSource = readFileSync(join(process.cwd(), "src/config/env.ts"), "utf8");
    assert.match(
      envSource,
      /DAILY_ATTENDANCE_REPORT_WORKER_ENABLED:\s*z\.stringbool\(\)\.default\(false\)/,
    );
    const job = readFileSync(
      join(process.cwd(), "src/jobs/daily-attendance-report.job.ts"),
      "utf8",
    );
    assert.match(job, /DAILY_ATTENDANCE_REPORT_WORKER_ENABLED/);
  });

  it("marks console/disabled email transport as not SENT", () => {
    const service = readFileSync(
      join(process.cwd(), "src/services/daily-attendance-report.service.ts"),
      "utf8",
    );
    assert.match(service, /result\.transport === "console"/);
    assert.match(service, /result\.transport === "disabled"/);
    assert.match(service, /if \(!result\.sent\)/);
  });

  it("uses separate email recipients table from WhatsApp phones", () => {
    const migration = readFileSync(
      join(process.cwd(), "../database/migrations/134_daily_attendance_report.sql"),
      "utf8",
    );
    assert.match(migration, /company_report_email_recipients/);
    assert.doesNotMatch(migration, /ALTER TABLE dbo\.company_alert_recipients/);
  });
});
