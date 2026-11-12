/**
 * Encargado operativo — activation, revocation, transactional integrity.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { AppError } from "../../errors/app-error";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../../test-helpers/integration-test";
import { createIntegrationFixtureTracker } from "../../test-helpers/integration-cleanup";
import { createPlatformCompanyFixture } from "../../test-helpers/platform-company-fixture";
import { getPool } from "../../database/connection";
import { hashPassword } from "../../utils/password";
import { userRepository } from "../../repositories/identity/user.repository";
import { userCompanyMembershipRepository } from "../../repositories/companies/user-company-membership.repository";
import { employeeOperationalAccessService } from "./employee-operational-access.service";
import { employeeCategoryRepository } from "../../repositories/employees/employee-category.repository";
import { OPERATIONAL_CHARGE_HOLDER_CATEGORY_NORMALIZED_NAME } from "../../constants/operational-charge-holder";

const uniquePhone = (suffix: number): string =>
  `+54911${Date.now().toString().slice(-7)}${suffix}`;

const uniqueCompanyName = (): string =>
  `OM Access ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describeDatabaseIntegration("employee operational access integration", () => {
  const fixtures = createIntegrationFixtureTracker();
  const createdUserIds: string[] = [];

  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    const pool = getPool();
    for (const userId of createdUserIds) {
      await pool.request().input("userId", sql.UniqueIdentifier, userId).query(`
        DELETE FROM company_user_employee_links WHERE user_id = @userId;
        DELETE FROM user_company_memberships WHERE user_id = @userId;
        DELETE FROM users WHERE id = @userId;
      `);
    }
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  const resolvePlatformActorUserId = async (): Promise<string> => {
    const admin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(admin?.isPlatformAdmin);
    return admin.id;
  };

  const createEmployee = async (companyId: string, label: string): Promise<string> => {
    const pool = getPool();
    const employeeInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(20), uniquePhone(Math.floor(Math.random() * 9)))
      .input("name", sql.NVarChar(200), label)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, 'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const employeeId = String(employeeInsert.recordset[0].id);
    fixtures.trackEmployee(companyId, employeeId);
    return employeeId;
  };

  const setEmployeeAsEncargado = async (companyId: string, employeeId: string): Promise<void> => {
    const category = await employeeCategoryRepository.findByNormalizedName(
      companyId,
      OPERATIONAL_CHARGE_HOLDER_CATEGORY_NORMALIZED_NAME,
    );
    assert.ok(category?.id);
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("categoryId", sql.UniqueIdentifier, category.id)
      .query(`
        UPDATE employees
        SET category_id = @categoryId, updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId AND id = @employeeId
      `);
  };

  it("links dedicated user and revokes access atomically", async () => {
    const fixture = await createPlatformCompanyFixture({
      name: uniqueCompanyName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Link Owner",
        email: `link-owner-${Date.now()}@test.local`,
      },
    });
    const companyId = fixture.data.company.id;
    fixtures.trackCompany(companyId);
    const actorUserId = await resolvePlatformActorUserId();

    const employeeId = await createEmployee(companyId, "Encargado OM");
    await setEmployeeAsEncargado(companyId, employeeId);

    const passwordHash = await hashPassword("test-password");
    const targetUser = await userRepository.create({
      name: "Target OM",
      email: `target-om-${Date.now()}@test.local`,
      passwordHash,
      role: "ADMIN",
    });
    createdUserIds.push(targetUser.id);

    await employeeOperationalAccessService.linkExistingUser(
      companyId,
      actorUserId,
      employeeId,
      targetUser.id,
      undefined,
      true,
    );

    const status = await employeeOperationalAccessService.getStatus(companyId, employeeId);
    assert.ok(status.link);
    assert.equal(status.link?.userId, targetUser.id);

    await employeeOperationalAccessService.revokeAccess(companyId, actorUserId, employeeId);
    const afterRevoke = await employeeOperationalAccessService.getStatus(companyId, employeeId);
    assert.equal(afterRevoke.link, null);

    const membership = await userCompanyMembershipRepository.findMembership(targetUser.id, companyId);
    assert.equal(membership?.status, "INACTIVE");
  });

  it("rejects implicit role transition from active ADMIN membership", async () => {
    const fixture = await createPlatformCompanyFixture({
      name: uniqueCompanyName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Admin Owner",
        email: `admin-owner-${Date.now()}@test.local`,
      },
    });
    const companyId = fixture.data.company.id;
    fixtures.trackCompany(companyId);
    const actorUserId = await resolvePlatformActorUserId();

    const employeeId = await createEmployee(companyId, "Encargado Admin Block");
    await setEmployeeAsEncargado(companyId, employeeId);

    const passwordHash = await hashPassword("test-password");
    const adminUser = await userRepository.create({
      name: "Active Admin",
      email: `active-admin-${Date.now()}@test.local`,
      passwordHash,
      role: "ADMIN",
    });
    createdUserIds.push(adminUser.id);

    await userCompanyMembershipRepository.create({
      userId: adminUser.id,
      companyId,
      role: "ADMIN",
      status: "ACTIVE",
    });

    await assert.rejects(
      () =>
        employeeOperationalAccessService.linkExistingUser(
          companyId,
          actorUserId,
          employeeId,
          adminUser.id,
          undefined,
          true,
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "OPERATIONAL_MANAGER_DEDICATED_MEMBERSHIP_REQUIRED",
    );
  });
});
