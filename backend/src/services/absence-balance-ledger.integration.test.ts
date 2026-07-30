import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { getPool } from "../database/connection";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { AppError } from "../errors/app-error";
import { absenceBalanceLedgerService } from "./absence-balance-ledger.service";
import { absenceRequestService } from "./absence-request.service";
import { absenceReviewService } from "./absence-review.service";

const uniqueCompanyName = (): string =>
  `Balance Ledger ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const uniquePhone = (): string => `+54911${Date.now().toString().slice(-8)}`;

describeDatabaseIntegration("absence balance ledger phase 3", () => {
  const createdCompanyIds: string[] = [];
  let actorUserId = "";

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    const { deleteCompanyCascade } = await import("../test-helpers/integration-cleanup");
    for (const companyId of createdCompanyIds) {
      await deleteCompanyCascade(companyId);
    }
    await teardownDatabaseIntegration();
  });

  const seed = async () => {
    const { userRepository } = await import("../repositories/user.repository");
    const admin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(admin);
    actorUserId = admin.id;
    const created = await createPlatformCompanyFixture({
      name: uniqueCompanyName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Ledger Owner",
        email: `ledger-owner-${Date.now()}@integration.test`,
      },
    });
    const companyId = created.data.company.id;
    createdCompanyIds.push(companyId);
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE company_settings SET absence_balance_ledger_enabled = 1 WHERE company_id = @companyId
      `);
    return companyId;
  };

  it("reserves on create and consumes on approve", async () => {
    const companyId = await seed();
    const types = await absenceTypeRepository.listAll(companyId, true);
    const vacation = types.find((type) => type.code === "VACATION");
    assert.ok(vacation);

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("typeId", sql.UniqueIdentifier, vacation.id)
      .query(`
        UPDATE absence_types SET requires_approval = 1 WHERE company_id = @companyId AND id = @typeId
      `);

    const employee = await employeeRepository.create(companyId, {
      name: "Ledger Emp",
      phoneNumber: uniquePhone(),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
    });

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employee.id)
      .input("typeId", sql.UniqueIdentifier, vacation.id)
      .query(`
        MERGE employee_absence_balances AS t
        USING (SELECT @companyId AS company_id, @employeeId AS employee_id, @typeId AS absence_type_id, 2026 AS year) AS s
        ON t.company_id = s.company_id AND t.employee_id = s.employee_id AND t.absence_type_id = s.absence_type_id AND t.year = s.year
        WHEN MATCHED THEN UPDATE SET
          total_days = 10, granted_days = 10, reserved_days = 0, consumed_days = 0, available_days = 10, version = 1
        WHEN NOT MATCHED THEN INSERT (
          company_id, employee_id, absence_type_id, year, total_days, notes,
          granted_days, reserved_days, consumed_days, available_days, version
        ) VALUES (@companyId, @employeeId, @typeId, 2026, 10, NULL, 10, 0, 0, 10, 1);
      `);

    const created = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employee.id,
        absenceTypeId: vacation.id,
        startDate: "2026-08-03",
        endDate: "2026-08-05",
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Ledger reserve test",
      },
      actorUserId,
    );
    assert.equal(created.status, "PENDING");

    const reserved = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employee.id)
      .input("typeId", sql.UniqueIdentifier, vacation.id)
      .query(`
        SELECT reserved_days, available_days, consumed_days
        FROM employee_absence_balances
        WHERE company_id = @companyId AND employee_id = @employeeId AND absence_type_id = @typeId AND year = 2026
      `);
    assert.equal(Number(reserved.recordset[0].reserved_days), created.totalDays);
    assert.equal(Number(reserved.recordset[0].available_days), 10 - created.totalDays);

    await absenceReviewService.approve(companyId, created.id, actorUserId);

    const after = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employee.id)
      .input("typeId", sql.UniqueIdentifier, vacation.id)
      .query(`
        SELECT reserved_days, available_days, consumed_days
        FROM employee_absence_balances
        WHERE company_id = @companyId AND employee_id = @employeeId AND absence_type_id = @typeId AND year = 2026
      `);
    assert.equal(Number(after.recordset[0].reserved_days), 0);
    assert.equal(Number(after.recordset[0].consumed_days), created.totalDays);
    assert.equal(Number(after.recordset[0].available_days), 10 - created.totalDays);

    // Idempotent re-approve path should not double-consume via ledger key.
    const movements = await absenceBalanceLedgerService.listMovements(
      companyId,
      employee.id,
      vacation.id,
      { year: 2026, page: 1, limit: 50 },
    );
    const consumes = movements.data.filter((row) => row.movementType === "CONSUME");
    assert.equal(consumes.length, 1);
  });

  it("rejects concurrent insufficient reserve", async () => {
    const companyId = await seed();
    const types = await absenceTypeRepository.listAll(companyId, true);
    const vacation = types.find((type) => type.code === "VACATION");
    assert.ok(vacation);
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("typeId", sql.UniqueIdentifier, vacation.id)
      .query(`
        UPDATE absence_types SET requires_approval = 1 WHERE company_id = @companyId AND id = @typeId
      `);

    const employee = await employeeRepository.create(companyId, {
      name: "Tight Balance",
      phoneNumber: uniquePhone(),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
    });

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employee.id)
      .input("typeId", sql.UniqueIdentifier, vacation.id)
      .query(`
        MERGE employee_absence_balances AS t
        USING (SELECT @companyId AS company_id, @employeeId AS employee_id, @typeId AS absence_type_id, 2026 AS year) AS s
        ON t.company_id = s.company_id AND t.employee_id = s.employee_id AND t.absence_type_id = s.absence_type_id AND t.year = s.year
        WHEN MATCHED THEN UPDATE SET
          total_days = 2, granted_days = 2, reserved_days = 0, consumed_days = 0, available_days = 2, version = 1
        WHEN NOT MATCHED THEN INSERT (
          company_id, employee_id, absence_type_id, year, total_days, notes,
          granted_days, reserved_days, consumed_days, available_days, version
        ) VALUES (@companyId, @employeeId, @typeId, 2026, 2, NULL, 2, 0, 0, 2, 1);
      `);

    await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employee.id,
        absenceTypeId: vacation.id,
        startDate: "2026-09-01",
        endDate: "2026-09-02",
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "First claim",
      },
      actorUserId,
    );

    await assert.rejects(
      () =>
        absenceRequestService.createFromAdmin(
          companyId,
          {
            employeeId: employee.id,
            absenceTypeId: vacation.id,
            startDate: "2026-09-08",
            endDate: "2026-09-09",
            startPeriod: "FULL_DAY",
            endPeriod: "FULL_DAY",
            reason: "Second claim over budget",
          },
          actorUserId,
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "INSUFFICIENT_ABSENCE_BALANCE",
    );
  });

  it("adjusts reservation when NEEDS_INFO edit reduces days", async () => {
    const companyId = await seed();
    const types = await absenceTypeRepository.listAll(companyId, true);
    const vacation = types.find((type) => type.code === "VACATION");
    assert.ok(vacation);
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("typeId", sql.UniqueIdentifier, vacation.id)
      .query(`
        UPDATE absence_types SET requires_approval = 1 WHERE company_id = @companyId AND id = @typeId
      `);

    const employee = await employeeRepository.create(companyId, {
      name: "Needs Info Edit",
      phoneNumber: uniquePhone(),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
    });

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employee.id)
      .input("typeId", sql.UniqueIdentifier, vacation.id)
      .query(`
        MERGE employee_absence_balances AS t
        USING (SELECT @companyId AS company_id, @employeeId AS employee_id, @typeId AS absence_type_id, 2026 AS year) AS s
        ON t.company_id = s.company_id AND t.employee_id = s.employee_id AND t.absence_type_id = s.absence_type_id AND t.year = s.year
        WHEN MATCHED THEN UPDATE SET
          total_days = 10, granted_days = 10, reserved_days = 0, consumed_days = 0, available_days = 10, version = 1
        WHEN NOT MATCHED THEN INSERT (
          company_id, employee_id, absence_type_id, year, total_days, notes,
          granted_days, reserved_days, consumed_days, available_days, version
        ) VALUES (@companyId, @employeeId, @typeId, 2026, 10, NULL, 10, 0, 0, 10, 1);
      `);

    const created = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employee.id,
        absenceTypeId: vacation.id,
        startDate: "2026-10-05",
        endDate: "2026-10-07",
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Three days pending",
      },
      actorUserId,
    );
    assert.equal(created.status, "PENDING");

    await absenceReviewService.needsInfo(companyId, created.id, actorUserId, {
      comment: "Ajustá fechas",
    });

    const before = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employee.id)
      .input("typeId", sql.UniqueIdentifier, vacation.id)
      .query(`
        SELECT reserved_days, available_days
        FROM employee_absence_balances
        WHERE company_id = @companyId AND employee_id = @employeeId AND absence_type_id = @typeId AND year = 2026
      `);
    assert.equal(Number(before.recordset[0].reserved_days), created.totalDays);

    await absenceRequestService.updateNeedsInfo(
      companyId,
      created.id,
      {
        startDate: "2026-10-05",
        endDate: "2026-10-05",
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Only one day",
      },
      actorUserId,
    );

    const after = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employee.id)
      .input("typeId", sql.UniqueIdentifier, vacation.id)
      .query(`
        SELECT reserved_days, available_days
        FROM employee_absence_balances
        WHERE company_id = @companyId AND employee_id = @employeeId AND absence_type_id = @typeId AND year = 2026
      `);
    assert.equal(Number(after.recordset[0].reserved_days), 1);
    assert.equal(Number(after.recordset[0].available_days), 9);
  });
});
