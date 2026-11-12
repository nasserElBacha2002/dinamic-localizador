/**
 * OPERATIONAL_MANAGER role — authorization, eligibility, and scoped HTTP access.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../../test-helpers/integration-test";
import { apiRequest, signTestToken, startTestServer } from "../../test-helpers/http-test";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";
import { getPool } from "../../database/connection";
import { createIntegrationFixtureTracker } from "../../test-helpers/integration-cleanup";
import { createPlatformCompanyFixture } from "../../test-helpers/platform-company-fixture";
import { hashPassword } from "../../utils/password";
import { userRepository } from "../../repositories/identity/user.repository";
import { userCompanyMembershipRepository } from "../../repositories/companies/user-company-membership.repository";
import { companyUserEmployeeLinkService } from "./company-user-employee-link.service";
import { employeeCategoryRepository } from "../../repositories/employees/employee-category.repository";
import { OPERATIONAL_CHARGE_HOLDER_CATEGORY_NORMALIZED_NAME } from "../../constants/operational-charge-holder";

const uniqueSuffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const uniquePhone = (seed: number): string =>
  `+54911${String(Date.now()).slice(-7)}${String(seed).padStart(3, "0")}`;

describeDatabaseIntegration("OPERATIONAL_MANAGER permissions integration", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  const fixtures = createIntegrationFixtureTracker();
  const createdUserIds: string[] = [];

  let companyId = "";
  let otherCompanyId = "";
  let operationId = "";
  let workerEmployeeId = "";
  let omUserId = "";
  let omEmail = "";
  let omTokenVersion = 0;
  let adminOwnerUserId = "";
  let adminOwnerEmail = "";
  let adminOwnerTokenVersion = 0;
  let operationValidFrom = "";

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();

    const { app } = await import("../../app");
    const server = await startTestServer(app);
    baseUrl = server.baseUrl;
    closeServer = server.close;

    const suffix = uniqueSuffix();
    const fixtureA = await createPlatformCompanyFixture({
      name: `OM Perms A ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "OM Owner",
        email: `om-owner-a-${suffix}@test.local`,
      },
    });
    const fixtureB = await createPlatformCompanyFixture({
      name: `OM Perms B ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "OM Owner B",
        email: `om-owner-b-${suffix}@test.local`,
      },
    });
    companyId = fixtureA.data.company.id;
    otherCompanyId = fixtureB.data.company.id;
    fixtures.trackCompany(companyId);
    fixtures.trackCompany(otherCompanyId);

    const passwordHash = await hashPassword("integration-test-password");

    adminOwnerEmail = `om-admin-owner-${suffix}@test.local`;
    const adminOwner = await userRepository.create({
      name: "Owner OM test",
      email: adminOwnerEmail,
      passwordHash,
      role: "ADMIN",
    });
    createdUserIds.push(adminOwner.id);
    adminOwnerUserId = adminOwner.id;
    adminOwnerTokenVersion = adminOwner.tokenVersion;
    await userCompanyMembershipRepository.create({
      userId: adminOwnerUserId,
      companyId,
      role: "OWNER",
      status: "ACTIVE",
    });
    omEmail = `integration-om-${suffix}@test.local`;
    const omUser = await userRepository.create({
      name: "Integration OM",
      email: omEmail,
      passwordHash,
      role: "ADMIN",
    });
    createdUserIds.push(omUser.id);
    omUserId = omUser.id;
    omTokenVersion = omUser.tokenVersion;

    await userCompanyMembershipRepository.create({
      userId: omUserId,
      companyId,
      role: "OPERATIONAL_MANAGER",
      status: "ACTIVE",
    });

    const pool = getPool();
    const location = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(150), `OM Loc ${suffix}`)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO operational_locations (
          company_id, name, address, locality, latitude, longitude, allowed_radius_meters, active
        )
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, N'Addr', N'CABA', -34.6, -58.4, 150, 1);
        SELECT id FROM @inserted;
      `);
    const serviceId = String(location.recordset[0].id);

    const futureStart = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    operationValidFrom = futureStart.toISOString().slice(0, 10);
    const operationInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, futureStart)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, scheduled_start, early_tolerance_minutes,
          late_tolerance_minutes, status, operation_kind
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @serviceId, @scheduledStart, 60, 90, 'SCHEDULED', 'ONE_TIME')
      `);
    operationId = String(operationInsert.recordset[0].id);
    fixtures.trackOperation(companyId, operationId);

    const encargadoInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(20), uniquePhone(1))
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, N'Encargado OM', @phone, 'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const encargadoEmployeeId = String(encargadoInsert.recordset[0].id);
    fixtures.trackEmployee(companyId, encargadoEmployeeId);

    const workerInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(20), uniquePhone(2))
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, N'Colaborador OM', @phone, 'fijo', 1);
        SELECT id FROM @inserted;
      `);
    workerEmployeeId = String(workerInsert.recordset[0].id);
    fixtures.trackEmployee(companyId, workerEmployeeId);

    const category = await employeeCategoryRepository.findByNormalizedName(
      companyId,
      OPERATIONAL_CHARGE_HOLDER_CATEGORY_NORMALIZED_NAME,
    );
    assert.ok(category?.id, "Encargado category required");
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, encargadoEmployeeId)
      .input("categoryId", sql.UniqueIdentifier, category.id)
      .query(`
        UPDATE employees SET category_id = @categoryId, updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId AND id = @employeeId
      `);

    await companyUserEmployeeLinkService.createLink(
      companyId,
      adminOwnerUserId,
      omUserId,
      encargadoEmployeeId,
    );
  });

  after(async () => {
    await fixtures.cleanup();
    const pool = getPool();
    for (const id of createdUserIds) {
      await pool.request().input("userId", sql.UniqueIdentifier, id).query(`
        UPDATE company_user_employee_links SET created_by_user_id = NULL WHERE created_by_user_id = @userId;
        UPDATE company_user_employee_links SET last_replaced_by_user_id = NULL WHERE last_replaced_by_user_id = @userId;
        DELETE FROM company_user_employee_links WHERE user_id = @userId;
        DELETE FROM user_company_memberships WHERE user_id = @userId;
        DELETE FROM users WHERE id = @userId;
      `);
    }
    if (closeServer) {
      await closeServer();
    }
    await teardownDatabaseIntegration();
  });

  const omToken = () =>
    signTestToken({
      userId: omUserId,
      email: omEmail,
      role: "ADMIN",
      tokenVersion: omTokenVersion,
    });

  const adminOwnerToken = () =>
    signTestToken({
      userId: adminOwnerUserId,
      email: adminOwnerEmail,
      role: "ADMIN",
      tokenVersion: adminOwnerTokenVersion,
    });

  it("denies OPERATIONAL_MANAGER without Encargado link on a fresh membership", async () => {
    const suffix = uniqueSuffix();
    const passwordHash = await hashPassword("integration-test-password");
    const unlinked = await userRepository.create({
      name: "Unlinked OM",
      email: `unlinked-om-${suffix}@test.local`,
      passwordHash,
      role: "ADMIN",
    });
    createdUserIds.push(unlinked.id);
    await userCompanyMembershipRepository.create({
      userId: unlinked.id,
      companyId,
      role: "OPERATIONAL_MANAGER",
      status: "ACTIVE",
    });
    const response = await apiRequest(baseUrl, `/api/companies/${companyId}/operations`, {
      token: signTestToken({
        userId: unlinked.id,
        email: unlinked.email,
        role: "ADMIN",
        tokenVersion: unlinked.tokenVersion,
      }),
    });
    assert.equal(response.status, 403);
    assert.equal(
      (response.body.error as { code?: string })?.code,
      "OPERATIONAL_MANAGER_LINK_REQUIRED",
    );
  });

  it("allows eligible Encargado to list operations and assign collaborators", async () => {
    const listResponse = await apiRequest(baseUrl, `/api/companies/${companyId}/operations`, {
      token: omToken(),
    });
    assert.equal(listResponse.status, 200);

    const assignResponse = await apiRequest(
      baseUrl,
      `/api/companies/${companyId}/operations/${operationId}/employees/batch`,
      {
        token: omToken(),
        method: "POST",
        body: {
          employeeIds: [workerEmployeeId],
          validFrom: operationValidFrom,
        },
      },
    );
    assert.ok([200, 201].includes(assignResponse.status), `assign status ${assignResponse.status}`);
  });

  it("denies structural operation changes for Encargado", async () => {
    const createResponse = await apiRequest(baseUrl, `/api/companies/${companyId}/operations`, {
      token: omToken(),
      method: "POST",
      body: {
        serviceId: "11111111-1111-4111-8111-111111111111",
        scheduledStart: new Date().toISOString(),
        scheduledEnd: new Date(Date.now() + 3_600_000).toISOString(),
        operationKind: "ONE_TIME",
      },
    });
    assert.equal(createResponse.status, 403);

    const updateResponse = await apiRequest(
      baseUrl,
      `/api/companies/${companyId}/operations/${operationId}`,
      {
        token: omToken(),
        method: "PUT",
        body: { earlyToleranceMinutes: 30 },
      },
    );
    assert.equal(updateResponse.status, 403);

    const deleteResponse = await apiRequest(
      baseUrl,
      `/api/companies/${companyId}/operations/${operationId}`,
      { token: omToken(), method: "DELETE" },
    );
    assert.equal(deleteResponse.status, 403);
  });

  it("denies admin modules and employee CRUD while allowing lookups", async () => {
    const usersResponse = await apiRequest(baseUrl, `/api/companies/${companyId}/users`, {
      token: omToken(),
    });
    assert.equal(usersResponse.status, 403);

    const employeesResponse = await apiRequest(baseUrl, `/api/companies/${companyId}/employees`, {
      token: omToken(),
    });
    assert.equal(employeesResponse.status, 403);

    const lookupResponse = await apiRequest(baseUrl, `/api/companies/${companyId}/lookups/employees`, {
      token: omToken(),
    });
    assert.equal(lookupResponse.status, 200);
  });

  it("denies cross-tenant access", async () => {
    const response = await apiRequest(baseUrl, `/api/companies/${otherCompanyId}/operations`, {
      token: omToken(),
    });
    assert.equal(response.status, 403);
  });

  it("allows personal 2FA status without company admin security", async () => {
    const statusResponse = await apiRequest(baseUrl, "/api/auth/2fa/status", {
      token: omToken(),
    });
    assert.equal(statusResponse.status, 200);

    const adminUsersResponse = await apiRequest(baseUrl, `/api/companies/${companyId}/users`, {
      token: adminOwnerToken(),
    });
    assert.equal(adminUsersResponse.status, 200);

    const omUsersResponse = await apiRequest(baseUrl, `/api/companies/${companyId}/users`, {
      token: omToken(),
    });
    assert.equal(omUsersResponse.status, 403);
  });

  it("allows absence review endpoints for Encargado", async () => {
    const listResponse = await apiRequest(baseUrl, `/api/companies/${companyId}/absence-requests`, {
      token: omToken(),
    });
    assert.equal(listResponse.status, 200);
  });
});
