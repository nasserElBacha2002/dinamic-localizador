import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import { resolvePermissionsForRole } from "../constants/company-permissions";
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

const TEST_OWNER_EMAIL = "integration-me-owner@test.local";
const TEST_READ_ONLY_EMAIL = "integration-me-readonly@test.local";
const TEST_OUTSIDER_EMAIL = "integration-me-outsider@test.local";

describe("GET /api/companies/:companyId/me contract", () => {
  it("OWNER effective permissions include users:manage", () => {
    const permissions = resolvePermissionsForRole("OWNER");
    assert.equal(permissions.has("users:manage"), true);
  });

  it("READ_ONLY effective permissions exclude users:manage", () => {
    const permissions = resolvePermissionsForRole("READ_ONLY");
    assert.equal(permissions.has("users:manage"), false);
  });
});

describeDatabaseIntegration("GET /api/companies/:companyId/me integration", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  let dinamicCompanyId = "";
  let platformAdminId = "";
  let platformAdminEmail = "";
  let ownerUserId = "";
  let ownerUserEmail = "";
  let readOnlyUserId = "";
  let readOnlyUserEmail = "";
  let outsiderUserId = "";
  let outsiderUserEmail = "";
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

    const ensureUser = async (
      email: string,
      name: string,
      role: "OWNER" | "READ_ONLY",
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

      const membership = await userCompanyMembershipRepository.findMembership(user.id, dinamicCompanyId);
      if (withMembership && !membership) {
        await userCompanyMembershipRepository.create({
          userId: user.id,
          companyId: dinamicCompanyId,
          role,
          status: "ACTIVE",
        });
      }

      return user;
    };

    const owner = await ensureUser(TEST_OWNER_EMAIL, "Integration Owner", "OWNER", true);
    ownerUserId = owner.id;
    ownerUserEmail = owner.email;

    const readOnly = await ensureUser(TEST_READ_ONLY_EMAIL, "Integration Read Only", "READ_ONLY", true);
    readOnlyUserId = readOnly.id;
    readOnlyUserEmail = readOnly.email;

    const outsider = await ensureUser(TEST_OUTSIDER_EMAIL, "Integration Outsider", "READ_ONLY", false);
    const outsiderMembership = await userCompanyMembershipRepository.findMembership(
      outsider.id,
      dinamicCompanyId,
    );
    if (outsiderMembership) {
      const pool = getPool();
      await pool
        .request()
        .input("membershipId", sql.UniqueIdentifier, outsiderMembership.id)
        .query(`DELETE FROM user_company_memberships WHERE id = @membershipId`);
    }
    outsiderUserId = outsider.id;
    outsiderUserEmail = outsider.email;
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

  it("returns OWNER permissions for regular owner user", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/me`, { token });
    assert.equal(response.status, 200);

    const data = response.body.data as {
      companyId: string;
      companyName: string;
      role: string;
      isPlatformAdmin: boolean;
      permissions: string[];
    };
    assert.equal(data.companyId, dinamicCompanyId);
    assert.equal(data.role, "OWNER");
    assert.equal(data.isPlatformAdmin, false);
    assert.ok(data.permissions.includes("users:manage"));
  });

  it("returns READ_ONLY permissions without users:manage", async () => {
    const token = signTestToken({
      userId: readOnlyUserId,
      email: readOnlyUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/me`, { token });
    assert.equal(response.status, 200);

    const data = response.body.data as {
      role: string;
      isPlatformAdmin: boolean;
      permissions: string[];
    };
    assert.equal(data.role, "READ_ONLY");
    assert.equal(data.isPlatformAdmin, false);
    assert.equal(data.permissions.includes("users:manage"), false);
  });

  it("returns platform superadmin OWNER context without membership row", async () => {
    const token = signTestToken({
      userId: platformAdminId,
      email: platformAdminEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/me`, { token });
    assert.equal(response.status, 200);

    const data = response.body.data as {
      role: string;
      isPlatformAdmin: boolean;
      permissions: string[];
    };
    assert.equal(data.role, "OWNER");
    assert.equal(data.isPlatformAdmin, true);
    assert.ok(data.permissions.includes("users:manage"));
  });

  it("returns 403 COMPANY_ACCESS_DENIED for user without membership", async () => {
    const token = signTestToken({
      userId: outsiderUserId,
      email: outsiderUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/me`, { token });
    assert.equal(response.status, 403);
    assert.equal((response.body.error as { code?: string })?.code, "COMPANY_ACCESS_DENIED");
  });
});
