import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { apiRequest, signTestToken, startTestServer } from "../test-helpers/http-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { getPool } from "../database/connection";
import { companyRepository } from "../repositories/company.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import { userRepository } from "../repositories/user.repository";
import { hashPassword } from "../utils/password";

const TEST_OPERATOR_EMAIL = "integration-route-alias-operator@test.local";

describeDatabaseIntegration("API canonical routes integration", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  let dinamicCompanyId = "";
  let platformAdminId = "";
  let platformAdminEmail = "";
  let operatorUserId = "";
  let operatorUserEmail = "";
  let createdUserIds: string[] = [];

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();

    const { app } = await import("../app");
    const server = await startTestServer(app);
    baseUrl = server.baseUrl;
    closeServer = server.close;

    const dinamic = await companyRepository.findByName("Dinamic Systems");
    assert.ok(dinamic);
    dinamicCompanyId = dinamic.id;

    const platformAdmin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(platformAdmin?.isPlatformAdmin);
    platformAdminId = platformAdmin.id;
    platformAdminEmail = platformAdmin.email;

    const passwordHash = await hashPassword("integration-test-password");
    let operator = await userRepository.findByEmail(TEST_OPERATOR_EMAIL);
    if (!operator) {
      operator = await userRepository.create({
        name: "Route Alias Operator",
        email: TEST_OPERATOR_EMAIL,
        passwordHash,
        role: "ADMIN",
      });
      createdUserIds.push(operator.id);
    }

    const membership = await userCompanyMembershipRepository.findMembership(
      operator.id,
      dinamicCompanyId,
    );
    if (!membership) {
      await userCompanyMembershipRepository.create({
        userId: operator.id,
        companyId: dinamicCompanyId,
        role: "OPERATOR",
        status: "ACTIVE",
      });
    }

    operatorUserId = operator.id;
    operatorUserEmail = operator.email;
  });

  after(async () => {
    const pool = getPool();
    for (const userId of createdUserIds) {
      await pool.request().input("userId", sql.UniqueIdentifier, userId).query(`
        DELETE FROM user_company_memberships WHERE user_id = @userId;
        DELETE FROM users WHERE id = @userId;
      `);
    }

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
    });

  const operatorToken = () =>
    signTestToken({
      userId: operatorUserId,
      email: operatorUserEmail,
      role: "ADMIN",
    });

  const companyPath = (suffix: string) => `/api/companies/${dinamicCompanyId}${suffix}`;

  it("returns 200 for GET /services", async () => {
    const token = platformAdminToken();
    const response = await apiRequest(baseUrl, companyPath("/services"), { token });
    assert.equal(response.status, 200);
  });

  it("returns 200 for GET /operations", async () => {
    const token = platformAdminToken();
    const response = await apiRequest(baseUrl, companyPath("/operations"), { token });
    assert.equal(response.status, 200);
  });

  it("returns the same list response for GET /employees and GET /workers", async () => {
    const token = platformAdminToken();
    const employeesResponse = await apiRequest(baseUrl, companyPath("/employees"), { token });
    const workersResponse = await apiRequest(baseUrl, companyPath("/workers"), { token });

    assert.equal(employeesResponse.status, 200);
    assert.equal(workersResponse.status, 200);
    assert.deepEqual(workersResponse.body, employeesResponse.body);
  });

  it("returns lookup data for canonical /lookups/services and /lookups/operations", async () => {
    const token = platformAdminToken();

    const servicesLookup = await apiRequest(baseUrl, companyPath("/lookups/services"), { token });
    const operationsLookup = await apiRequest(baseUrl, companyPath("/lookups/operations"), { token });
    assert.equal(servicesLookup.status, 200);
    assert.equal(operationsLookup.status, 200);
  });

  it("denies OPERATOR access to services", async () => {
    const token = operatorToken();
    const response = await apiRequest(baseUrl, companyPath("/services"), { token });
    assert.equal(response.status, 403);
  });

  it("denies OPERATOR POST to services", async () => {
    const token = operatorToken();
    const body = {
      name: "Canonical Test Service",
      address: "Test",
      latitude: -34.6,
      longitude: -58.38,
      allowedRadiusMeters: 150,
    };

    const response = await apiRequest(baseUrl, companyPath("/services"), {
      method: "POST",
      token,
      body,
    });

    assert.equal(response.status, 403);
  });

  it("allows OPERATOR access to operations list API", async () => {
    const token = operatorToken();
    const response = await apiRequest(baseUrl, companyPath("/operations"), { token });
    assert.equal(response.status, 200);
  });

  it("denies OPERATOR POST to operations", async () => {
    const token = operatorToken();
    const body = {
      serviceId: "00000000-0000-4000-8000-000000000001",
      scheduledStart: "2030-01-01T20:30:00.000Z",
      scheduledEnd: "2030-01-02T03:00:00.000Z",
      earlyToleranceMinutes: 60,
      lateToleranceMinutes: 90,
    };

    const response = await apiRequest(baseUrl, companyPath("/operations"), {
      method: "POST",
      token,
      body,
    });

    assert.equal(response.status, 403);
  });

  it("denies OPERATOR access to employees and workers full APIs", async () => {
    const token = operatorToken();

    const employeesResponse = await apiRequest(baseUrl, companyPath("/employees"), { token });
    const workersResponse = await apiRequest(baseUrl, companyPath("/workers"), { token });

    assert.equal(employeesResponse.status, 403);
    assert.equal(workersResponse.status, 403);
  });
});
