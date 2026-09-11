import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { apiRequest, signTestToken, startTestServer } from "../test-helpers/http-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { createIntegrationFixtureTracker } from "../test-helpers/integration-cleanup";
import { getPool } from "../database/connection";
import { userRepository } from "../repositories/user.repository";

describeDatabaseIntegration("system runtime logs HTTP", () => {
  const runId = randomUUID().replace(/-/g, "").slice(0, 8);
  const fixtures = createIntegrationFixtureTracker();
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  let platformAdminId = "";
  let platformAdminEmail = "";
  let platformAdminTokenVersion = 0;
  let companyUserId = "";
  let companyUserEmail = "";
  let companyUserTokenVersion = 0;
  let companyId = "";
  let logId = "";
  let requestId = "";

  before(async () => {
    setupUnitTestEnv();
    process.env.SYSTEM_LOGS_ENABLED = "true";
    process.env.SYSTEM_LOGS_UI_ENABLED = "true";
    await setupDatabaseIntegration();

    const { app } = await import("../app");
    const server = await startTestServer(app);
    baseUrl = server.baseUrl;
    closeServer = server.close;

    const platformAdmin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(platformAdmin?.isPlatformAdmin);
    platformAdminId = platformAdmin.id;
    platformAdminEmail = platformAdmin.email;
    platformAdminTokenVersion = platformAdmin.tokenVersion;

    const pool = getPool();
    const tableCheck = await pool.request().query(`
      SELECT OBJECT_ID(N'dbo.system_runtime_logs', N'U') AS oid
    `);
    if (!tableCheck.recordset[0]?.oid) {
      throw new Error("system_runtime_logs missing — run migration 121 first");
    }

    const companyResult = await pool
      .request()
      .input("name", sql.NVarChar(200), `SysLogs Co ${runId}`)
      .query(`
        INSERT INTO companies (name, default_timezone, status)
        OUTPUT INSERTED.id
        VALUES (@name, N'America/Argentina/Buenos_Aires', N'ACTIVE')
      `);
    companyId = String(companyResult.recordset[0].id).toLowerCase();
    fixtures.trackCompany(companyId);

    companyUserEmail = `owner-${runId}@example.com`;
    const companyUserResult = await pool
      .request()
      .input("name", sql.NVarChar(150), `Owner ${runId}`)
      .input("email", sql.NVarChar(255), companyUserEmail)
      .input("passwordHash", sql.NVarChar(255), "$2b$10$unitTestHashNotUsedForLoginXXXXXXX")
      .query(`
        INSERT INTO users (name, email, password_hash, role, active, is_platform_admin)
        OUTPUT INSERTED.id, INSERTED.token_version
        VALUES (@name, @email, @passwordHash, N'ADMIN', 1, 0)
      `);
    companyUserId = String(companyUserResult.recordset[0].id).toLowerCase();
    companyUserTokenVersion = Number(companyUserResult.recordset[0].token_version ?? 0);

    await pool
      .request()
      .input("userId", sql.UniqueIdentifier, companyUserId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        INSERT INTO user_company_memberships (user_id, company_id, role, status, is_default)
        VALUES (@userId, @companyId, N'OWNER', N'ACTIVE', 1)
      `);

    requestId = `req-${runId}-abcdef`;
    const insert = await pool
      .request()
      .input("occurredAt", sql.DateTime2, new Date())
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("requestId", sql.NVarChar(64), requestId)
      .input("message", sql.NVarChar(1000), `syslogs integration ${runId}`)
      .input(
        "metadataJson",
        sql.NVarChar(sql.MAX),
        JSON.stringify({ authToken: "[REDACTED]", ok: 1 }),
      )
      .query(`
        INSERT INTO system_runtime_logs (
          schema_version, occurred_at, level, service, environment,
          module, event, message, request_id, company_id, metadata_json
        )
        OUTPUT INSERTED.id
        VALUES (
          1, @occurredAt, N'error', N'test-service', N'test',
          N'http', N'http.request.failed', @message, @requestId, @companyId, @metadataJson
        )
      `);
    logId = String(insert.recordset[0].id).toLowerCase();
  });

  after(async () => {
    const pool = getPool();
    if (logId) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, logId)
        .query(`DELETE FROM system_runtime_logs WHERE id = @id`);
    }
    await pool
      .request()
      .input("requestId", sql.NVarChar(64), requestId)
      .query(`DELETE FROM system_runtime_logs WHERE request_id = @requestId`);
    if (companyUserId) {
      await pool
        .request()
        .input("userId", sql.UniqueIdentifier, companyUserId)
        .query(`
          DELETE FROM user_company_memberships WHERE user_id = @userId;
          DELETE FROM users WHERE id = @userId;
        `);
    }
    if (closeServer) {
      await closeServer();
    }
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  const platformAdminToken = () =>
    signTestToken({
      userId: platformAdminId,
      email: platformAdminEmail,
      role: "ADMIN",
      tokenVersion: platformAdminTokenVersion,
    });

  it("platform admin can list and filter logs", async () => {
    const response = await apiRequest(
      baseUrl,
      `/api/platform/observability/system-logs?level=error&requestId=${encodeURIComponent(requestId)}&limit=20`,
      { token: platformAdminToken() },
    );
    assert.equal(response.status, 200);
    const body = response.body as {
      data: Array<{ id: string; requestId: string; metadata: Record<string, unknown> }>;
      meta: { total: number };
    };
    assert.ok(body.data.some((row) => row.id.toLowerCase() === logId));
    assert.ok(!JSON.stringify(body).includes("TWILIO_SECRET"));
  });

  it("company OWNER receives 403", async () => {
    const token = signTestToken({
      userId: companyUserId,
      email: companyUserEmail,
      role: "ADMIN",
      tokenVersion: companyUserTokenVersion,
    });
    const response = await apiRequest(baseUrl, "/api/platform/observability/system-logs", {
      token,
    });
    assert.equal(response.status, 403);
  });

  it("returns detail and context for platform admin", async () => {
    const token = platformAdminToken();
    const detail = await apiRequest(
      baseUrl,
      `/api/platform/observability/system-logs/${logId}`,
      { token },
    );
    assert.equal(detail.status, 200);

    const context = await apiRequest(
      baseUrl,
      `/api/platform/observability/system-logs/${logId}/context`,
      { token },
    );
    assert.equal(context.status, 200);
    const body = context.body as {
      data: unknown[];
      meta: { correlationKey: string | null };
    };
    assert.equal(body.meta.correlationKey, "requestId");
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 1);
  });

  it("returns 404 for missing log", async () => {
    const response = await apiRequest(
      baseUrl,
      `/api/platform/observability/system-logs/${randomUUID()}`,
      { token: platformAdminToken() },
    );
    assert.equal(response.status, 404);
  });
});
