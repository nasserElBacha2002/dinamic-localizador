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
import { companyModuleRepository } from "../repositories/company-module.repository";
import { companyRepository } from "../repositories/company.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import { userRepository } from "../repositories/user.repository";
import { platformCompanyService } from "./platform-company.service";

const uniqueCompanyName = (): string =>
  `Integration Test Co ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describeDatabaseIntegration("platform company creation integration", () => {
  let platformAdminId = "";
  let platformAdminEmail = "";
  let regularOwnerId = "";
  let regularOwnerEmail = "";
  let createdCompanyIds: string[] = [];
  let createdUserEmails: string[] = [];

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();

    const platformAdmin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(platformAdmin?.isPlatformAdmin, "platform superadmin must exist");
    platformAdminId = platformAdmin.id;
    platformAdminEmail = platformAdmin.email;

    const pool = getPool();
    const ownerResult = await pool.request().query(`
      SELECT TOP 1 u.id, u.email
      FROM users u
      INNER JOIN user_company_memberships m ON m.user_id = u.id
      WHERE u.is_platform_admin = 0
        AND u.active = 1
        AND m.role = 'OWNER'
        AND m.status = 'ACTIVE'
    `);
    assert.ok(ownerResult.recordset[0], "requires a regular OWNER user");
    regularOwnerId = String(ownerResult.recordset[0].id);
    regularOwnerEmail = String(ownerResult.recordset[0].email);
  });

  after(async () => {
    const pool = getPool();
    for (const companyId of createdCompanyIds) {
      await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
        DELETE FROM employee_absence_balances WHERE company_id = @companyId;
        DELETE FROM employees WHERE company_id = @companyId;
        DELETE FROM company_absence_settings WHERE company_id = @companyId;
        DELETE FROM absence_types WHERE company_id = @companyId;
        DELETE FROM company_location_types WHERE company_id = @companyId;
        DELETE FROM user_company_memberships WHERE company_id = @companyId;
        DELETE FROM company_modules WHERE company_id = @companyId;
        DELETE FROM company_settings WHERE company_id = @companyId;
        DELETE FROM companies WHERE id = @companyId;
      `);
    }

    for (const email of createdUserEmails) {
      const user = await userRepository.findByEmail(email);
      if (user) {
        await pool.request().input("userId", sql.UniqueIdentifier, user.id).query(`
          DELETE FROM user_company_memberships WHERE user_id = @userId;
          DELETE FROM users WHERE id = @userId;
        `);
      }
    }

    await teardownDatabaseIntegration();
  });

  it("creates company, settings, modules, and OWNER membership for new owner", async () => {
    const companyName = uniqueCompanyName();
    const ownerEmail = `owner-${Date.now()}@integration.test`;
    createdUserEmails.push(ownerEmail);

    const result = await platformCompanyService.createCompany({
      name: companyName,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      modules: ["attendance", "attendance", "reports"],
      owner: {
        name: "Integration Owner",
        email: ownerEmail,
        temporaryPassword: "password123",
      },
    });

    createdCompanyIds.push(result.data.company.id);
    assert.equal(result.data.company.name, companyName);
    assert.equal("temporaryPassword" in result.data, false);
    assert.equal("passwordHash" in result.data, false);

    const settings = await companySettingsRepository.findByCompanyId(result.data.company.id);
    assert.ok(settings);
    assert.equal(settings.defaultRadiusMeters, 150);

    const modules = await companyModuleRepository.listByCompanyId(result.data.company.id);
    assert.ok(modules.length > 0);
    assert.equal(
      modules.filter((module) => module.moduleKey === "attendance").length,
      1,
    );

    const owner = await userRepository.findByEmail(ownerEmail);
    assert.ok(owner);
    const membership = await userCompanyMembershipRepository.findActiveMembership(
      owner.id,
      result.data.company.id,
    );
    assert.ok(membership);
    assert.equal(membership.role, "OWNER");
  });

  it("returns 409 COMPANY_NAME_ALREADY_EXISTS for duplicate company name", async () => {
    const companyName = uniqueCompanyName();
    const ownerEmail1 = `owner-a-${Date.now()}@integration.test`;
    const ownerEmail2 = `owner-b-${Date.now()}@integration.test`;
    createdUserEmails.push(ownerEmail1, ownerEmail2);

    const first = await platformCompanyService.createCompany({
      name: companyName,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Owner A",
        email: ownerEmail1,
        temporaryPassword: "password123",
      },
    });
    createdCompanyIds.push(first.data.company.id);

    await assert.rejects(
      () =>
        platformCompanyService.createCompany({
          name: companyName,
          defaultTimezone: "America/Argentina/Buenos_Aires",
          owner: {
            name: "Owner B",
            email: ownerEmail2,
            temporaryPassword: "password123",
          },
        }),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        (error as { code: string }).code === "COMPANY_NAME_ALREADY_EXISTS",
    );
  });

  it("reuses existing owner without changing password", async () => {
    const companyName = uniqueCompanyName();
    const existingOwner = await userRepository.findByEmail(regularOwnerEmail);
    assert.ok(existingOwner);
    const passwordBefore = existingOwner.passwordHash;

    const result = await platformCompanyService.createCompany({
      name: companyName,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: existingOwner.name,
        email: existingOwner.email,
      },
    });
    createdCompanyIds.push(result.data.company.id);

    const ownerAfter = await userRepository.findByEmail(regularOwnerEmail);
    assert.ok(ownerAfter);
    assert.equal(ownerAfter.passwordHash, passwordBefore);
  });
});

describeDatabaseIntegration("platform company routes authorization", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  let platformAdminId = "";
  let platformAdminEmail = "";
  let regularOwnerId = "";
  let regularOwnerEmail = "";
  let dinamicCompanyId = "";

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();

    const { app } = await import("../app");
    const server = await startTestServer(app);
    baseUrl = server.baseUrl;
    closeServer = server.close;

    const platformAdmin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(platformAdmin?.isPlatformAdmin);
    platformAdminId = platformAdmin.id;
    platformAdminEmail = platformAdmin.email;

    const dinamic = await companyRepository.findByName("Dinamic Systems");
    assert.ok(dinamic);
    dinamicCompanyId = dinamic.id;

    const pool = getPool();
    const ownerResult = await pool.request().query(`
      SELECT TOP 1 u.id, u.email
      FROM users u
      INNER JOIN user_company_memberships m ON m.user_id = u.id
      WHERE u.is_platform_admin = 0
        AND u.active = 1
        AND m.role = 'OWNER'
        AND m.status = 'ACTIVE'
    `);
    assert.ok(ownerResult.recordset[0]);
    regularOwnerId = String(ownerResult.recordset[0].id);
    regularOwnerEmail = String(ownerResult.recordset[0].email);
  });

  after(async () => {
    if (closeServer) {
      await closeServer();
    }
    await teardownDatabaseIntegration();
  });

  const createPayload = () => ({
    name: uniqueCompanyName(),
    defaultTimezone: "America/Argentina/Buenos_Aires",
    owner: {
      name: "Route Owner",
      email: `route-owner-${Date.now()}@integration.test`,
      temporaryPassword: "password123",
    },
  });

  it("rejects unauthenticated POST /api/platform/companies", async () => {
    const response = await apiRequest(baseUrl, "/api/platform/companies", {
      method: "POST",
      body: createPayload(),
    });
    assert.equal(response.status, 401);
    assert.equal((response.body.error as { code?: string })?.code, "UNAUTHORIZED");
  });

  it("rejects regular user POST /api/platform/companies", async () => {
    const token = signTestToken({
      userId: regularOwnerId,
      email: regularOwnerEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, "/api/platform/companies", {
      method: "POST",
      token,
      body: createPayload(),
    });
    assert.equal(response.status, 403);
    assert.equal((response.body.error as { code?: string })?.code, "PLATFORM_ADMIN_REQUIRED");
  });

  it("allows platform superadmin POST /api/platform/companies", async () => {
    const token = signTestToken({
      userId: platformAdminId,
      email: platformAdminEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, "/api/platform/companies", {
      method: "POST",
      token,
      body: createPayload(),
    });
    assert.equal(response.status, 201);
    const data = response.body.data as Record<string, unknown>;
    assert.ok(data.company);
    assert.equal("temporaryPassword" in data, false);

    const company = data.company as { id?: string };
    if (company.id) {
      const pool = getPool();
      await pool.request().input("companyId", sql.UniqueIdentifier, company.id).query(`
        DELETE FROM user_company_memberships WHERE company_id = @companyId;
        DELETE FROM company_modules WHERE company_id = @companyId;
        DELETE FROM company_settings WHERE company_id = @companyId;
        DELETE FROM companies WHERE id = @companyId;
      `);
    }
  });
});
