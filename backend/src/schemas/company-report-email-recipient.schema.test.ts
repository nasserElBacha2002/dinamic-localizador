import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createCompanyReportEmailRecipientSchema } from "./company-report-email-recipient.schema";

describe("company-report-email-recipient.schema", () => {
  it("normalizes email and rejects invalid", () => {
    const parsed = createCompanyReportEmailRecipientSchema.parse({
      email: "  Admin@Empresa.COM ",
      displayName: "Ops",
    });
    assert.equal(parsed.email, "admin@empresa.com");
    assert.throws(() =>
      createCompanyReportEmailRecipientSchema.parse({ email: "nope" }),
    );
  });
});

describe("daily attendance report locking SQL source", () => {
  it("claims runs and deliveries with UPDLOCK READPAST", () => {
    const runs = readFileSync(
      join(process.cwd(), "src/repositories/daily-attendance-report-run.repository.ts"),
      "utf8",
    );
    const deliveries = readFileSync(
      join(process.cwd(), "src/repositories/daily-attendance-report-delivery.repository.ts"),
      "utf8",
    );
    assert.match(runs, /UPDLOCK,\s*READPAST/);
    assert.match(deliveries, /UPDLOCK,\s*READPAST/);
    assert.match(runs, /UQ|UNIQUE|company_id, report_date|ensurePendingRun/);
  });

  it("migration enforces unique run and delivery keys", () => {
    const migration = readFileSync(
      join(process.cwd(), "../database/migrations/134_daily_attendance_report.sql"),
      "utf8",
    );
    assert.match(migration, /UQ_cdarr_company_report_date/);
    assert.match(migration, /UQ_cdard_run_recipient/);
  });
});
