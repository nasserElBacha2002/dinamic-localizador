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
 * SQL integration: cross-tenant scope, atomic profile writes, actor-role refresh,
 * email uniqueness under concurrency, and last-OWNER protection.
 * Enable: RUN_DB_INTEGRATION_TESTS=true npm run test:integration
 */
describeDatabaseIntegration("company user profile transaction & authz", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("rejects cross-company profile writes and leaves no persisted changes", async () => {
    const { getPool } = await import("../database/connection");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");
    const { deleteCompanyCascade } = await import("../test-helpers/integration-cleanup");
    const sql = (await import("mssql")).default;

    const pool = getPool();
    const suffix = `${Date.now()}.${Math.random().toString(16).slice(2)}`;
    const passwordHash = await hashPassword("integration-test-password");

    const companyA = await pool.request().query(`
      INSERT INTO companies (name, default_timezone, status)
      OUTPUT INSERTED.id
      VALUES (N'Profile Txn A ${suffix}', N'America/Argentina/Buenos_Aires', N'ACTIVE')
    `);
    const companyB = await pool.request().query(`
      INSERT INTO companies (name, default_timezone, status)
      OUTPUT INSERTED.id
      VALUES (N'Profile Txn B ${suffix}', N'America/Argentina/Buenos_Aires', N'ACTIVE')
    `);
    const companyAId = String(companyA.recordset[0].id);
    const companyBId = String(companyB.recordset[0].id);

    for (const companyId of [companyAId, companyBId]) {
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
    }

    const actorA = await userRepository.create({
      name: "Actor A",
      email: normalizeEmail(`actor.a.${suffix}@example.com`),
      passwordHash,
      role: "ADMIN",
    });
    const targetB = await userRepository.create({
      name: "Target B Original",
      email: normalizeEmail(`target.b.${suffix}@example.com`),
      passwordHash,
      role: "ADMIN",
    });

    await userCompanyMembershipRepository.create({
      userId: actorA.id,
      companyId: companyAId,
      role: "OWNER",
      status: "ACTIVE",
      isDefault: true,
    });
    await userCompanyMembershipRepository.create({
      userId: targetB.id,
      companyId: companyBId,
      role: "ADMIN",
      status: "ACTIVE",
      isDefault: true,
    });

    try {
      await assert.rejects(
        () =>
          companyUserService.update(
            companyAId,
            targetB.id,
            {
              name: "Hacked From A",
              email: normalizeEmail(`hacked.${suffix}@example.com`),
              phoneNumber: "+5491199990000",
            },
            actorA.id,
            false,
            "OWNER",
          ),
        (error: unknown) =>
          error instanceof AppError && error.code === "COMPANY_USER_NOT_FOUND",
      );

      const persisted = await userRepository.findById(targetB.id);
      assert.ok(persisted);
      assert.equal(persisted.name, "Target B Original");
      assert.equal(persisted.email, normalizeEmail(`target.b.${suffix}@example.com`));
      assert.equal(persisted.phoneNumber ?? null, null);
    } finally {
      await deleteCompanyCascade(companyAId);
      await deleteCompanyCascade(companyBId);
    }
  });

  it("rolls back name/email when phone write fails inside the same transaction", async () => {
    const { getPool } = await import("../database/connection");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { deleteCompanyCascade } = await import("../test-helpers/integration-cleanup");
    const sql = (await import("mssql")).default;

    const pool = getPool();
    const suffix = `${Date.now()}.${Math.random().toString(16).slice(2)}`;
    const passwordHash = await hashPassword("integration-test-password");

    const companyResult = await pool.request().query(`
      INSERT INTO companies (name, default_timezone, status)
      OUTPUT INSERTED.id
      VALUES (N'Profile Rollback ${suffix}', N'America/Argentina/Buenos_Aires', N'ACTIVE')
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

    const selfUser = await userRepository.create({
      name: "Rollback Self",
      email: normalizeEmail(`rollback.self.${suffix}@example.com`),
      passwordHash,
      role: "ADMIN",
    });
    await userCompanyMembershipRepository.create({
      userId: selfUser.id,
      companyId,
      role: "OWNER",
      status: "ACTIVE",
      isDefault: true,
    });

    const original = await userRepository.findById(selfUser.id);
    assert.ok(original);

    try {
      await assert.rejects(
        () =>
          userCompanyMembershipRepository.applyCompanyUserUpdateWithGuards(
            companyId,
            selfUser.id,
            selfUser.id,
            {
              profile: {
                name: "Should Not Persist",
                email: normalizeEmail(`rollback.changed.${suffix}@example.com`),
                phoneNumber: "+5491112345678",
              },
            },
            () => undefined,
            async () => {
              throw new AppError(500, "AUDIT_FORCE_FAIL", "Forced audit failure for rollback.");
            },
          ),
        (error: unknown) =>
          error instanceof AppError && error.code === "AUDIT_FORCE_FAIL",
      );

      const after = await userRepository.findById(selfUser.id);
      assert.ok(after);
      assert.equal(after.name, original.name);
      assert.equal(after.email, original.email);
      assert.equal(after.phoneNumber ?? null, original.phoneNumber ?? null);
    } finally {
      await deleteCompanyCascade(companyId);
    }
  });

  it("refreshes actor role under lock so a demoted actor cannot inactivate", async () => {
    const { getPool } = await import("../database/connection");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");
    const { deleteCompanyCascade } = await import("../test-helpers/integration-cleanup");
    const sql = (await import("mssql")).default;

    const pool = getPool();
    const suffix = `${Date.now()}.${Math.random().toString(16).slice(2)}`;
    const passwordHash = await hashPassword("integration-test-password");

    const companyResult = await pool.request().query(`
      INSERT INTO companies (name, default_timezone, status)
      OUTPUT INSERTED.id
      VALUES (N'Actor Demote ${suffix}', N'America/Argentina/Buenos_Aires', N'ACTIVE')
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

    const owner = await userRepository.create({
      name: "Owner Stable",
      email: normalizeEmail(`owner.stable.${suffix}@example.com`),
      passwordHash,
      role: "ADMIN",
    });
    const actor = await userRepository.create({
      name: "Actor Demotable",
      email: normalizeEmail(`actor.demote.${suffix}@example.com`),
      passwordHash,
      role: "ADMIN",
    });
    const target = await userRepository.create({
      name: "Target Inferior",
      email: normalizeEmail(`target.inferior.${suffix}@example.com`),
      passwordHash,
      role: "ADMIN",
    });

    await userCompanyMembershipRepository.create({
      userId: owner.id,
      companyId,
      role: "OWNER",
      status: "ACTIVE",
      isDefault: true,
    });
    await userCompanyMembershipRepository.create({
      userId: actor.id,
      companyId,
      role: "ADMIN",
      status: "ACTIVE",
      isDefault: false,
    });
    await userCompanyMembershipRepository.create({
      userId: target.id,
      companyId,
      role: "HR",
      status: "ACTIVE",
      isDefault: false,
    });

    try {
      await userCompanyMembershipRepository.updateMembership(companyId, actor.id, {
        role: "HR",
      });

      await assert.rejects(
        () =>
          companyUserService.update(
            companyId,
            target.id,
            { status: "INACTIVE" },
            actor.id,
            false,
            "ADMIN",
          ),
        (error: unknown) =>
          error instanceof AppError && error.code === "TARGET_ROLE_NOT_LOWER",
      );

      const membership = await userCompanyMembershipRepository.findMembership(
        target.id,
        companyId,
      );
      assert.ok(membership);
      assert.equal(membership.status, "ACTIVE");
    } finally {
      await deleteCompanyCascade(companyId);
    }
  });

  it("enforces UQ_users_email under concurrent self email updates", async () => {
    const { getPool } = await import("../database/connection");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");
    const { deleteCompanyCascade } = await import("../test-helpers/integration-cleanup");
    const sql = (await import("mssql")).default;

    const pool = getPool();
    const suffix = `${Date.now()}.${Math.random().toString(16).slice(2)}`;
    const passwordHash = await hashPassword("integration-test-password");
    const contestedEmail = normalizeEmail(`contested.${suffix}@example.com`);

    const companyResult = await pool.request().query(`
      INSERT INTO companies (name, default_timezone, status)
      OUTPUT INSERTED.id
      VALUES (N'Email Race ${suffix}', N'America/Argentina/Buenos_Aires', N'ACTIVE')
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

    const userA = await userRepository.create({
      name: "Email Racers A",
      email: normalizeEmail(`email.a.${suffix}@example.com`),
      passwordHash,
      role: "ADMIN",
    });
    const userB = await userRepository.create({
      name: "Email Racers B",
      email: normalizeEmail(`email.b.${suffix}@example.com`),
      passwordHash,
      role: "ADMIN",
    });

    await userCompanyMembershipRepository.create({
      userId: userA.id,
      companyId,
      role: "OWNER",
      status: "ACTIVE",
      isDefault: true,
    });
    await userCompanyMembershipRepository.create({
      userId: userB.id,
      companyId,
      role: "ADMIN",
      status: "ACTIVE",
      isDefault: false,
    });

    try {
      const indexCheck = await pool.request().query(`
        SELECT name
        FROM sys.indexes
        WHERE name = N'UQ_users_email'
          AND object_id = OBJECT_ID(N'dbo.users')
      `);
      assert.equal(indexCheck.recordset.length, 1, "UQ_users_email must exist");

      const [first, second] = await Promise.allSettled([
        companyUserService.update(
          companyId,
          userA.id,
          { email: contestedEmail },
          userA.id,
          false,
          "OWNER",
        ),
        companyUserService.update(
          companyId,
          userB.id,
          { email: contestedEmail },
          userB.id,
          false,
          "ADMIN",
        ),
      ]);

      const fulfilled = [first, second].filter((r) => r.status === "fulfilled");
      const rejected = [first, second].filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      assert.equal(fulfilled.length, 1);
      assert.equal(rejected.length, 1);
      assert.ok(
        rejected[0].reason instanceof AppError &&
          rejected[0].reason.code === "EMAIL_ALREADY_EXISTS",
      );

      const emails = await pool
        .request()
        .input("email", sql.NVarChar(255), contestedEmail)
        .query(`SELECT id FROM users WHERE email = @email`);
      assert.equal(emails.recordset.length, 1);
    } finally {
      await deleteCompanyCascade(companyId);
    }
  });

  it("allows self profile update and blocks self deactivation against persisted state", async () => {
    const { getPool } = await import("../database/connection");
    const { userRepository } = await import("../repositories/user.repository");
    const { userCompanyMembershipRepository } = await import(
      "../repositories/user-company-membership.repository"
    );
    const { companyUserService } = await import("./company-user.service");
    const { deleteCompanyCascade } = await import("../test-helpers/integration-cleanup");
    const sql = (await import("mssql")).default;

    const pool = getPool();
    const suffix = `${Date.now()}.${Math.random().toString(16).slice(2)}`;
    const passwordHash = await hashPassword("integration-test-password");

    const companyResult = await pool.request().query(`
      INSERT INTO companies (name, default_timezone, status)
      OUTPUT INSERTED.id
      VALUES (N'Self Profile ${suffix}', N'America/Argentina/Buenos_Aires', N'ACTIVE')
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

    const selfUser = await userRepository.create({
      name: "Self Original",
      email: normalizeEmail(`self.profile.${suffix}@example.com`),
      passwordHash,
      role: "ADMIN",
    });
    const peer = await userRepository.create({
      name: "Peer Owner",
      email: normalizeEmail(`peer.owner.${suffix}@example.com`),
      passwordHash,
      role: "ADMIN",
    });

    await userCompanyMembershipRepository.create({
      userId: selfUser.id,
      companyId,
      role: "OWNER",
      status: "ACTIVE",
      isDefault: true,
    });
    await userCompanyMembershipRepository.create({
      userId: peer.id,
      companyId,
      role: "OWNER",
      status: "ACTIVE",
      isDefault: false,
    });

    try {
      const updated = await companyUserService.update(
        companyId,
        selfUser.id,
        {
          name: "Self Renamed",
          email: normalizeEmail(`self.renamed.${suffix}@example.com`),
          phoneNumber: "+5491111222333",
        },
        selfUser.id,
        false,
        "OWNER",
      );
      assert.equal(updated.name, "Self Renamed");
      assert.equal(updated.phoneNumber, "+5491111222333");

      const row = await userRepository.findById(selfUser.id);
      assert.ok(row);
      assert.equal(row.name, "Self Renamed");
      assert.equal(row.email, normalizeEmail(`self.renamed.${suffix}@example.com`));
      assert.equal(row.phoneNumber, "+5491111222333");

      await assert.rejects(
        () =>
          companyUserService.deactivate(companyId, selfUser.id, selfUser.id, false, "OWNER"),
        (error: unknown) =>
          error instanceof AppError && error.code === "SELF_DEACTIVATION_NOT_ALLOWED",
      );

      const membership = await userCompanyMembershipRepository.findMembership(
        selfUser.id,
        companyId,
      );
      assert.ok(membership);
      assert.equal(membership.status, "ACTIVE");

      const cleared = await companyUserService.update(
        companyId,
        selfUser.id,
        { phoneNumber: null },
        selfUser.id,
        false,
        "OWNER",
      );
      assert.equal(cleared.phoneNumber, null);
      const afterClear = await userRepository.findById(selfUser.id);
      assert.equal(afterClear?.phoneNumber ?? null, null);
    } finally {
      await deleteCompanyCascade(companyId);
    }
  });
});
