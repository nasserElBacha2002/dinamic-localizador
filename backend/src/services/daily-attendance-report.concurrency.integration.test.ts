/**
 * Daily attendance report — SQL concurrency / lease fencing / backoff.
 * Enable: RUN_DB_INTEGRATION_TESTS=true (migrations 134+135 required).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  createIntegrationFixtureTracker,
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { dailyAttendanceReportDeliveryRepository } from "../repositories/daily-attendance-report-delivery.repository";

describeDatabaseIntegration("daily attendance report sql concurrency", () => {
  const fixtures = createIntegrationFixtureTracker();
  let companyId = "";
  let recipientId = "";
  let createdRecipientId: string | null = null;
  const runIds: string[] = [];

  before(async () => {
    await setupDatabaseIntegration();
    const { getPool } = await import("../database/connection");
    const pool = getPool();

    const company = await pool.request().query(`
      SELECT TOP 1 id
      FROM companies
      WHERE status = N'ACTIVE' OR status IS NULL
      ORDER BY
        CASE WHEN name = N'Dinamic Systems' THEN 0 ELSE 1 END,
        created_at ASC
    `);
    companyId = String(company.recordset[0]?.id ?? "");
    assert.ok(companyId, "ACTIVE company required");

    const tables = await pool.request().query(`
      SELECT
        OBJECT_ID(N'dbo.company_daily_attendance_report_runs', N'U') AS runs_id,
        OBJECT_ID(N'dbo.company_alert_recipients', N'U') AS alert_recipients_id,
        COL_LENGTH(N'dbo.company_daily_attendance_report_deliveries', N'recipient_origin') AS origin_col
    `);
    assert.ok(tables.recordset[0]?.runs_id, "migration 134/135 required (runs table)");
    assert.ok(tables.recordset[0]?.alert_recipients_id, "company_alert_recipients required");
    assert.ok(tables.recordset[0]?.origin_col, "migration 136 required (recipient_origin)");

    const existing = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 car.id
        FROM company_alert_recipients car
        INNER JOIN users u ON u.id = car.user_id
        WHERE car.company_id = @companyId
          AND car.is_enabled = 1
          AND car.user_id IS NOT NULL
          AND u.email IS NOT NULL
          AND LTRIM(RTRIM(u.email)) <> N''
        ORDER BY car.created_at ASC
      `);
    if (existing.recordset[0]?.id) {
      recipientId = String(existing.recordset[0].id);
    } else {
      const userRow = await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          SELECT TOP 1 u.id AS user_id, u.phone_number
          FROM users u
          INNER JOIN user_company_memberships ucm
            ON ucm.user_id = u.id AND ucm.company_id = @companyId AND ucm.status = N'ACTIVE'
          WHERE u.email IS NOT NULL AND LTRIM(RTRIM(u.email)) <> N''
          ORDER BY u.created_at ASC
        `);
      const userId = String(userRow.recordset[0]?.user_id ?? "");
      assert.ok(userId, "ACTIVE company user with email required for concurrency fixtures");
      const phone =
        String(userRow.recordset[0]?.phone_number ?? "").trim() ||
        `+54911${String(Date.now()).slice(-8)}`;
      const inserted = await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("userId", sql.UniqueIdentifier, userId)
        .input("phone", sql.NVarChar(20), phone)
        .query(`
          INSERT INTO company_alert_recipients (
            company_id, user_id, phone_number, display_name, is_enabled,
            receive_operational_alerts, receive_request_alerts, receive_security_alerts
          )
          OUTPUT INSERTED.id
          VALUES (
            @companyId, @userId, @phone, N'Concurrency', 1,
            1, 0, 0
          );
        `);
      recipientId = String(inserted.recordset[0].id);
      createdRecipientId = recipientId;
    }
  });

  after(async () => {
    const { getPool } = await import("../database/connection");
    const pool = getPool();
    for (const runId of runIds) {
      await pool
        .request()
        .input("runId", sql.UniqueIdentifier, runId)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          DELETE FROM company_daily_attendance_report_deliveries
          WHERE report_run_id = @runId AND company_id = @companyId;
          DELETE FROM company_daily_attendance_report_runs
          WHERE id = @runId AND company_id = @companyId;
        `);
    }
    if (createdRecipientId) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, createdRecipientId)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          DELETE FROM company_alert_recipients
          WHERE id = @id AND company_id = @companyId
        `);
    }
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  const insertRun = async (reportDate: string, overrides?: {
    status?: string;
    nextAttemptAt?: Date | null;
    generatedAt?: Date | null;
  }) => {
    const { getPool } = await import("../database/connection");
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("reportDate", sql.Date, reportDate)
      .input("status", sql.NVarChar(40), overrides?.status ?? "PENDING")
      .input("nextAttemptAt", sql.DateTime2, overrides?.nextAttemptAt ?? null)
      .input("generatedAt", sql.DateTime2, overrides?.generatedAt ?? null)
      .query(`
        INSERT INTO company_daily_attendance_report_runs (
          company_id, report_date, timezone_id, report_time_local, status,
          next_attempt_at, generated_at,
          email_subject_snapshot, email_text_snapshot, email_html_snapshot,
          recipient_count, evaluated_at, template_version
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @reportDate, N'America/Argentina/Buenos_Aires', '08:00:00', @status,
          @nextAttemptAt, @generatedAt,
          CASE WHEN @generatedAt IS NULL THEN NULL ELSE N'subject' END,
          CASE WHEN @generatedAt IS NULL THEN NULL ELSE N'text' END,
          CASE WHEN @generatedAt IS NULL THEN NULL ELSE N'<p>html</p>' END,
          CASE WHEN @generatedAt IS NULL THEN 0 ELSE 1 END,
          @generatedAt,
          CASE WHEN @generatedAt IS NULL THEN NULL ELSE N'v1' END
        );
      `);
    const id = String(result.recordset[0].id);
    runIds.push(id);
    return id;
  };

  it("two workers cannot claim the same PENDING run", async () => {
    const reportDate = `2099-06-${String(10 + (Date.now() % 18)).padStart(2, "0")}`;
    const runId = await insertRun(reportDate);
    const { getPool } = await import("../database/connection");
    const pool = getPool();

    const claimOnce = async (owner: string) => {
      const result = await pool
        .request()
        .input("id", sql.UniqueIdentifier, runId)
        .input("leaseOwner", sql.NVarChar(100), owner)
        .query(`
          ;WITH next_row AS (
            SELECT TOP (1) id
            FROM company_daily_attendance_report_runs WITH (UPDLOCK, READPAST, ROWLOCK)
            WHERE id = @id
              AND status = N'PENDING'
              AND (lease_expires_at IS NULL OR lease_expires_at < SYSUTCDATETIME())
          )
          UPDATE r
          SET status = N'PROCESSING',
              lease_owner = @leaseOwner,
              lease_expires_at = DATEADD(SECOND, 120, SYSUTCDATETIME()),
              attempt_count = attempt_count + 1,
              updated_at = SYSUTCDATETIME()
          OUTPUT INSERTED.id
          FROM company_daily_attendance_report_runs r
          INNER JOIN next_row n ON n.id = r.id
        `);
      return result.recordset[0]?.id ? String(result.recordset[0].id) : null;
    };

    const [a, b] = await Promise.all([
      claimOnce(`worker-a:${randomUUID()}`),
      claimOnce(`worker-b:${randomUUID()}`),
    ]);
    const claimed = [a, b].filter(Boolean);
    assert.equal(claimed.length, 1);
  });

  it("PARTIAL respects next_attempt_at backoff", async () => {
    const reportDate = `2099-07-${String(10 + (Date.now() % 18)).padStart(2, "0")}`;
    const future = new Date(Date.now() + 60 * 60_000);
    const runId = await insertRun(reportDate, {
      status: "PARTIAL",
      nextAttemptAt: future,
      generatedAt: new Date(),
    });
    const { getPool } = await import("../database/connection");
    await getPool()
      .request()
      .input("runId", sql.UniqueIdentifier, runId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("recipientId", sql.UniqueIdentifier, recipientId)
      .query(`
        INSERT INTO company_daily_attendance_report_deliveries (
          report_run_id, company_id, recipient_id, email_snapshot, status, next_attempt_at, recipient_origin
        )
        VALUES (@runId, @companyId, @recipientId, N'backoff@b.com', N'FAILED', DATEADD(HOUR, 1, SYSUTCDATETIME()), N'ALERT_RECIPIENT');
      `);

    // Scoped claim mirroring repository backoff gate for this run id
    const result = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, runId)
      .input("leaseOwner", sql.NVarChar(100), `worker-backoff:${randomUUID()}`)
      .query(`
        ;WITH next_row AS (
          SELECT TOP (1) id
          FROM company_daily_attendance_report_runs WITH (UPDLOCK, READPAST, ROWLOCK)
          WHERE id = @id
            AND status = N'PARTIAL'
            AND (next_attempt_at IS NULL OR next_attempt_at <= SYSUTCDATETIME())
        )
        UPDATE r
        SET status = N'PROCESSING', lease_owner = @leaseOwner
        OUTPUT INSERTED.id
        FROM company_daily_attendance_report_runs r
        INNER JOIN next_row n ON n.id = r.id
      `);
    assert.equal(result.recordset.length, 0);
  });

  it("obsolete owner cannot markSent after lease steal", async () => {
    const reportDate = `2099-03-${String(10 + (runIds.length % 10)).padStart(2, "0")}`;
    const runId = await insertRun(reportDate, {
      status: "PENDING",
      generatedAt: new Date(),
    });
    const { getPool } = await import("../database/connection");
    const deliveryInsert = await getPool()
      .request()
      .input("runId", sql.UniqueIdentifier, runId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("recipientId", sql.UniqueIdentifier, recipientId)
      .query(`
        INSERT INTO company_daily_attendance_report_deliveries (
          report_run_id, company_id, recipient_id, email_snapshot, status, recipient_origin
        )
        OUTPUT INSERTED.id
        VALUES (@runId, @companyId, @recipientId, N'a@b.com', N'PENDING', N'ALERT_RECIPIENT');
      `);
    const deliveryId = String(deliveryInsert.recordset[0].id);

    const ownerA = `owner-a:${randomUUID()}`;
    const claimed = await dailyAttendanceReportDeliveryRepository.claimNextForRun(
      companyId,
      runId,
      ownerA,
      120,
      5,
    );
    assert.ok(claimed);
    assert.equal(claimed!.id, deliveryId);

    // Steal lease
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, deliveryId)
      .input("owner", sql.NVarChar(100), `owner-b:${randomUUID()}`)
      .query(`
        UPDATE company_daily_attendance_report_deliveries
        SET lease_owner = @owner,
            lease_expires_at = DATEADD(SECOND, 120, SYSUTCDATETIME()),
            status = N'PROCESSING'
        WHERE id = @id
      `);

    const marked = await dailyAttendanceReportDeliveryRepository.markSent({
      companyId,
      deliveryId,
      leaseOwner: ownerA,
      providerMessageId: "msg-1",
    });
    assert.equal(marked, false);
  });

  it("FAILED_TERMINAL deliveries are never reclaimed", async () => {
    const reportDate = `2099-04-${String(10 + (runIds.length % 10)).padStart(2, "0")}`;
    const runId = await insertRun(reportDate, {
      status: "PARTIAL",
      nextAttemptAt: new Date(Date.now() - 1000),
      generatedAt: new Date(),
    });
    const { getPool } = await import("../database/connection");
    await getPool()
      .request()
      .input("runId", sql.UniqueIdentifier, runId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("recipientId", sql.UniqueIdentifier, recipientId)
      .query(`
        INSERT INTO company_daily_attendance_report_deliveries (
          report_run_id, company_id, recipient_id, email_snapshot, status, attempt_count, recipient_origin
        )
        VALUES (@runId, @companyId, @recipientId, N'terminal@b.com', N'FAILED_TERMINAL', 1, N'ALERT_RECIPIENT');
      `);

    const claimed = await dailyAttendanceReportDeliveryRepository.claimNextForRun(
      companyId,
      runId,
      `term:${randomUUID()}`,
      120,
      5,
    );
    assert.equal(claimed, null);
  });

  it("composite FK prevents cross-tenant delivery insert", async () => {
    const reportDate = `2099-05-${String(10 + (runIds.length % 10)).padStart(2, "0")}`;
    const runId = await insertRun(reportDate, { generatedAt: new Date() });
    const { getPool } = await import("../database/connection");
    const otherCompany = await getPool().request().query(`
      SELECT TOP 1 id FROM companies WHERE id <> CAST('${companyId}' AS UNIQUEIDENTIFIER)
    `);
    const otherId = otherCompany.recordset[0]?.id
      ? String(otherCompany.recordset[0].id)
      : null;
    if (!otherId) {
      return; // single-tenant DB — skip
    }
    let failed = false;
    try {
      await getPool()
        .request()
        .input("runId", sql.UniqueIdentifier, runId)
        .input("companyId", sql.UniqueIdentifier, otherId)
        .input("recipientId", sql.UniqueIdentifier, recipientId)
        .query(`
          INSERT INTO company_daily_attendance_report_deliveries (
            report_run_id, company_id, recipient_id, email_snapshot, status, recipient_origin
          )
          VALUES (@runId, @companyId, @recipientId, N'x@y.com', N'PENDING', N'ALERT_RECIPIENT');
        `);
    } catch {
      failed = true;
    }
    assert.equal(failed, true);
  });
});
