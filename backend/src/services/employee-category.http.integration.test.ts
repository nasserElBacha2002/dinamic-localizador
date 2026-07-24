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
import { platformCompanyService } from "./platform-company.service";
import { userRepository } from "../repositories/user.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import { hashPassword } from "../utils/password";
import { employeeCategoryService } from "./employee-category.service";

const uniqueSuffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const deleteCompanyCascade = async (companyId: string): Promise<void> => {
  const pool = getPool();
  await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
    DELETE FROM employee_absence_balances WHERE company_id = @companyId;
    DELETE FROM employees WHERE company_id = @companyId;
    DELETE FROM employee_categories WHERE company_id = @companyId;
    DELETE FROM company_absence_settings WHERE company_id = @companyId;
    DELETE FROM absence_types WHERE company_id = @companyId;
    DELETE FROM company_location_types WHERE company_id = @companyId;
    DELETE FROM user_company_memberships WHERE company_id = @companyId;
    DELETE FROM company_modules WHERE company_id = @companyId;
    DELETE FROM company_settings WHERE company_id = @companyId;
    DELETE FROM companies WHERE id = @companyId;
  `);
};

describeDatabaseIntegration("employee categories HTTP API", () => {
  const createdCompanyIds: string[] = [];
  const createdUserIds: string[] = [];
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  let companyAId = "";
  let companyBId = "";
  let ownerUserId = "";
  let ownerEmail = "";
  let hrUserId = "";
  let hrEmail = "";
  let operatorUserId = "";
  let operatorEmail = "";

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();

    const { app } = await import("../app");
    const server = await startTestServer(app);
    baseUrl = server.baseUrl;
    closeServer = server.close;

    const suffix = uniqueSuffix();
    const companyA = await platformCompanyService.createCompany({
      name: `Cat HTTP A ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Owner A",
        email: `cat-http-owner-a-${suffix}@integration.test`,
        temporaryPassword: "password123",
      },
    });
    const companyB = await platformCompanyService.createCompany({
      name: `Cat HTTP B ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Owner B",
        email: `cat-http-owner-b-${suffix}@integration.test`,
        temporaryPassword: "password123",
      },
    });
    companyAId = companyA.data.company.id;
    companyBId = companyB.data.company.id;
    createdCompanyIds.push(companyAId, companyBId);

    ownerUserId = companyA.data.owner.userId;
    ownerEmail = companyA.data.owner.email;

    const passwordHash = await hashPassword("integration-test-password");
    const hr = await userRepository.create({
      name: "HR Cat",
      email: `cat-http-hr-${suffix}@integration.test`,
      passwordHash,
      role: "ADMIN",
    });
    const operator = await userRepository.create({
      name: "Operator Cat",
      email: `cat-http-op-${suffix}@integration.test`,
      passwordHash,
      role: "ADMIN",
    });
    createdUserIds.push(hr.id, operator.id);
    hrUserId = hr.id;
    hrEmail = hr.email;
    operatorUserId = operator.id;
    operatorEmail = operator.email;

    await userCompanyMembershipRepository.create({
      userId: hr.id,
      companyId: companyAId,
      role: "HR",
      status: "ACTIVE",
    });
    await userCompanyMembershipRepository.create({
      userId: operator.id,
      companyId: companyAId,
      role: "OPERATOR",
      status: "ACTIVE",
    });
  });

  after(async () => {
    const pool = getPool();
    for (const companyId of createdCompanyIds.splice(0)) {
      await deleteCompanyCascade(companyId);
    }
    for (const userId of createdUserIds.splice(0)) {
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

  const pathFor = (companyId: string, suffix = "") =>
    `/api/companies/${companyId}/employee-categories${suffix}`;

  const ownerToken = () =>
    signTestToken({ userId: ownerUserId, email: ownerEmail, role: "ADMIN" });
  const hrToken = () => signTestToken({ userId: hrUserId, email: hrEmail, role: "ADMIN" });
  const operatorToken = () =>
    signTestToken({ userId: operatorUserId, email: operatorEmail, role: "ADMIN" });

  it("GET allows employees:read (HR) and returns category contract", async () => {
    const response = await apiRequest(baseUrl, pathFor(companyAId), { token: hrToken() });
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.body.data));
    const rows = response.body.data as Array<Record<string, unknown>>;
    assert.ok(rows.length >= 5);
    const sample = rows.find((row) => row.isSystem === true);
    assert.ok(sample);
    assert.equal(typeof sample.id, "string");
    assert.equal(typeof sample.name, "string");
    assert.equal(typeof sample.normalizedName, "string");
    assert.equal(typeof sample.isActive, "boolean");
    assert.equal(sample.companyId, null);
  });

  it("GET allows company:read (OPERATOR) without employees:read", async () => {
    const response = await apiRequest(baseUrl, pathFor(companyAId), { token: operatorToken() });
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.body.data));
  });

  it("POST/PATCH without company:settings:update return 403", async () => {
    const createDenied = await apiRequest(baseUrl, pathFor(companyAId), {
      method: "POST",
      token: hrToken(),
      body: { name: "Should Fail" },
    });
    assert.equal(createDenied.status, 403);

    const listed = await employeeCategoryService.list(companyAId, { includeInactive: false });
    const custom = listed.find((row) => !row.isSystem);
    const targetId = custom?.id ?? listed[0]!.id;

    const patchDenied = await apiRequest(baseUrl, pathFor(companyAId, `/${targetId}`), {
      method: "PATCH",
      token: hrToken(),
      body: { isActive: false },
    });
    assert.equal(patchDenied.status, 403);
  });

  it("POST rejects invalid body with 400", async () => {
    const empty = await apiRequest(baseUrl, pathFor(companyAId), {
      method: "POST",
      token: ownerToken(),
      body: { name: "   " },
    });
    assert.equal(empty.status, 400);

    const missing = await apiRequest(baseUrl, pathFor(companyAId), {
      method: "POST",
      token: ownerToken(),
      body: {},
    });
    assert.equal(missing.status, 400);
  });

  it("PATCH rejects invalid UUID with 400", async () => {
    const response = await apiRequest(baseUrl, pathFor(companyAId, "/not-a-uuid"), {
      method: "PATCH",
      token: ownerToken(),
      body: { isActive: false },
    });
    assert.equal(response.status, 400);
  });

  it("POST creates custom category (201) and rejects duplicate (409)", async () => {
    const name = `HTTP Audit ${uniqueSuffix()}`;
    const created = await apiRequest(baseUrl, pathFor(companyAId), {
      method: "POST",
      token: ownerToken(),
      body: { name },
    });
    assert.equal(created.status, 201);
    const data = created.body.data as Record<string, unknown>;
    assert.equal(data.name, name);
    assert.equal(data.isSystem, false);
    assert.equal(data.companyId, companyAId);
    assert.equal(data.isActive, true);

    const duplicate = await apiRequest(baseUrl, pathFor(companyAId), {
      method: "POST",
      token: ownerToken(),
      body: { name: `  ${name.toUpperCase()}  ` },
    });
    assert.equal(duplicate.status, 409);
  });

  it("rejects mutating system category and foreign company category", async () => {
    const listedA = await employeeCategoryService.list(companyAId, { includeInactive: false });
    const system = listedA.find((row) => row.isSystem && row.name === "Operario");
    assert.ok(system);

    const systemPatch = await apiRequest(baseUrl, pathFor(companyAId, `/${system.id}`), {
      method: "PATCH",
      token: ownerToken(),
      body: { isActive: false },
    });
    assert.equal(systemPatch.status, 403);
    assert.equal(
      (systemPatch.body.error as { code?: string } | undefined)?.code,
      "EMPLOYEE_CATEGORY_SYSTEM_IMMUTABLE",
    );

    const createdB = await employeeCategoryService.create(companyBId, "OWNER", {
      name: `Foreign ${uniqueSuffix()}`,
    });

    const foreignGetViaPatch = await apiRequest(baseUrl, pathFor(companyAId, `/${createdB.id}`), {
      method: "PATCH",
      token: ownerToken(),
      body: { isActive: false },
    });
    assert.equal(foreignGetViaPatch.status, 404);
  });

  it("does not expose collaborator-categories alias", async () => {
    const response = await apiRequest(
      baseUrl,
      `/api/companies/${companyAId}/collaborator-categories`,
      { token: ownerToken() },
    );
    assert.equal(response.status, 404);
  });
});
