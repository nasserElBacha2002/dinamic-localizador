import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import { AppError } from "../errors/app-error";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { companyContextService } from "../services/company-context.service";
import { companyService } from "../services/company.service";
import { employeeRepository } from "../repositories/employee.repository";
import { serviceRepository } from "../repositories/service.repository";
import { companyRepository } from "../repositories/company.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import { userRepository } from "../repositories/user.repository";
import { getPool } from "../database/connection";

describeDatabaseIntegration("multi-company foundation isolation", () => {
  let dinamicCompanyId = "";
  let otherCompanyId = "";
  let employeeInDinamicId = "";

  before(async () => {
    await setupDatabaseIntegration();

    const dinamic = await companyRepository.findByName("Dinamic Systems");
    assert.ok(dinamic, "Dinamic Systems company must exist after migration 015");
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
        VALUES (N'Isolation Test Co', N'America/Argentina/Buenos_Aires', N'ACTIVE')
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

    const employees = await employeeRepository.list(dinamicCompanyId, { page: 1, limit: 1, active: true });
    assert.ok(employees.items[0], "requires at least one employee in Dinamic Systems");
    employeeInDinamicId = employees.items[0].id;
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("requires explicit default when multiple active companies exist", async () => {
    await assert.rejects(
      () => companyContextService.resolveDefaultCompanyId(),
      (error: unknown) =>
        error instanceof AppError && error.code === "BOT_COMPANY_SELECTION_REQUIRED",
    );
  });

  it("does not return Dinamic employee when queried under another company", async () => {
    const employee = await employeeRepository.findById(otherCompanyId, employeeInDinamicId);
    assert.equal(employee, null);
  });

  it("scopes store lookups by company", async () => {
    const dinamicStores = await serviceRepository.list(dinamicCompanyId, { page: 1, limit: 1 });
    if (!dinamicStores.items[0]) {
      return;
    }

    const foreignStore = await serviceRepository.findById(otherCompanyId, dinamicStores.items[0].id);
    assert.equal(foreignStore, null);
  });

  it("seeds admin memberships for Dinamic Systems", async () => {
    const adminResult = await getPool().request().query(`
      SELECT TOP 1 u.id AS user_id
      FROM users u
      WHERE u.role = 'ADMIN' AND u.active = 1
    `);

    const adminUserId = adminResult.recordset[0]?.user_id
      ? String(adminResult.recordset[0].user_id)
      : null;
    assert.ok(adminUserId, "requires active admin user");

    const membership = await userCompanyMembershipRepository.findActiveMembership(
      adminUserId,
      dinamicCompanyId,
    );
    assert.ok(membership);
    assert.equal(membership.companyId, dinamicCompanyId);
  });

  it("allows platform admin to access any active company without membership", async () => {
    const platformAdmin = await userRepository.findByEmail("admin@dinamicsystems.com");
    if (!platformAdmin?.isPlatformAdmin) {
      return;
    }

    const context = await companyContextService.resolveCompanyContext(
      platformAdmin.id,
      otherCompanyId,
      { isPlatformAdmin: true },
    );
    assert.equal(context.company.id, otherCompanyId);
    assert.equal(context.membership.role, "OWNER");
  });

  it("denies non-platform user access to company without membership", async () => {
    const pool = getPool();
    const regularUserResult = await pool.request().query(`
      SELECT TOP 1 u.id
      FROM users u
      WHERE u.is_platform_admin = 0 AND u.active = 1
    `);

    const regularUserId = regularUserResult.recordset[0]?.id
      ? String(regularUserResult.recordset[0].id)
      : null;
    if (!regularUserId) {
      return;
    }

    const hasOtherMembership = await userCompanyMembershipRepository.findActiveMembership(
      regularUserId,
      otherCompanyId,
    );
    if (hasOtherMembership) {
      return;
    }

    await assert.rejects(
      () => companyContextService.resolveCompanyContext(regularUserId, otherCompanyId),
      (error: unknown) =>
        error instanceof AppError && error.code === "COMPANY_ACCESS_DENIED",
    );
  });

  it("lists all active companies for platform admin", async () => {
    const platformAdmin = await userRepository.findByEmail("admin@dinamicsystems.com");
    if (!platformAdmin?.isPlatformAdmin) {
      return;
    }

    const companies = await companyService.listForUser(platformAdmin.id, true);
    const activeCompanies = await companyRepository.listActive();
    assert.equal(companies.length, activeCompanies.length);
    assert.ok(companies.every((company) => company.role === "OWNER"));
  });
});
