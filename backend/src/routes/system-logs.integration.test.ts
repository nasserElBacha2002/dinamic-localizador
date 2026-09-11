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

  it("platform admin can list and filter logs with summary DTO only", async () => {
    const response = await apiRequest(
      baseUrl,
      `/api/platform/observability/system-logs?level=error&requestId=${encodeURIComponent(requestId)}&limit=20`,
      { token: platformAdminToken() },
    );
    assert.equal(response.status, 200);
    const body = response.body as {
      data: Array<Record<string, unknown>>;
      meta: { total: number };
    };
    const row = body.data.find((item) => String(item.id).toLowerCase() === logId);
    assert.ok(row);
    assert.equal(row.requestId, requestId);
    assert.equal(Object.prototype.hasOwnProperty.call(row, "metadata"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(row, "errorStack"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(row, "errorMessage"), false);
    assert.ok(!JSON.stringify(body).includes("TWILIO_SECRET"));
  });

  it("unauthenticated request receives 401", async () => {
    const response = await apiRequest(baseUrl, "/api/platform/observability/system-logs");
    assert.equal(response.status, 401);
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
    const detailBody = detail.body as { data: Record<string, unknown> };
    assert.ok(Object.prototype.hasOwnProperty.call(detailBody.data, "metadata"));

    const context = await apiRequest(
      baseUrl,
      `/api/platform/observability/system-logs/${logId}/context`,
      { token },
    );
    assert.equal(context.status, 200);
    const body = context.body as {
      data: Array<Record<string, unknown>>;
      meta: { correlationKey: string | null };
    };
    assert.equal(body.meta.correlationKey, "requestId");
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 1);
    assert.equal(Object.prototype.hasOwnProperty.call(body.data[0], "errorStack"), false);
  });

  it("sanitizes contaminated SQL rows on list/detail/context", async () => {
    const pool = getPool();
    const dirtyRequestId = `req-dirty-${runId}`;
    const insert = await pool
      .request()
      .input("occurredAt", sql.DateTime2, new Date())
      .input("requestId", sql.NVarChar(64), dirtyRequestId)
      .input(
        "message",
        sql.NVarChar(1000),
        "authToken=raw-secret Bearer eyJhbGciOiJIUzI1NiJ9.abc +5491199988877 leak@example.com",
      )
      .input(
        "metadataJson",
        sql.NVarChar(sql.MAX),
        JSON.stringify({
          password: "plain-password",
          connectionString: "Server=prod;Pwd=x",
          signedUrl: "https://cdn.example/file?sig=abc",
          latitude: -34.6037,
          nested: { apiKey: "nested-key" },
        }),
      )
      .input("errorMessage", sql.NVarChar(1000), "password=stack-secret")
      .input("errorStack", sql.NVarChar(sql.MAX), "Error: password=stack-secret\n at x")
      .query(`
        INSERT INTO system_runtime_logs (
          schema_version, occurred_at, level, service, environment,
          module, event, message, request_id, metadata_json, error_name, error_message, error_stack
        )
        OUTPUT INSERTED.id
        VALUES (
          1, @occurredAt, N'error', N'test-service', N'test',
          N'http', N'http.request.failed', @message, @requestId, @metadataJson,
          N'Error', @errorMessage, @errorStack
        )
      `);
    const dirtyId = String(insert.recordset[0].id).toLowerCase();

    try {
      const token = platformAdminToken();
      const list = await apiRequest(
        baseUrl,
        `/api/platform/observability/system-logs?requestId=${encodeURIComponent(dirtyRequestId)}`,
        { token },
      );
      const detail = await apiRequest(
        baseUrl,
        `/api/platform/observability/system-logs/${dirtyId}`,
        { token },
      );
      const context = await apiRequest(
        baseUrl,
        `/api/platform/observability/system-logs/${dirtyId}/context`,
        { token },
      );
      const blobs = [JSON.stringify(list.body), JSON.stringify(detail.body), JSON.stringify(context.body)];
      for (const blob of blobs) {
        assert.ok(!blob.includes("raw-secret"));
        assert.ok(!blob.includes("plain-password"));
        assert.ok(!blob.includes("Server=prod"));
        assert.ok(!blob.includes("nested-key"));
        assert.ok(!blob.includes("+5491199988877"));
        assert.ok(!blob.includes("leak@example.com"));
        assert.ok(!blob.includes("stack-secret"));
      }
    } finally {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, dirtyId)
        .query(`DELETE FROM system_runtime_logs WHERE id = @id`);
    }
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
