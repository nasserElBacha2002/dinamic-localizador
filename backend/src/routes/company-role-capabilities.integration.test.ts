import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { COMPANY_ROLES } from "../types/company";
import { buildRoleCapabilities } from "../constants/company-permission-catalog";
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

const TEST_OWNER_EMAIL = "integration-role-caps-owner@test.local";
const TEST_ADMIN_EMAIL = "integration-role-caps-admin@test.local";
const TEST_INACTIVE_EMAIL = "integration-role-caps-inactive@test.local";
const TEST_OUTSIDER_EMAIL = "integration-role-caps-outsider@test.local";

describeDatabaseIntegration("GET /companies/:companyId/roles/:role/capabilities", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  let dinamicCompanyId = "";
  let otherCompanyId = "";
  let platformAdminId = "";
  let platformAdminEmail = "";
  let ownerUserId = "";
  let ownerUserEmail = "";
  let adminUserId = "";
  let adminUserEmail = "";
  let inactiveUserId = "";
  let inactiveUserEmail = "";
  let outsiderUserId = "";
  let outsiderUserEmail = "";
  const createdUserIds: string[] = [];
  let createdIsolationCompanyId = "";

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
        VALUES (N'Role Caps Isolation Co', N'America/Argentina/Buenos_Aires', N'ACTIVE')
      `);
      otherCompanyId = String(created.recordset[0].id);
      createdIsolationCompanyId = otherCompanyId;
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

    const passwordHash = await hashPassword("integration-test-password");

    const ensureUser = async (
      email: string,
      name: string,
      role: "OWNER" | "ADMIN" | "READ_ONLY",
      options: { withMembership: boolean; membershipStatus?: "ACTIVE" | "INACTIVE" },
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

      const membership = await userCompanyMembershipRepository.findMembership(
        user.id,
        dinamicCompanyId,
      );
      if (options.withMembership) {
        if (!membership) {
          await userCompanyMembershipRepository.create({
            userId: user.id,
            companyId: dinamicCompanyId,
            role,
            status: options.membershipStatus ?? "ACTIVE",
          });
        } else if (options.membershipStatus === "INACTIVE") {
          await pool
            .request()
            .input("membershipId", sql.UniqueIdentifier, membership.id)
            .query(
              `UPDATE user_company_memberships SET status = N'INACTIVE', updated_at = SYSUTCDATETIME() WHERE id = @membershipId`,
            );
        }
      } else if (membership) {
        await pool
          .request()
          .input("membershipId", sql.UniqueIdentifier, membership.id)
          .query(`DELETE FROM user_company_memberships WHERE id = @membershipId`);
      }

      return user;
    };

    const owner = await ensureUser(TEST_OWNER_EMAIL, "Role Caps Owner", "OWNER", {
      withMembership: true,
    });
    ownerUserId = owner.id;
    ownerUserEmail = owner.email;

    const admin = await ensureUser(TEST_ADMIN_EMAIL, "Role Caps Admin", "ADMIN", {
      withMembership: true,
    });
    adminUserId = admin.id;
    adminUserEmail = admin.email;

    const inactive = await ensureUser(TEST_INACTIVE_EMAIL, "Role Caps Inactive", "OWNER", {
      withMembership: true,
      membershipStatus: "INACTIVE",
    });
    inactiveUserId = inactive.id;
    inactiveUserEmail = inactive.email;

    const outsider = await ensureUser(TEST_OUTSIDER_EMAIL, "Role Caps Outsider", "OWNER", {
      withMembership: false,
    });
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
    if (createdIsolationCompanyId) {
      const { deleteCompanyCascade } = await import("../test-helpers/integration-cleanup");
      await deleteCompanyCascade(createdIsolationCompanyId);
    }
    if (closeServer) {
      await closeServer();
    }
    await teardownDatabaseIntegration();
  });

  const pathFor = (companyId: string, role: string) =>
    `/api/companies/${companyId}/roles/${encodeURIComponent(role)}/capabilities`;

  it("returns 200 for OWNER with users:manage", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, pathFor(dinamicCompanyId, "ADMIN"), { token });
    assert.equal(response.status, 200);
    const data = response.body.data as {
      role: string;
      name: string;
      permissions: Array<{ code: string; label: string }>;
      restrictions: Array<{ code: string; message: string }>;
      assignableRoles?: unknown;
    };
    assert.equal(data.role, "ADMIN");
    assert.equal(data.name, "Administrador");
    assert.ok(data.permissions.some((item) => item.code === "employees:read"));
    assert.equal(
      data.permissions.some((item) => item.code === "users:manage"),
      false,
    );
    assert.ok(data.restrictions.some((item) => item.code === "CANNOT_MANAGE_USERS"));
    assert.equal(data.assignableRoles, undefined);
  });

  it("returns 401 without authentication", async () => {
    const response = await apiRequest(baseUrl, pathFor(dinamicCompanyId, "ADMIN"));
    assert.equal(response.status, 401);
  });

  it("returns 403 for member without users:manage", async () => {
    const token = signTestToken({
      userId: adminUserId,
      email: adminUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, pathFor(dinamicCompanyId, "OPERATOR"), { token });
    assert.equal(response.status, 403);
  });

  it("rejects user that only belongs to another company", async () => {
    const token = signTestToken({
      userId: outsiderUserId,
      email: outsiderUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, pathFor(dinamicCompanyId, "ADMIN"), { token });
    assert.equal(response.status, 403);
    const error = response.body.error as { code?: string };
    // Scoped company routes use COMPANY_ACCESS_DENIED (same as GET /me).
    assert.equal(error.code, "COMPANY_ACCESS_DENIED");
  });

  it("rejects inactive membership", async () => {
    const token = signTestToken({
      userId: inactiveUserId,
      email: inactiveUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, pathFor(dinamicCompanyId, "ADMIN"), { token });
    assert.equal(response.status, 403);
  });

  it("returns 404 ROLE_NOT_FOUND for unknown role", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, pathFor(dinamicCompanyId, "VIEWER"), { token });
    assert.equal(response.status, 404);
    const error = response.body.error as { code?: string };
    assert.equal(error.code, "ROLE_NOT_FOUND");
  });

  it("returns validation error for invalid companyId", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, pathFor("not-a-uuid", "ADMIN"), { token });
    assert.ok(response.status === 400 || response.status === 422);
  });

  it("returns correct payload for every valid company role", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });
    for (const role of COMPANY_ROLES) {
      const response = await apiRequest(baseUrl, pathFor(dinamicCompanyId, role), { token });
      assert.equal(response.status, 200, `expected 200 for ${role}`);
      const data = response.body.data as { role: string; name: string };
      const expected = buildRoleCapabilities(role);
      assert.equal(data.role, expected.role);
      assert.equal(data.name, expected.name);
    }
  });

  it("allows platform admin without membership row", async () => {
    const token = signTestToken({
      userId: platformAdminId,
      email: platformAdminEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, pathFor(dinamicCompanyId, "HR"), { token });
    assert.equal(response.status, 200);
    const data = response.body.data as { role: string };
    assert.equal(data.role, "HR");
  });

  it("does not leak another company context in the payload", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });
    const response = await apiRequest(baseUrl, pathFor(dinamicCompanyId, "OWNER"), { token });
    assert.equal(response.status, 200);
    const serialized = JSON.stringify(response.body);
    assert.equal(serialized.includes(otherCompanyId), false);
    assert.equal("companyId" in ((response.body.data as object) ?? {}), false);
  });
});
