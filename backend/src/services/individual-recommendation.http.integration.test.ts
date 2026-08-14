import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { apiRequest, signTestToken, startTestServer } from "../test-helpers/http-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { getPool } from "../database/connection";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { deleteCompanyCascade } from "../test-helpers/integration-cleanup";
import { insertOperationalLocationFixture } from "../test-helpers/operational-location-fixture";
import { userRepository } from "../repositories/user.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import { hashPassword } from "../utils/password";
import { employeeService } from "./employee.service";

const uniqueSuffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const uniquePhone = (seed: number): string =>
  `+54911${String(Date.now()).slice(-5)}${String(seed).padStart(3, "0")}${Math.floor(Math.random() * 90 + 10)}`;

describeDatabaseIntegration("individual recommendations HTTP", () => {
  const createdCompanyIds: string[] = [];
  const createdUserIds: string[] = [];
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  let companyAId = "";
  let companyBId = "";
  let ownerUserId = "";
  let ownerEmail = "";
  let readOnlyUserId = "";
  let readOnlyEmail = "";
  let operationId = "";

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();

    const { app } = await import("../app");
    const server = await startTestServer(app);
    baseUrl = server.baseUrl;
    closeServer = server.close;

    const suffix = uniqueSuffix();
    const companyA = await createPlatformCompanyFixture({
      name: `Rec HTTP A ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner A", email: `rec-http-a-${suffix}@integration.test` },
    });
    const companyB = await createPlatformCompanyFixture({
      name: `Rec HTTP B ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner B", email: `rec-http-b-${suffix}@integration.test` },
    });
    companyAId = companyA.data.company.id;
    companyBId = companyB.data.company.id;
    createdCompanyIds.push(companyAId, companyBId);

    const passwordHash = await hashPassword("integration-test-password");
    ownerEmail = `rec-http-owner-${suffix}@integration.test`;
    readOnlyEmail = `rec-http-ro-${suffix}@integration.test`;
    const owner = await userRepository.create({
      name: "Rec Owner",
      email: ownerEmail,
      passwordHash,
      role: "ADMIN",
    });
    const readOnly = await userRepository.create({
      name: "Rec RO",
      email: readOnlyEmail,
      passwordHash,
      role: "ADMIN",
    });
    createdUserIds.push(owner.id, readOnly.id);
    ownerUserId = owner.id;
    readOnlyUserId = readOnly.id;

    await userCompanyMembershipRepository.create({
      userId: owner.id,
      companyId: companyAId,
      role: "OWNER",
      status: "ACTIVE",
    });
    await userCompanyMembershipRepository.create({
      userId: readOnly.id,
      companyId: companyAId,
      role: "READ_ONLY",
      status: "ACTIVE",
    });

    const serviceId = await insertOperationalLocationFixture({
      companyId: companyAId,
      name: "Rec HTTP Svc",
      latitude: -34.6,
      longitude: -58.4,
    });

    const start = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    const op = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyAId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, start)
      .input("scheduledEnd", sql.DateTime2, end)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status, operation_kind
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @serviceId, @scheduledStart, @scheduledEnd, 60, 90, N'SCHEDULED', N'ONE_TIME')
      `);
    operationId = String(op.recordset[0].id);

    await employeeService.create(companyAId, {
      name: "HTTP Candidate",
      phoneNumber: uniquePhone(91),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
      locationZoneId: null,
    });
  });

  after(async () => {
    if (closeServer) {
      await closeServer();
    }
    for (const companyId of createdCompanyIds.splice(0)) {
      await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          UPDATE employees SET location_zone_id = NULL WHERE company_id = @companyId;
          DELETE FROM location_zones WHERE company_id = @companyId;
        `);
      await deleteCompanyCascade(companyId);
    }
    for (const userId of createdUserIds.splice(0)) {
      await getPool()
        .request()
        .input("userId", sql.UniqueIdentifier, userId)
        .query(`
          DELETE FROM user_company_memberships WHERE user_id = @userId;
          DELETE FROM users WHERE id = @userId;
        `);
    }
    await teardownDatabaseIntegration();
  });

  it("allows operations:manage and rejects unauthorized / wrong tenant / bad limit", async () => {
    const ownerToken = signTestToken({ userId: ownerUserId, email: ownerEmail, role: "ADMIN" });
    const readOnlyToken = signTestToken({
      userId: readOnlyUserId,
      email: readOnlyEmail,
      role: "ADMIN",
    });

    const path = (companyId: string, query = "") =>
      `/api/companies/${companyId}/operations/${operationId}/recommendations/employees${query}`;

    const ok = await apiRequest(baseUrl, path(companyAId, "?limit=5"), { token: ownerToken });
    assert.equal(ok.status, 200);
    const data = ok.body.data as {
      operationId: string;
      algorithmVersion: string;
      recommendations: unknown[];
    };
    assert.equal(data.operationId, operationId);
    assert.equal(data.algorithmVersion, "workforce-recommendation-v1");
    assert.ok(Array.isArray(data.recommendations));

    const forbidden = await apiRequest(baseUrl, path(companyAId), { token: readOnlyToken });
    assert.equal(forbidden.status, 403);

    const wrongTenant = await apiRequest(baseUrl, path(companyBId), { token: ownerToken });
    assert.ok(wrongTenant.status === 403 || wrongTenant.status === 404);

    const missing = await apiRequest(
      baseUrl,
      `/api/companies/${companyAId}/operations/11111111-1111-4111-8111-111111111111/recommendations/employees`,
      { token: ownerToken },
    );
    assert.equal(missing.status, 404);

    const badLimit = await apiRequest(baseUrl, path(companyAId, "?limit=999"), {
      token: ownerToken,
    });
    assert.equal(badLimit.status, 400);
  });
});
