import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { hashPassword, normalizeEmail } from "../utils/password";
import { AppError } from "../errors/app-error";

/**
 * SQL Server integration for last-OWNER concurrency under transactional locks.
 * Enable: RUN_DB_INTEGRATION_TESTS=true npm run test:integration
 */
describeDatabaseIntegration("company user last-owner concurrency", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("keeps at least one active OWNER under concurrent demotions", async () => {
    const { getPool } = await import("../database/connection");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("../services/company-user.service");
    const { deleteCompanyCascade } = await import("../test-helpers/integration-cleanup");
    const sql = (await import("mssql")).default;

    const pool = getPool();
    const suffix = `${Date.now()}.${Math.random().toString(16).slice(2)}`;
    const passwordHash = await hashPassword("integration-test-password");

    const companyResult = await pool.request().query(`
      INSERT INTO companies (name, default_timezone, status)
      OUTPUT INSERTED.id
      VALUES (N'Last Owner Concurrent ${suffix}', N'America/Argentina/Buenos_Aires', N'ACTIVE')
    `);
    const companyId = String(companyResult.recordset[0].id);

    await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
      INSERT INTO company_settings (
        company_id, operation_timezone, default_radius_meters,
        late_grace_minutes, early_leave_tolerance_minutes,
        require_checkout_location, allow_manual_attendance_corrections
      )
      VALUES (
        @companyId, N'America/Argentina/Buenos_Aires', 150, 15, 15, 1, 1
      )
    `);

    const ownerA = await userRepository.create({
      name: "Owner A Concurrent",
      email: normalizeEmail(`owner.a.${suffix}@example.com`),
      passwordHash,
      role: "ADMIN",
    });
    const ownerB = await userRepository.create({
      name: "Owner B Concurrent",
      email: normalizeEmail(`owner.b.${suffix}@example.com`),
      passwordHash,
      role: "ADMIN",
    });
    const actor = await userRepository.create({
      name: "Platform Actor Concurrent",
      email: normalizeEmail(`actor.${suffix}@example.com`),
      passwordHash,
      role: "ADMIN",
    });

    await pool
      .request()
      .input("actorId", sql.UniqueIdentifier, actor.id)
      .query(`UPDATE users SET is_platform_admin = 1 WHERE id = @actorId`);

    await userCompanyMembershipRepository.create({
      userId: ownerA.id,
      companyId,
      role: "OWNER",
      status: "ACTIVE",
      isDefault: true,
    });
    await userCompanyMembershipRepository.create({
      userId: ownerB.id,
      companyId,
      role: "OWNER",
      status: "ACTIVE",
      isDefault: false,
    });

    try {
      assert.equal(await userCompanyMembershipRepository.countActiveOwners(companyId), 2);

      const [first, second] = await Promise.allSettled([
        companyUserService.update(
          companyId,
          ownerA.id,
          { role: "ADMIN" },
          actor.id,
          true,
          "OWNER",
        ),
        companyUserService.update(
          companyId,
          ownerB.id,
          { role: "ADMIN" },
          actor.id,
          true,
          "OWNER",
        ),
      ]);

      const fulfilled = [first, second].filter((result) => result.status === "fulfilled");
      const rejected = [first, second].filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );

      assert.equal(fulfilled.length, 1);
      assert.equal(rejected.length, 1);
      assert.ok(
        rejected[0].reason instanceof AppError &&
          rejected[0].reason.code === "LAST_OWNER_PROTECTED",
      );

      assert.equal(await userCompanyMembershipRepository.countActiveOwners(companyId), 1);

      const membershipA = await userCompanyMembershipRepository.findMembership(
        ownerA.id,
        companyId,
      );
      const membershipB = await userCompanyMembershipRepository.findMembership(
        ownerB.id,
        companyId,
      );
      const activeOwners = [membershipA, membershipB].filter(
        (row) => row?.role === "OWNER" && row.status === "ACTIVE",
      );
      assert.equal(activeOwners.length, 1);
    } finally {
      await pool
        .request()
        .input("userA", sql.UniqueIdentifier, ownerA.id)
        .input("userB", sql.UniqueIdentifier, ownerB.id)
        .input("actor", sql.UniqueIdentifier, actor.id)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          DELETE FROM audit_logs
          WHERE company_id = @companyId
             OR user_id IN (@userA, @userB, @actor);
          DELETE FROM user_company_memberships WHERE user_id IN (@userA, @userB, @actor);
          DELETE FROM users WHERE id IN (@userA, @userB, @actor);
        `);
      await deleteCompanyCascade(companyId);
    }
  });
});
