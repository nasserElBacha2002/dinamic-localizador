import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { companyContextService } from "../services/company-context.service";
import { employeeRepository } from "../repositories/employee.repository";
import { storeRepository } from "../repositories/store.repository";
import { companyRepository } from "../repositories/company.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
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

  it("resolves default company for bot in single-company deployments", async () => {
    const companyId = await companyContextService.resolveDefaultCompanyId();
    assert.equal(companyId, dinamicCompanyId);
  });

  it("does not return Dinamic employee when queried under another company", async () => {
    const employee = await employeeRepository.findById(otherCompanyId, employeeInDinamicId);
    assert.equal(employee, null);
  });

  it("scopes store lookups by company", async () => {
    const dinamicStores = await storeRepository.list(dinamicCompanyId, { page: 1, limit: 1 });
    if (!dinamicStores.items[0]) {
      return;
    }

    const foreignStore = await storeRepository.findById(otherCompanyId, dinamicStores.items[0].id);
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
});
