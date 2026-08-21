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

describeDatabaseIntegration("whatsapp observability conversations HTTP", () => {
  const runId = randomUUID().replace(/-/g, "").slice(0, 8);
  const fixtures = createIntegrationFixtureTracker();
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  let platformAdminId = "";
  let platformAdminEmail = "";
  let platformAdminTokenVersion = 0;
  let companyId = "";
  let employeeId = "";
  const conversationIds: string[] = [];

  before(async () => {
    setupUnitTestEnv();
    process.env.WHATSAPP_OBSERVABILITY_UI_ENABLED = "true";
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
    const companyResult = await pool
      .request()
      .input("name", sql.NVarChar(200), `Obs HTTP Co ${runId}`)
      .query(`
        INSERT INTO companies (name, default_timezone, status)
        OUTPUT INSERTED.id
        VALUES (@name, N'America/Argentina/Buenos_Aires', N'ACTIVE')
      `);
    companyId = String(companyResult.recordset[0].id).toLowerCase();
    fixtures.trackCompany(companyId);

    const employeeResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), `HTTP Emp ${runId}`)
      .input("phone", sql.NVarChar(30), `+54911${runId}99`)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, N'fijo', 1);
        SELECT id FROM @inserted;
      `);
    employeeId = String(employeeResult.recordset[0].id).toLowerCase();
    fixtures.trackEmployee(companyId, employeeId);

    const conversationId = randomUUID().toLowerCase();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, conversationId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("phoneHash", sql.NVarChar(64), `http-hash-${runId}`)
      .input("phoneMasked", sql.NVarChar(40), "****8899")
      .input("phoneNormalized", sql.NVarChar(512), `enc-http-${runId}`)
      .input("lastActivityAt", sql.DateTime2, new Date("2026-08-15T15:00:00.000Z"))
      .query(`
        INSERT INTO whatsapp_conversations (
          id, company_id, employee_id, phone_hash, phone_masked, phone_normalized,
          status, last_flow_type, last_result_code, error_count, message_count,
          started_at, last_activity_at, created_at, updated_at
        )
        VALUES (
          @id, @companyId, @employeeId, @phoneHash, @phoneMasked, @phoneNormalized,
          N'ACTIVE', N'INBOUND_LOCATION', N'CHECKIN_COMPLETED', 0, 1,
          @lastActivityAt, @lastActivityAt, @lastActivityAt, @lastActivityAt
        )
      `);
    conversationIds.push(conversationId);
  });

  after(async () => {
    const pool = getPool();
    for (const id of conversationIds) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(`DELETE FROM whatsapp_conversations WHERE id = @id`);
    }
    await fixtures.cleanup();
    if (closeServer) {
      await closeServer();
    }
    await teardownDatabaseIntegration();
  });

  const platformAdminToken = () =>
    signTestToken({
      userId: platformAdminId,
      email: platformAdminEmail,
      role: "ADMIN",
      tokenVersion: platformAdminTokenVersion,
    });

  it("parses combined filters and returns meta for authorized platform admin", async () => {
    const token = platformAdminToken();
    const query = new URLSearchParams({
      employeeId,
      status: "ACTIVE",
      flowType: "INBOUND_LOCATION",
      resultCode: "CHECKIN_COMPLETED",
      hasError: "false",
      from: "2026-08-01T03:00:00.000Z",
      to: "2026-08-31T02:59:00.000Z",
      page: "1",
      limit: "20",
    });
    const response = await apiRequest(
      baseUrl,
      `/api/platform/observability/whatsapp/conversations?${query.toString()}`,
      { token },
    );
    assert.equal(response.status, 200);
    const body = response.body as {
      data: Array<{ employeeId: string | null; phoneMasked: string; phoneNormalized?: string }>;
      meta: { page: number; limit: number; total: number; totalPages: number };
    };
    assert.equal(body.meta.page, 1);
    assert.equal(body.meta.limit, 20);
    assert.ok(body.meta.total >= 1);
    assert.ok(body.meta.totalPages >= 1);
    assert.ok(body.data.some((row) => String(row.employeeId).toLowerCase() === employeeId));
    assert.ok(body.data.every((row) => row.phoneMasked.includes("*")));
    assert.ok(body.data.every((row) => row.phoneNormalized === undefined));
  });

  it("rejects invalid employeeId, inverted range, and invalid hasError", async () => {
    const token = platformAdminToken();
    const invalidEmployee = await apiRequest(
      baseUrl,
      "/api/platform/observability/whatsapp/conversations?employeeId=not-a-uuid",
      { token },
    );
    assert.equal(invalidEmployee.status, 400);

    const inverted = await apiRequest(
      baseUrl,
      "/api/platform/observability/whatsapp/conversations?from=2026-08-10T00:00:00.000Z&to=2026-08-01T00:00:00.000Z",
      { token },
    );
    assert.equal(inverted.status, 400);

    const badHasError = await apiRequest(
      baseUrl,
      "/api/platform/observability/whatsapp/conversations?hasError=maybe",
      { token },
    );
    assert.equal(badHasError.status, 400);
  });

  it("requires platform admin authorization", async () => {
    const response = await apiRequest(
      baseUrl,
      "/api/platform/observability/whatsapp/conversations",
    );
    assert.equal(response.status, 401);
  });

  it("returns platform employee lookups for observability", async () => {
    const token = platformAdminToken();
    const response = await apiRequest(
      baseUrl,
      `/api/platform/observability/whatsapp/employee-lookups?search=${encodeURIComponent(runId)}`,
      { token },
    );
    assert.equal(response.status, 200);
    const body = response.body as {
      data: Array<{ id: string; fullName: string; companyId: string; companyName: string }>;
    };
    assert.ok(body.data.some((row) => String(row.id).toLowerCase() === employeeId));
  });
});
