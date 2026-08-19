import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { apiRequest, signTestToken, startTestServer } from "../test-helpers/http-test";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { getPool } from "../database/connection";
import { companyModuleRepository } from "../repositories/company-module.repository";
import { companyRepository } from "../repositories/company.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import { userInvitationRepository } from "../repositories/user-invitation.repository";
import { userRepository } from "../repositories/user.repository";
import { companyWorkScheduleService } from "./company-work-schedule.service";
import { deleteCompanyCascade } from "../test-helpers/integration-cleanup";

const uniqueCompanyName = (): string =>
  `Integration Test Co ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const deleteCreatedCompany = async (companyId: string): Promise<void> => {
  await deleteCompanyCascade(companyId);
};

describeDatabaseIntegration("platform company creation integration", () => {
  let platformAdminId = "";
  const createdCompanyIds: string[] = [];

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();

    const platformAdmin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(platformAdmin?.isPlatformAdmin, "platform superadmin must exist");
    platformAdminId = platformAdmin.id;
  });

  after(async () => {
    try {
      for (const companyId of createdCompanyIds.splice(0)) {
        await deleteCreatedCompany(companyId);
      }
    } finally {
      await teardownDatabaseIntegration();
    }
  });

  it("creates company with settings, modules, work schedule, and OWNER invitation", async () => {
    const companyName = uniqueCompanyName();
    const ownerEmail = `owner-${Date.now()}@integration.test`;

    const result = await createPlatformCompanyFixture(
      {
        name: companyName,
        defaultTimezone: "America/Argentina/Buenos_Aires",
        modules: ["attendance", "attendance", "reports"],
        owner: {
          name: "Integration Owner",
          email: ownerEmail,
        },
      },
      platformAdminId,
    );

    createdCompanyIds.push(result.data.company.id);
    assert.equal(result.data.company.name, companyName);
    assert.equal("temporaryPassword" in result.data, false);
    assert.equal("passwordHash" in result.data, false);
    assert.ok(result.data.ownerInvitation.id);
    assert.equal(result.data.ownerInvitation.email, ownerEmail.toLowerCase());

    const settings = await companySettingsRepository.findByCompanyId(result.data.company.id);
    assert.ok(settings);
    assert.equal(settings.defaultRadiusMeters, 150);

    const modules = await companyModuleRepository.listByCompanyId(result.data.company.id);
    assert.ok(modules.length > 0);
    assert.equal(
      modules.filter((module) => module.moduleKey === "attendance").length,
      1,
    );

    const schedule = await companyWorkScheduleService.getByCompanyId(result.data.company.id);
    assert.ok(schedule);
    assert.ok(schedule.days.length > 0);

    const invitation = await userInvitationRepository.findById(result.data.ownerInvitation.id);
    assert.ok(invitation);
    assert.equal(invitation.status, "PENDING");
    assert.equal(invitation.role, "OWNER");

    const ownerUser = await userRepository.findByEmail(ownerEmail);
    assert.equal(ownerUser, null);
    const memberships = await userCompanyMembershipRepository.listByCompany(
      result.data.company.id,
      { page: 1, limit: 20 },
    );
    assert.equal(memberships.total, 0);
  });

  it("returns 409 COMPANY_NAME_ALREADY_EXISTS for duplicate company name", async () => {
    const companyName = uniqueCompanyName();
    const ownerEmail1 = `owner-a-${Date.now()}@integration.test`;
    const ownerEmail2 = `owner-b-${Date.now()}@integration.test`;

    const first = await createPlatformCompanyFixture(
      {
        name: companyName,
        defaultTimezone: "America/Argentina/Buenos_Aires",
        owner: {
          name: "Owner A",
          email: ownerEmail1,
        },
      },
      platformAdminId,
    );
    createdCompanyIds.push(first.data.company.id);

    await assert.rejects(
      () =>
        createPlatformCompanyFixture(
          {
            name: companyName,
            defaultTimezone: "America/Argentina/Buenos_Aires",
            owner: {
              name: "Owner B",
              email: ownerEmail2,
            },
          },
          platformAdminId,
        ),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        (error as { code: string }).code === "COMPANY_NAME_ALREADY_EXISTS",
    );
  });

  it("invites existing user as OWNER without changing their password", async () => {
    const companyName = uniqueCompanyName();
    const pool = getPool();
    const ownerResult = await pool.request().query(`
      SELECT TOP 1 u.id, u.email, u.name, u.password_hash
      FROM users u
      INNER JOIN user_company_memberships m ON m.user_id = u.id
      WHERE u.is_platform_admin = 0
        AND u.active = 1
        AND m.role = 'OWNER'
        AND m.status = 'ACTIVE'
    `);
    assert.ok(ownerResult.recordset[0], "requires a regular OWNER user");
    const existing = ownerResult.recordset[0] as {
      id: string;
      email: string;
      name: string;
      password_hash: string;
    };

    const result = await createPlatformCompanyFixture(
      {
        name: companyName,
        defaultTimezone: "America/Argentina/Buenos_Aires",
        owner: {
          name: existing.name,
          email: existing.email,
        },
      },
      platformAdminId,
    );
    createdCompanyIds.push(result.data.company.id);

    const ownerAfter = await userRepository.findByEmail(existing.email);
    assert.ok(ownerAfter);
    assert.equal(ownerAfter.passwordHash, existing.password_hash);

    const invitation = await userInvitationRepository.findById(result.data.ownerInvitation.id);
    assert.ok(invitation);
    assert.equal(invitation.targetUserId, existing.id);
    assert.equal(invitation.role, "OWNER");
  });
});

describeDatabaseIntegration("platform company routes authorization", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  let platformAdminId = "";
  let platformAdminEmail = "";
  let platformAdminTokenVersion = 0;
  let regularOwnerId = "";
  let regularOwnerEmail = "";
  let regularOwnerTokenVersion = 0;

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
    platformAdminTokenVersion = platformAdmin.tokenVersion;

    const dinamic = await companyRepository.findByName("Dinamic Systems");
    assert.ok(dinamic);

    const pool = getPool();
    const ownerResult = await pool.request().query(`
      SELECT TOP 1 u.id, u.email, u.token_version
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
    regularOwnerTokenVersion = Number(ownerResult.recordset[0].token_version ?? 0);
  });

  after(async () => {
    try {
      if (closeServer) {
        await closeServer();
      }
    } finally {
      await teardownDatabaseIntegration();
    }
  });

  const createPayload = () => ({
    name: uniqueCompanyName(),
    defaultTimezone: "America/Argentina/Buenos_Aires",
    owner: {
      name: "Route Owner",
      email: `route-owner-${Date.now()}@integration.test`,
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
      tokenVersion: regularOwnerTokenVersion,
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
      tokenVersion: platformAdminTokenVersion,
    });
    const response = await apiRequest(baseUrl, "/api/platform/companies", {
      method: "POST",
      token,
      body: createPayload(),
    });
    assert.equal(response.status, 201);
    const data = response.body.data as Record<string, unknown>;
    assert.ok(data.company);
    assert.ok(data.ownerInvitation);
    assert.equal("temporaryPassword" in data, false);

    const company = data.company as { id?: string };
    if (company.id) {
      await deleteCreatedCompany(company.id);
    }
  });
});
