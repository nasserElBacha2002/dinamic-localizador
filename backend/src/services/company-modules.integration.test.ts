import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import { ALL_COMPANY_MODULE_KEYS } from "../constants/company-modules";
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
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import { userRepository } from "../repositories/user.repository";
import { hashPassword } from "../utils/password";

const TEST_OWNER_EMAIL = "integration-modules-owner@test.local";
const TEST_READ_ONLY_EMAIL = "integration-modules-readonly@test.local";
const TEST_OUTSIDER_EMAIL = "integration-modules-outsider@test.local";

describeDatabaseIntegration("company modules API integration", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  let dinamicCompanyId = "";
  let ownerUserId = "";
  let ownerUserEmail = "";
  let readOnlyUserId = "";
  let readOnlyUserEmail = "";
  let outsiderUserId = "";
  let outsiderUserEmail = "";
  let platformAdminId = "";
  let platformAdminEmail = "";
  let createdUserIds: string[] = [];

  const restoreAllModules = async (companyId: string) => {
    await companyModuleRepository.bulkSet(
      companyId,
      ALL_COMPANY_MODULE_KEYS.map((moduleKey) => ({ moduleKey, isEnabled: true })),
    );
  };

  const patchModules = async (
    token: string,
    companyId: string,
    modules: Array<{ moduleKey: string; isEnabled: boolean }>,
  ) => {
    return apiRequest(baseUrl, `/api/companies/${companyId}/modules`, {
      method: "PATCH",
      token,
      body: { modules },
    });
  };

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
    await companyModuleRepository.ensureDefaults(dinamicCompanyId);

    const platformAdmin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(platformAdmin?.isPlatformAdmin);
    platformAdminId = platformAdmin.id;
    platformAdminEmail = platformAdmin.email;

    const passwordHash = await hashPassword("integration-test-password");
    const ensureUser = async (
      email: string,
      name: string,
      role: "OWNER" | "READ_ONLY",
      companyId: string,
      withMembership: boolean,
    ) => {
      let user = await userRepository.findByEmail(email);
      if (!user) {
        user = await userRepository.create({
          name,
          email,
          passwordHash,
          role: "ADMIN",
        });
        createdUserIds.push(user.id);
      }

      const membership = await userCompanyMembershipRepository.findMembership(user.id, companyId);
      if (withMembership && !membership) {
        await userCompanyMembershipRepository.create({
          userId: user.id,
          companyId,
          role,
          status: "ACTIVE",
        });
      }

      return user;
    };

    const owner = await ensureUser(
      TEST_OWNER_EMAIL,
      "Modules Owner",
      "OWNER",
      dinamicCompanyId,
      true,
    );
    ownerUserId = owner.id;
    ownerUserEmail = owner.email;

    const readOnly = await ensureUser(
      TEST_READ_ONLY_EMAIL,
      "Modules Read Only",
      "READ_ONLY",
      dinamicCompanyId,
      true,
    );
    readOnlyUserId = readOnly.id;
    readOnlyUserEmail = readOnly.email;

    const outsider = await ensureUser(
      TEST_OUTSIDER_EMAIL,
      "Modules Outsider",
      "READ_ONLY",
      dinamicCompanyId,
      false,
    );
    outsiderUserId = outsider.id;
    outsiderUserEmail = outsider.email;
  });

  after(async () => {
    await restoreAllModules(dinamicCompanyId);

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

  it("allows OWNER to list modules", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/modules`, {
      token,
    });
    assert.equal(response.status, 200);
    const data = response.body.data as Array<{ moduleKey: string; isEnabled: boolean }>;
    assert.equal(data.length, ALL_COMPANY_MODULE_KEYS.length);
    assert.equal("id" in (data[0] ?? {}), false);
  });

  it("allows OWNER to update modules", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });
    const response = await patchModules(token, dinamicCompanyId, [
      { moduleKey: "reports", isEnabled: false },
    ]);
    assert.equal(response.status, 200);
    const data = response.body.data as Array<{ moduleKey: string; isEnabled: boolean }>;
    assert.equal(data.find((module) => module.moduleKey === "reports")?.isEnabled, false);
    await restoreAllModules(dinamicCompanyId);
  });

  it("rejects READ_ONLY PATCH", async () => {
    const token = signTestToken({
      userId: readOnlyUserId,
      email: readOnlyUserEmail,
      role: "ADMIN",
    });
    const response = await patchModules(token, dinamicCompanyId, [
      { moduleKey: "reports", isEnabled: false },
    ]);
    assert.equal(response.status, 403);
  });

  it("allows READ_ONLY GET", async () => {
    const token = signTestToken({
      userId: readOnlyUserId,
      email: readOnlyUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/modules`, {
      token,
    });
    assert.equal(response.status, 200);
  });

  it("denies user without membership", async () => {
    const token = signTestToken({
      userId: outsiderUserId,
      email: outsiderUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/modules`, {
      token,
    });
    assert.equal(response.status, 403);
    assert.equal((response.body.error as { code?: string })?.code, "COMPANY_ACCESS_DENIED");
  });

  it("rejects invalid module key", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/modules`, {
      method: "PATCH",
      token,
      body: { modules: [{ moduleKey: "billing", isEnabled: false }] },
    });
    assert.equal(response.status, 400);
  });

  it("rejects duplicate module keys in payload", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/modules`, {
      method: "PATCH",
      token,
      body: {
        modules: [
          { moduleKey: "attendance", isEnabled: true },
          { moduleKey: "attendance", isEnabled: false },
        ],
      },
    });
    assert.equal(response.status, 400);
  });

  it("rejects disabling all core modules", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });
    const response = await patchModules(token, dinamicCompanyId, [
      { moduleKey: "attendance", isEnabled: false },
      { moduleKey: "inventory_operations", isEnabled: false },
      { moduleKey: "absences", isEnabled: false },
    ]);
    assert.equal(response.status, 400);
    assert.equal((response.body.error as { code?: string })?.code, "CORE_MODULES_REQUIRED");
  });

  it("returns MODULE_DISABLED for absence routes when absences module is disabled", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });

    await patchModules(token, dinamicCompanyId, [{ moduleKey: "absences", isEnabled: false }]);

    const requestsResponse = await apiRequest(
      baseUrl,
      `/api/companies/${dinamicCompanyId}/absence-requests`,
      { token },
    );
    assert.equal(requestsResponse.status, 403);
    assert.equal(
      (requestsResponse.body.error as { code?: string })?.code,
      "MODULE_DISABLED",
    );

    const typesResponse = await apiRequest(
      baseUrl,
      `/api/companies/${dinamicCompanyId}/absence-types`,
      { token },
    );
    assert.equal(typesResponse.status, 403);
    assert.equal((typesResponse.body.error as { code?: string })?.code, "MODULE_DISABLED");

    await restoreAllModules(dinamicCompanyId);
  });

  it("does not block dev attendance reminders when absences module is disabled", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });

    await patchModules(token, dinamicCompanyId, [
      { moduleKey: "absences", isEnabled: false },
      { moduleKey: "attendance", isEnabled: true },
    ]);

    const response = await apiRequest(
      baseUrl,
      `/api/companies/${dinamicCompanyId}/dev/attendance-reminders`,
      { token },
    );
    assert.notEqual((response.body.error as { code?: string })?.code, "MODULE_DISABLED");

    await restoreAllModules(dinamicCompanyId);
  });

  it("does not return MODULE_DISABLED for unknown routes when absences module is disabled", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });

    await patchModules(token, dinamicCompanyId, [{ moduleKey: "absences", isEnabled: false }]);

    const response = await apiRequest(
      baseUrl,
      `/api/companies/${dinamicCompanyId}/non-existent-route`,
      { token },
    );
    assert.notEqual((response.body.error as { code?: string })?.code, "MODULE_DISABLED");

    await restoreAllModules(dinamicCompanyId);
  });

  it("allows company users route when optional modules are disabled", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });

    await patchModules(token, dinamicCompanyId, [
      { moduleKey: "reports", isEnabled: false },
      { moduleKey: "bot_simulator", isEnabled: false },
      { moduleKey: "absences", isEnabled: false },
    ]);

    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/users`, {
      token,
    });
    assert.notEqual((response.body.error as { code?: string })?.code, "MODULE_DISABLED");
    assert.equal(response.status, 200);

    await restoreAllModules(dinamicCompanyId);
  });

  it("returns MODULE_DISABLED for platform superadmin on disabled reports routes", async () => {
    const ownerToken = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });
    await patchModules(ownerToken, dinamicCompanyId, [{ moduleKey: "reports", isEnabled: false }]);

    const platformToken = signTestToken({
      userId: platformAdminId,
      email: platformAdminEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(
      baseUrl,
      `/api/companies/${dinamicCompanyId}/statistics/attendance/summary`,
      { token: platformToken },
    );
    assert.equal(response.status, 403);
    assert.equal((response.body.error as { code?: string })?.code, "MODULE_DISABLED");

    await restoreAllModules(dinamicCompanyId);
  });

  it("returns MODULE_DISABLED for platform superadmin on disabled attendance routes", async () => {
    const ownerToken = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });
    await patchModules(ownerToken, dinamicCompanyId, [{ moduleKey: "attendance", isEnabled: false }]);

    const platformToken = signTestToken({
      userId: platformAdminId,
      email: platformAdminEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/attendance`, {
      token: platformToken,
    });
    assert.equal(response.status, 403);
    assert.equal((response.body.error as { code?: string })?.code, "MODULE_DISABLED");

    await restoreAllModules(dinamicCompanyId);
  });

  it("returns MODULE_DISABLED for statistics routes when reports module is disabled", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });

    await patchModules(token, dinamicCompanyId, [{ moduleKey: "reports", isEnabled: false }]);

    const response = await apiRequest(
      baseUrl,
      `/api/companies/${dinamicCompanyId}/statistics/attendance/summary`,
      { token },
    );
    assert.equal(response.status, 403);
    assert.equal((response.body.error as { code?: string })?.code, "MODULE_DISABLED");

    await restoreAllModules(dinamicCompanyId);
  });

  it("returns MODULE_DISABLED for stores when inventory_operations is disabled", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });

    await patchModules(token, dinamicCompanyId, [
      { moduleKey: "inventory_operations", isEnabled: false },
    ]);

    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/stores`, {
      token,
    });
    assert.equal(response.status, 403);
    assert.equal((response.body.error as { code?: string })?.code, "MODULE_DISABLED");

    await restoreAllModules(dinamicCompanyId);
  });

  it("returns MODULE_DISABLED for attendance when attendance module is disabled", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });

    await patchModules(token, dinamicCompanyId, [{ moduleKey: "attendance", isEnabled: false }]);

    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/attendance`, {
      token,
    });
    assert.equal(response.status, 403);
    assert.equal((response.body.error as { code?: string })?.code, "MODULE_DISABLED");

    await restoreAllModules(dinamicCompanyId);
  });

  it("allows employees when only attendance is enabled", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });

    await patchModules(token, dinamicCompanyId, [
      { moduleKey: "attendance", isEnabled: true },
      { moduleKey: "inventory_operations", isEnabled: false },
      { moduleKey: "absences", isEnabled: false },
    ]);

    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/employees`, {
      token,
    });
    assert.equal(response.status, 200);

    await restoreAllModules(dinamicCompanyId);
  });
});
