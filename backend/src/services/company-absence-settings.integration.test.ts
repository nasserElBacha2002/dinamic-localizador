import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
  requireDinamicCompanyId,
} from "../test-helpers/integration-test";
import { apiRequest, signTestToken, startTestServer } from "../test-helpers/http-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { getPool } from "../database/connection";
import { STANDARD_ABSENCE_TYPE_CODES } from "../constants/company-absence";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { companyAbsenceSettingsRepository } from "../repositories/company-absence-settings.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import { userRepository } from "../repositories/user.repository";
import { companyAbsenceSettingsService } from "./company-absence-settings.service";
import { platformCompanyService } from "./platform-company.service";
import { hashPassword } from "../utils/password";
import { getCurrentYearInTimezone } from "../utils/operational-year";

const TEST_OWNER_EMAIL = "integration-absence-settings-owner@test.local";

const uniqueCompanyName = (): string =>
  `Absence Settings Co ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const uniquePhone = (): string => `+54911${Date.now().toString().slice(-8)}`;

describeDatabaseIntegration("company absence settings integration", () => {
  let baseUrl = "";
  let closeServer: (() => Promise<void>) | null = null;
  let dinamicCompanyId = "";
  let ownerUserId = "";
  let ownerUserEmail = "";
  let createdCompanyIds: string[] = [];
  let createdEmployeeIds: string[] = [];
  let createdUserIds: string[] = [];

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();

    const { app } = await import("../app");
    const server = await startTestServer(app);
    baseUrl = server.baseUrl;
    closeServer = server.close;

    dinamicCompanyId = await requireDinamicCompanyId();

    const passwordHash = await hashPassword("integration-test-password");
    let owner = await userRepository.findByEmail(TEST_OWNER_EMAIL);
    if (!owner) {
      owner = await userRepository.create({
        name: "Absence Settings Owner",
        email: TEST_OWNER_EMAIL,
        passwordHash,
        role: "ADMIN",
      });
      createdUserIds.push(owner.id);
    }

    const membership = await userCompanyMembershipRepository.findMembership(owner.id, dinamicCompanyId);
    if (!membership) {
      await userCompanyMembershipRepository.create({
        userId: owner.id,
        companyId: dinamicCompanyId,
        role: "OWNER",
        status: "ACTIVE",
      });
    }

    ownerUserId = owner.id;
    ownerUserEmail = owner.email;
  });

  after(async () => {
    const pool = getPool();

    for (const employeeId of createdEmployeeIds) {
      await pool.request().input("employeeId", sql.UniqueIdentifier, employeeId).query(`
        DELETE FROM employee_absence_balances WHERE employee_id = @employeeId;
        DELETE FROM employees WHERE id = @employeeId;
      `);
    }

    for (const companyId of createdCompanyIds) {
      await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
        DELETE FROM employee_absence_balances WHERE company_id = @companyId;
        DELETE FROM employees WHERE company_id = @companyId;
        DELETE FROM company_absence_settings WHERE company_id = @companyId;
        DELETE FROM absence_types WHERE company_id = @companyId;
        DELETE FROM company_location_types WHERE company_id = @companyId;
        DELETE FROM user_company_memberships WHERE company_id = @companyId;
        DELETE FROM company_modules WHERE company_id = @companyId;
        DELETE FROM company_settings WHERE company_id = @companyId;
        DELETE FROM companies WHERE id = @companyId;
      `);
    }

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

  it("seeds standard absence types when creating a platform company", async () => {
    const companyName = uniqueCompanyName();
    const ownerEmail = `absence-owner-${Date.now()}@integration.test`;

    const result = await platformCompanyService.createCompany({
      name: companyName,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Absence Owner",
        email: ownerEmail,
        temporaryPassword: "password123",
      },
    });

    createdCompanyIds.push(result.data.company.id);

    const codes = await absenceTypeRepository.listCodesForCompany(result.data.company.id);
    for (const code of STANDARD_ABSENCE_TYPE_CODES) {
      assert.ok(codes.includes(code), `missing absence type ${code}`);
    }

    const settings = await companyAbsenceSettingsRepository.listByCompanyId(result.data.company.id);
    assert.ok(settings.length >= STANDARD_ABSENCE_TYPE_CODES.length);
  });

  it("ensureAbsenceCatalogForCompany is idempotent", async () => {
    const companyName = uniqueCompanyName();
    const ownerEmail = `absence-idempotent-${Date.now()}@integration.test`;

    const result = await platformCompanyService.createCompany({
      name: companyName,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Idempotent Owner",
        email: ownerEmail,
        temporaryPassword: "password123",
      },
    });

    createdCompanyIds.push(result.data.company.id);
    const companyId = result.data.company.id;

    const beforeTypes = await absenceTypeRepository.listCodesForCompany(companyId);
    const beforeSettings = await companyAbsenceSettingsRepository.listByCompanyId(companyId);

    await companyAbsenceSettingsService.ensureAbsenceCatalogForCompany(companyId);
    await companyAbsenceSettingsService.ensureAbsenceCatalogForCompany(companyId);

    const afterTypes = await absenceTypeRepository.listCodesForCompany(companyId);
    const afterSettings = await companyAbsenceSettingsRepository.listByCompanyId(companyId);

    assert.deepEqual(afterTypes.sort(), beforeTypes.sort());
    assert.equal(afterSettings.length, beforeSettings.length);
  });

  it("allows OWNER to read and update absence settings via API", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });

    const getResponse = await apiRequest(
      baseUrl,
      `/api/companies/${dinamicCompanyId}/settings/absences`,
      { token },
    );
    assert.equal(getResponse.status, 200);
    const rows = getResponse.body.data as Array<{
      absenceTypeCode: string;
      defaultAnnualDays: number;
      autoAssignOnEmployeeCreate: boolean;
    }>;
    assert.ok(rows.some((row) => row.absenceTypeCode === "VACATION"));

    const patchResponse = await apiRequest(
      baseUrl,
      `/api/companies/${dinamicCompanyId}/settings/absences`,
      {
        method: "PATCH",
        token,
        body: {
          settings: [
            {
              absenceTypeCode: "VACATION",
              defaultAnnualDays: 16,
              autoAssignOnEmployeeCreate: true,
            },
            {
              absenceTypeCode: "STUDY_DAY",
              defaultAnnualDays: 3,
              autoAssignOnEmployeeCreate: false,
            },
          ],
        },
      },
    );
    assert.equal(patchResponse.status, 200);
    const updated = patchResponse.body.data as Array<{
      absenceTypeCode: string;
      defaultAnnualDays: number;
      autoAssignOnEmployeeCreate: boolean;
    }>;
    const vacation = updated.find((row) => row.absenceTypeCode === "VACATION");
    const studyDay = updated.find((row) => row.absenceTypeCode === "STUDY_DAY");
    assert.equal(vacation?.defaultAnnualDays, 16);
    assert.equal(studyDay?.autoAssignOnEmployeeCreate, false);
  });

  it("rejects unknown absence type code on PATCH", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });

    const response = await apiRequest(
      baseUrl,
      `/api/companies/${dinamicCompanyId}/settings/absences`,
      {
        method: "PATCH",
        token,
        body: {
          settings: [
            {
              absenceTypeCode: "NOT_A_REAL_TYPE",
              defaultAnnualDays: 1,
              autoAssignOnEmployeeCreate: false,
            },
          ],
        },
      },
    );
    assert.equal(response.status, 400);
    assert.equal((response.body.error as { code?: string })?.code, "UNKNOWN_ABSENCE_TYPE");
  });

  it("rejects negative default annual days on PATCH", async () => {
    const token = signTestToken({
      userId: ownerUserId,
      email: ownerUserEmail,
      role: "ADMIN",
    });

    const response = await apiRequest(
      baseUrl,
      `/api/companies/${dinamicCompanyId}/settings/absences`,
      {
        method: "PATCH",
        token,
        body: {
          settings: [
            {
              absenceTypeCode: "VACATION",
              defaultAnnualDays: -5,
              autoAssignOnEmployeeCreate: true,
            },
          ],
        },
      },
    );
    assert.equal(response.status, 400);
  });

  it("creates employee absence balances from company settings", async () => {
    const companyName = uniqueCompanyName();
    const ownerEmail = `absence-employee-${Date.now()}@integration.test`;

    const created = await platformCompanyService.createCompany({
      name: companyName,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Employee Balance Owner",
        email: ownerEmail,
        temporaryPassword: "password123",
      },
    });

    const companyId = created.data.company.id;
    createdCompanyIds.push(companyId);

    await companyAbsenceSettingsService.updateCompanyAbsenceSettings(companyId, "OWNER", {
      settings: [
        {
          absenceTypeCode: "VACATION",
          defaultAnnualDays: 18,
          autoAssignOnEmployeeCreate: true,
        },
        {
          absenceTypeCode: "STUDY_DAY",
          defaultAnnualDays: 2.5,
          autoAssignOnEmployeeCreate: true,
        },
        {
          absenceTypeCode: "SICK_LEAVE",
          defaultAnnualDays: 5,
          autoAssignOnEmployeeCreate: false,
        },
      ],
    });

    const { employeeService } = await import("./employee.service");
    const employee = await employeeService.create(companyId, {
      name: "Balance Test Employee",
      phoneNumber: uniquePhone(),
      employeeType: "FIELD",
    });
    createdEmployeeIds.push(employee.id);

    const { absenceBalanceRepository } = await import("../repositories/absence-balance.repository");
    const vacationType = await absenceTypeRepository.findByCode(companyId, "VACATION");
    const studyType = await absenceTypeRepository.findByCode(companyId, "STUDY_DAY");
    const sickType = await absenceTypeRepository.findByCode(companyId, "SICK_LEAVE");
    assert.ok(vacationType && studyType && sickType);

    const year = getCurrentYearInTimezone("America/Argentina/Buenos_Aires");
    const vacationBalance = await absenceBalanceRepository.findByEmployeeTypeYear(
      companyId,
      employee.id,
      vacationType.id,
      year,
    );
    const studyBalance = await absenceBalanceRepository.findByEmployeeTypeYear(
      companyId,
      employee.id,
      studyType.id,
      year,
    );
    const sickBalance = await absenceBalanceRepository.findByEmployeeTypeYear(
      companyId,
      employee.id,
      sickType.id,
      year,
    );

    assert.ok(vacationBalance);
    assert.equal(vacationBalance.totalDays, 18);
    assert.ok(studyBalance);
    assert.equal(studyBalance.totalDays, 2.5);
    assert.equal(sickBalance, null);

    await absenceBalanceRepository.upsert(companyId, {
      employeeId: employee.id,
      absenceTypeId: vacationType.id,
      year,
      totalDays: 99,
      notes: "manual override",
    });

    const secondEmployee = await employeeService.create(companyId, {
      name: "Balance Test Employee 2",
      phoneNumber: uniquePhone(),
      employeeType: "FIELD",
    });
    createdEmployeeIds.push(secondEmployee.id);

    const firstEmployeeVacationAfter = await absenceBalanceRepository.findByEmployeeTypeYear(
      companyId,
      employee.id,
      vacationType.id,
      year,
    );
    assert.equal(firstEmployeeVacationAfter?.totalDays, 99);
  });
});
