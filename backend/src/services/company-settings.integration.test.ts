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
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import { userRepository } from "../repositories/user.repository";
import { hashPassword } from "../utils/password";

const TEST_OWNER_EMAIL = "integration-settings-owner@test.local";
const TEST_READ_ONLY_EMAIL = "integration-settings-readonly@test.local";
const TEST_OUTSIDER_EMAIL = "integration-settings-outsider@test.local";

describe("company settings permissions", () => {
  it("OWNER has company:settings:update", () => {
    assert.ok(resolvePermissionsForRole("OWNER").has("company:settings:update"));
  });

  it("READ_ONLY does not have company:settings:update", () => {
    assert.equal(resolvePermissionsForRole("READ_ONLY").has("company:settings:update"), false);
  });
});

describeDatabaseIntegration("company settings API integration", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  let dinamicCompanyId = "";
  let otherCompanyId = "";
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

    const pool = getPool();
    const otherCompanyResult = await pool.request().query(`
      SELECT TOP 1 id FROM companies WHERE name <> N'Dinamic Systems' ORDER BY created_at ASC
    `);
    if (otherCompanyResult.recordset[0]?.id) {
      otherCompanyId = String(otherCompanyResult.recordset[0].id);
    } else {
      const created = await pool.request().query(`
        INSERT INTO companies (name, default_timezone, status)
        OUTPUT INSERTED.id
        VALUES (N'Settings Test Co', N'America/Argentina/Buenos_Aires', N'ACTIVE')
      `);
      otherCompanyId = String(created.recordset[0].id);
      await pool.request().input("companyId", sql.UniqueIdentifier, otherCompanyId).query(`
        INSERT INTO company_settings (
          company_id, operation_timezone, default_radius_meters,
          late_grace_minutes, early_leave_tolerance_minutes,
          require_checkout_location, allow_manual_attendance_corrections
        )
        VALUES (
          @companyId, N'America/Argentina/Buenos_Aires', 150, 15, 15, 1, 1
        )
      `);
    }

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
      "Settings Owner",
      "OWNER",
      dinamicCompanyId,
      true,
    );
    ownerUserId = owner.id;
    ownerUserEmail = owner.email;

    const readOnly = await ensureUser(
      TEST_READ_ONLY_EMAIL,
      "Settings Read Only",
      "READ_ONLY",
      dinamicCompanyId,
      true,
    );
    readOnlyUserId = readOnly.id;
    readOnlyUserEmail = readOnly.email;

    const outsider = await ensureUser(
      TEST_OUTSIDER_EMAIL,
      "Settings Outsider",
      "READ_ONLY",
      dinamicCompanyId,
      false,
    );
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

  it("allows OWNER to read settings", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/settings`, {
      token,
    });
    assert.equal(response.status, 200);
    const data = response.body.data as Record<string, unknown>;
    assert.equal(data.companyId, dinamicCompanyId);
    assert.equal("id" in data, false);
  });

  it("allows OWNER to update settings", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/settings`, {
      method: "PATCH",
      token,
      body: { defaultRadiusMeters: 180 },
    });
    assert.equal(response.status, 200);
    const data = response.body.data as { defaultRadiusMeters?: number };
    assert.equal(data.defaultRadiusMeters, 180);
  });

  it("rejects READ_ONLY PATCH", async () => {
    const token = signTestToken({
      userId: readOnlyUserId,
      email: readOnlyUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/settings`, {
      method: "PATCH",
      token,
      body: { defaultRadiusMeters: 190 },
    });
    assert.equal(response.status, 403);
  });

  it("allows READ_ONLY GET", async () => {
    const token = signTestToken({
      userId: readOnlyUserId,
      email: readOnlyUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/settings`, {
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
    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/settings`, {
      token,
    });
    assert.equal(response.status, 403);
    assert.equal((response.body.error as { code?: string })?.code, "COMPANY_ACCESS_DENIED");
  });

  it("allows platform superadmin to update any active company settings", async () => {
    const token = signTestToken({
      userId: platformAdminId,
      email: platformAdminEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, `/api/companies/${otherCompanyId}/settings`, {
      method: "PATCH",
      token,
      body: { lateGraceMinutes: 25 },
    });
    assert.equal(response.status, 200);
    const data = response.body.data as { lateGraceMinutes?: number };
    assert.equal(data.lateGraceMinutes, 25);
  });

  it("rejects invalid radius", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/settings`, {
      method: "PATCH",
      token,
      body: { defaultRadiusMeters: 0 },
    });
    assert.equal(response.status, 400);
  });

  it("rejects empty PATCH body", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, `/api/companies/${dinamicCompanyId}/settings`, {
      method: "PATCH",
      token,
      body: {},
    });
    assert.equal(response.status, 400);
  });

  it("isolates settings updates to selected company", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });

    const otherCompanyResponse = await apiRequest(
      baseUrl,
      `/api/companies/${otherCompanyId}/settings`,
      { token },
    );
    assert.equal(otherCompanyResponse.status, 403);

    const dinamicSettings = await companySettingsRepository.findByCompanyId(dinamicCompanyId);
    const otherSettings = await companySettingsRepository.findByCompanyId(otherCompanyId);
    assert.ok(dinamicSettings);
    assert.ok(otherSettings);
    assert.notEqual(dinamicSettings.companyId, otherSettings.companyId);
  });
});
