import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import { AppError } from "../errors/app-error";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { companyContextService } from "./company-context.service";
import { employeeRepository } from "../repositories/employee.repository";
import { storeRepository } from "../repositories/store.repository";
import { inventoryRepository } from "../repositories/inventory.repository";
import { attendanceRepository } from "../repositories/attendance.repository";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import { botSimulationSessionRepository } from "../repositories/bot-simulation-session.repository";
import { companyRepository } from "../repositories/company.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import { userRepository } from "../repositories/user.repository";
import { getPool } from "../database/connection";

describeDatabaseIntegration("tenant isolation hardening", () => {
  let dinamicCompanyId = "";
  let otherCompanyId = "";
  let dinamicEmployeeId = "";
  let dinamicStoreId = "";
  let dinamicInventoryId = "";
  let dinamicAttendanceId = "";
  let dinamicAbsenceRequestId = "";
  let dinamicBotSessionId = "";

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
    dinamicEmployeeId = employees.items[0].id;

    const stores = await storeRepository.list(dinamicCompanyId, { page: 1, limit: 1 });
    if (stores.items[0]) {
      dinamicStoreId = stores.items[0].id;
    }

    const inventories = await inventoryRepository.list(dinamicCompanyId, { page: 1, limit: 1 });
    if (inventories.items[0]) {
      dinamicInventoryId = inventories.items[0].id;
    }

    const attendance = await attendanceRepository.list(dinamicCompanyId, { page: 1, limit: 1 });
    if (attendance.items[0]) {
      dinamicAttendanceId = attendance.items[0].id;
    }

    const absenceRequests = await absenceRequestRepository.list(dinamicCompanyId, {
      page: 1,
      limit: 1,
    });
    if (absenceRequests.items[0]) {
      dinamicAbsenceRequestId = absenceRequests.items[0].id;
    }

    const botSessions = await pool.request().input("companyId", sql.UniqueIdentifier, dinamicCompanyId).query(`
      SELECT TOP 1 id FROM bot_simulation_sessions WHERE company_id = @companyId ORDER BY created_at DESC
    `);
    if (botSessions.recordset[0]?.id) {
      dinamicBotSessionId = String(botSessions.recordset[0].id);
    }
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("does not return Dinamic employee when queried under another company", async () => {
    const employee = await employeeRepository.findById(otherCompanyId, dinamicEmployeeId);
    assert.equal(employee, null);
  });

  it("does not update employee from another company", async () => {
    const updated = await employeeRepository.update(otherCompanyId, dinamicEmployeeId, {
      name: "Cross-tenant tamper",
    });
    assert.equal(updated, null);

    const original = await employeeRepository.findById(dinamicCompanyId, dinamicEmployeeId);
    assert.ok(original);
    assert.notEqual(original.name, "Cross-tenant tamper");
  });

  it("does not return store from another company", async () => {
    if (!dinamicStoreId) {
      return;
    }

    const store = await storeRepository.findById(otherCompanyId, dinamicStoreId);
    assert.equal(store, null);
  });

  it("does not update store from another company", async () => {
    if (!dinamicStoreId) {
      return;
    }

    const updated = await storeRepository.update(otherCompanyId, dinamicStoreId, {
      name: "Cross-tenant tamper",
    });
    assert.equal(updated, null);
  });

  it("does not return inventory from another company", async () => {
    if (!dinamicInventoryId) {
      return;
    }

    const inventory = await inventoryRepository.findById(otherCompanyId, dinamicInventoryId);
    assert.equal(inventory, null);
  });

  it("does not return attendance from another company", async () => {
    if (!dinamicAttendanceId) {
      return;
    }

    const attendance = await attendanceRepository.findById(otherCompanyId, dinamicAttendanceId);
    assert.equal(attendance, null);
  });

  it("does not return absence request from another company", async () => {
    if (!dinamicAbsenceRequestId) {
      return;
    }

    const request = await absenceRequestRepository.findDetailById(
      otherCompanyId,
      dinamicAbsenceRequestId,
    );
    assert.equal(request, null);
  });

  it("does not return bot simulation session from another company", async () => {
    if (!dinamicBotSessionId) {
      return;
    }

    const session = await botSimulationSessionRepository.findById(
      otherCompanyId,
      dinamicBotSessionId,
    );
    assert.equal(session, null);
  });

  it("returns 409 COMPANY_SELECTION_REQUIRED for platform admin with multiple companies on legacy route", async () => {
    const activeCompanies = await companyRepository.listActive();
    if (activeCompanies.length < 2) {
      return;
    }

    const platformAdmin = await userRepository.findByEmail("admin@dinamicsystems.com");
    if (!platformAdmin?.isPlatformAdmin) {
      return;
    }

    await assert.rejects(
      () => companyContextService.resolveLegacyCompanyContext(platformAdmin.id, true),
      (error: unknown) =>
        error instanceof AppError && error.code === "COMPANY_SELECTION_REQUIRED",
    );
  });

  it("returns 409 COMPANY_SELECTION_REQUIRED for multi-membership user on legacy route", async () => {
    const pool = getPool();
    const multiMembershipUser = await pool.request().query(`
      SELECT TOP 1 u.id
      FROM users u
      INNER JOIN user_company_memberships m ON m.user_id = u.id AND m.status = 'ACTIVE'
      WHERE u.is_platform_admin = 0 AND u.active = 1
      GROUP BY u.id
      HAVING COUNT(*) > 1
    `);

    const userId = multiMembershipUser.recordset[0]?.id
      ? String(multiMembershipUser.recordset[0].id)
      : null;
    if (!userId) {
      return;
    }

    await assert.rejects(
      () => companyContextService.resolveLegacyCompanyContext(userId),
      (error: unknown) =>
        error instanceof AppError && error.code === "COMPANY_SELECTION_REQUIRED",
    );
  });

  it("resolves legacy route for single-membership user", async () => {
    const pool = getPool();
    const singleMembershipUser = await pool.request().query(`
      SELECT TOP 1 u.id, m.company_id
      FROM users u
      INNER JOIN user_company_memberships m ON m.user_id = u.id AND m.status = 'ACTIVE'
      WHERE u.is_platform_admin = 0 AND u.active = 1
      GROUP BY u.id, m.company_id
      HAVING COUNT(*) = 1
    `);

    const row = singleMembershipUser.recordset[0];
    if (!row?.id || !row?.company_id) {
      return;
    }

    const context = await companyContextService.resolveLegacyCompanyContext(String(row.id));
    assert.equal(context.company.id, String(row.company_id));
  });

  it("allows company-scoped route for platform admin without membership", async () => {
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

  it("denies company-scoped route for user without membership", async () => {
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
});
