import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { getPool } from "../database/connection";
import { absenceBalanceRepository } from "../repositories/absence-balance.repository";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { companyAbsenceSettingsService } from "./company-absence-settings.service";
import { employeeAbsenceBalanceBackfillService } from "./employee-absence-balance-backfill.service";
import { platformCompanyService } from "./platform-company.service";
import { getCurrentYearInTimezone } from "../utils/operational-year";

const uniqueCompanyName = (): string =>
  `Backfill Co ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const uniquePhone = (): string => `+54911${Date.now().toString().slice(-8)}`;

describeDatabaseIntegration("employee absence balance backfill integration", () => {
  let createdCompanyIds: string[] = [];
  let createdEmployeeIds: string[] = [];

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
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
        DELETE FROM employee_categories WHERE company_id = @companyId;
        DELETE FROM company_absence_settings WHERE company_id = @companyId;
        DELETE FROM absence_types WHERE company_id = @companyId;
        DELETE FROM user_company_memberships WHERE company_id = @companyId;
        DELETE FROM company_settings WHERE company_id = @companyId;
        DELETE FROM company_modules WHERE company_id = @companyId;
        DELETE FROM company_location_types WHERE company_id = @companyId;
        DELETE FROM companies WHERE id = @companyId;
      `);
    }

    await teardownDatabaseIntegration();
  });

  it("backfills missing balances idempotently without overwriting existing rows", async () => {
    const ownerEmail = `backfill-owner-${Date.now()}@integration.test`;
    const created = await platformCompanyService.createCompany({
      name: uniqueCompanyName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Backfill Owner",
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
          defaultAnnualDays: 16,
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

    const employee = await employeeRepository.create(companyId, {
      name: "Legacy Employee",
      documentNumber: null,
      phoneNumber: uniquePhone(),
      employeeType: "fijo",
      categoryId: null,
    });
    createdEmployeeIds.push(employee.id);

    const vacationType = await absenceTypeRepository.findByCode(companyId, "VACATION");
    const studyType = await absenceTypeRepository.findByCode(companyId, "STUDY_DAY");
    const sickType = await absenceTypeRepository.findByCode(companyId, "SICK_LEAVE");
    assert.ok(vacationType && studyType && sickType);

    const year = getCurrentYearInTimezone("America/Argentina/Buenos_Aires");

    await absenceBalanceRepository.upsert(companyId, {
      employeeId: employee.id,
      absenceTypeId: vacationType.id,
      year,
      totalDays: 99,
      notes: "manual override",
    });

    const firstRun = await employeeAbsenceBalanceBackfillService.backfillCompany(companyId, { year });
    assert.equal(firstRun.balancesCreated, 1);
    assert.equal(firstRun.existingBalancesSkipped, 1);

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

    assert.equal(vacationBalance?.totalDays, 99);
    assert.equal(studyBalance?.totalDays, 2.5);
    assert.equal(sickBalance, null);

    const secondRun = await employeeAbsenceBalanceBackfillService.backfillCompany(companyId, { year });
    assert.equal(secondRun.balancesCreated, 0);
    assert.equal(secondRun.existingBalancesSkipped, 2);
  });
});
