/**
 * Verify migration 136 preservative apply / rollback / reapply.
 * Does not delete delivery history.
 *
 * Usage: npx tsx --import ./src/test-helpers/preload-test-env.ts src/scripts/verify-136-daily-report-audience-rollback.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sql from "mssql";
import { migrationEnv as env } from "../config/env-migrations";

const splitBatches = (script: string): string[] =>
  script
    .split(/\r?\nGO\r?\n/gi)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const stripUse = (batch: string): string =>
  batch
    .split(/\r?\n/)
    .filter((line) => !/^\s*USE\s+/i.test(line.trim()))
    .join("\n")
    .trim();

const runScript = async (pool: sql.ConnectionPool, path: string): Promise<void> => {
  const script = readFileSync(path, "utf8");
  for (const batch of splitBatches(script)) {
    const cleaned = stripUse(batch);
    if (cleaned) {
      await pool.request().batch(cleaned);
    }
  }
};

const assertAudienceFk = async (
  pool: sql.ConnectionPool,
  expectedTable: "company_alert_recipients" | "company_report_email_recipients" | "nullable_or_legacy",
): Promise<void> => {
  const fks = await pool.request().query(`
    SELECT
      fk.name AS fk_name,
      OBJECT_NAME(fk.referenced_object_id) AS referenced_table
    FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
    INNER JOIN sys.columns c
      ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
    WHERE fk.parent_object_id = OBJECT_ID(N'dbo.company_daily_attendance_report_deliveries')
      AND c.name = N'recipient_id'
  `);
  const rows = fks.recordset as Array<{ fk_name: string; referenced_table: string }>;
  console.log("audience_fk", JSON.stringify(rows));
  if (expectedTable === "company_alert_recipients") {
    if (!rows.some((r) => r.referenced_table === "company_alert_recipients")) {
      throw new Error("expected FK to company_alert_recipients");
    }
  } else if (expectedTable === "company_report_email_recipients") {
    if (!rows.some((r) => r.referenced_table === "company_report_email_recipients")) {
      throw new Error("expected FK to company_report_email_recipients");
    }
  }
};

const main = async (): Promise<void> => {
  const pool = await sql.connect({
    server: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    options: {
      encrypt: env.DB_ENCRYPT,
      trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
    },
  });

  const root = join(process.cwd(), "..", "database", "migrations");
  const forward = join(root, "136_daily_report_uses_alert_recipients.sql");
  const rollback = join(root, "rollback/136_daily_report_uses_alert_recipients_rollback.sql");

  const company = await pool.request().query(`
    SELECT TOP 1 id FROM companies WHERE status = N'ACTIVE' OR status IS NULL ORDER BY created_at ASC
  `);
  const companyId = String(company.recordset[0]?.id ?? "");
  if (!companyId) {
    throw new Error("no company");
  }

  // Seed a SENT delivery that must survive rollback/reapply (history preservation).
  const runId = randomUUID();
  const deliveryId = randomUUID();
  const email = `preserve-136-${Date.now()}@example.com`;
  await pool
    .request()
    .input("runId", sql.UniqueIdentifier, runId)
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("email", sql.NVarChar(320), email)
    .input("deliveryId", sql.UniqueIdentifier, deliveryId)
    .query(`
      INSERT INTO company_daily_attendance_report_runs (
        id, company_id, report_date, timezone_id, report_time_local, status,
        email_subject_snapshot, email_text_snapshot, email_html_snapshot,
        recipient_count, evaluated_at, template_version, generated_at
      )
      VALUES (
        @runId, @companyId, '2099-01-02', N'America/Argentina/Buenos_Aires', '08:00:00', N'SENT',
        N'subject', N'text', N'<p>html</p>',
        1, SYSUTCDATETIME(), N'v1', SYSUTCDATETIME()
      );

      INSERT INTO company_daily_attendance_report_deliveries (
        id, report_run_id, company_id, recipient_id, email_snapshot, display_name_snapshot,
        status, attempt_count, provider_message_id, sent_at, recipient_origin
      )
      VALUES (
        @deliveryId, @runId, @companyId, NULL, @email, N'Preserve',
        N'SENT', 1, N'smtp-preserve-1', SYSUTCDATETIME(), N'SNAPSHOT_ONLY'
      );
    `);

  const countBefore = await pool
    .request()
    .input("deliveryId", sql.UniqueIdentifier, deliveryId)
    .query(`SELECT COUNT(*) AS c, MAX(status) AS status, MAX(email_snapshot) AS email
            FROM company_daily_attendance_report_deliveries WHERE id = @deliveryId`);
  console.log("before_rollback", JSON.stringify(countBefore.recordset[0]));

  console.log("rollback 136");
  await runScript(pool, rollback);
  await pool
    .request()
    .query(
      `DELETE FROM system_migrations WHERE migration_name = N'136_daily_report_uses_alert_recipients.sql'`,
    );
  await assertAudienceFk(pool, "nullable_or_legacy");

  const afterRollback = await pool
    .request()
    .input("deliveryId", sql.UniqueIdentifier, deliveryId)
    .query(`SELECT COUNT(*) AS c, MAX(status) AS status, MAX(email_snapshot) AS email,
                   MAX(provider_message_id) AS provider_id
            FROM company_daily_attendance_report_deliveries WHERE id = @deliveryId`);
  console.log("after_rollback", JSON.stringify(afterRollback.recordset[0]));
  if (Number(afterRollback.recordset[0].c) !== 1) {
    throw new Error("delivery deleted by rollback — forbidden");
  }
  if (String(afterRollback.recordset[0].status) !== "SENT") {
    throw new Error("SENT status altered by rollback");
  }
  if (String(afterRollback.recordset[0].email) !== email) {
    throw new Error("email_snapshot altered by rollback");
  }

  console.log("reapply 136");
  await runScript(pool, forward);
  await pool
    .request()
    .query(
      `IF NOT EXISTS (SELECT 1 FROM system_migrations WHERE migration_name = N'136_daily_report_uses_alert_recipients.sql')
       INSERT INTO system_migrations (migration_name) VALUES (N'136_daily_report_uses_alert_recipients.sql')`,
    );
  await assertAudienceFk(pool, "company_alert_recipients");

  const afterReapply = await pool
    .request()
    .input("deliveryId", sql.UniqueIdentifier, deliveryId)
    .query(`SELECT COUNT(*) AS c, MAX(status) AS status, MAX(email_snapshot) AS email,
                   MAX(provider_message_id) AS provider_id
            FROM company_daily_attendance_report_deliveries WHERE id = @deliveryId`);
  console.log("after_reapply", JSON.stringify(afterReapply.recordset[0]));
  if (Number(afterReapply.recordset[0].c) !== 1 || String(afterReapply.recordset[0].status) !== "SENT") {
    throw new Error("delivery lost or altered on reapply");
  }

  // Cleanup fixture
  await pool
    .request()
    .input("runId", sql.UniqueIdentifier, runId)
    .input("companyId", sql.UniqueIdentifier, companyId)
    .query(`
      DELETE FROM company_daily_attendance_report_deliveries WHERE report_run_id = @runId AND company_id = @companyId;
      DELETE FROM company_daily_attendance_report_runs WHERE id = @runId AND company_id = @companyId;
    `);

  console.log("136 apply/rollback/reapply OK (history preserved)");
  await pool.close();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
