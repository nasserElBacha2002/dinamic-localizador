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

const TEST_OPERATOR_EMAIL = "integration-operator@test.local";

describeDatabaseIntegration("OPERATOR permissions and lookups integration", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  let dinamicCompanyId = "";
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

    const passwordHash = await hashPassword("integration-test-password");
    let operator = await userRepository.findByEmail(TEST_OPERATOR_EMAIL);
    if (!operator) {
      operator = await userRepository.create({
        name: "Integration Operator",
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

  const operatorToken = () =>
    signTestToken({
      userId: operatorUserId,
      email: operatorUserEmail,
      role: "ADMIN",
    });

  it("denies OPERATOR access to full employees and services APIs", async () => {
    const token = operatorToken();
    const employeesResponse = await apiRequest(
      baseUrl,
      `/api/companies/${dinamicCompanyId}/employees`,
      { token },
    );
    assert.equal(employeesResponse.status, 403);

    const storesResponse = await apiRequest(
      baseUrl,
      `/api/companies/${dinamicCompanyId}/services`,
      { token },
    );
    assert.equal(storesResponse.status, 403);
  });

  it("allows OPERATOR access to operations and attendance APIs", async () => {
    const token = operatorToken();
    const operationsResponse = await apiRequest(
      baseUrl,
      `/api/companies/${dinamicCompanyId}/operations`,
      { token },
    );
    assert.equal(operationsResponse.status, 200);

    const attendanceResponse = await apiRequest(
      baseUrl,
      `/api/companies/${dinamicCompanyId}/attendance`,
      { token },
    );
    assert.equal(attendanceResponse.status, 200);
  });

  it("allows OPERATOR contextual lookup APIs with minimal employee fields", async () => {
    const token = operatorToken();

    const employeesLookup = await apiRequest(
      baseUrl,
      `/api/companies/${dinamicCompanyId}/lookups/employees`,
      { token },
    );
    assert.equal(employeesLookup.status, 200);
    const employees = employeesLookup.body.data as Array<Record<string, unknown>>;
    if (employees.length > 0) {
      assert.equal("phoneNumber" in employees[0], false);
      assert.equal("fullName" in employees[0], true);
    }

    const storesLookup = await apiRequest(
      baseUrl,
      `/api/companies/${dinamicCompanyId}/lookups/services`,
      { token },
    );
    assert.equal(storesLookup.status, 200);

    const operationsLookup = await apiRequest(
      baseUrl,
      `/api/companies/${dinamicCompanyId}/lookups/operations`,
      { token },
    );
    assert.equal(operationsLookup.status, 200);
  });

  it("denies OPERATOR bot simulator and statistics APIs", async () => {
    const token = operatorToken();

    const statisticsResponse = await apiRequest(
      baseUrl,
      `/api/companies/${dinamicCompanyId}/statistics/attendance/summary`,
      { token },
    );
    assert.equal(statisticsResponse.status, 403);

    const botSessionResponse = await apiRequest(
      baseUrl,
      `/api/companies/${dinamicCompanyId}/bot-simulator/session/00000000-0000-4000-8000-000000000001`,
      { token },
    );
    assert.equal(botSessionResponse.status, 403);
    assert.notEqual((botSessionResponse.body.error as { code?: string })?.code, "MODULE_DISABLED");
  });
});
