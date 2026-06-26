import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { AppError } from "../errors/app-error";
import { computeBalanceCounters } from "../utils/absence-balance.utils";

const TEST_YEAR = 2098;

describe("absence balance phase 2 stabilization (unit)", () => {
  it("calculates balance counters for assigned 14, approved 5, pending 2", () => {
    assert.deepEqual(
      computeBalanceCounters({ assignedDays: 14, approvedDays: 5, pendingDays: 2 }),
      { availableDays: 9, projectedAvailableDays: 7 },
    );
  });
});

describeDatabaseIntegration("absence balance phase 2 stabilization (database)", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  const requireActiveEmployee = async () => {
    const { employeeRepository } = await import("../repositories/employee.repository");
    const employees = await employeeRepository.list({ page: 1, limit: 1, active: true });
    const employee = employees.items[0];
    if (!employee) {
      assert.fail("Test requires at least one active employee fixture");
    }
    return employee;
  };

  const requireAdminUserId = async () => {
    const { getPool } = await import("../database/connection");
    const adminResult = await getPool()
      .request()
      .query(`SELECT TOP 1 id FROM users WHERE role = 'ADMIN' AND active = 1`);

    const adminUserId = adminResult.recordset[0]?.id
      ? String(adminResult.recordset[0].id)
      : null;

    if (!adminUserId) {
      assert.fail("Test requires at least one active ADMIN user fixture");
    }

    return adminUserId;
  };

  const requireVacationType = async () => {
    const { absenceTypeRepository } = await import("../repositories/absence-type.repository");
    const vacationType = await absenceTypeRepository.findByCode("VACATION");
    if (!vacationType) {
      assert.fail("Test requires VACATION absence type fixture");
    }
    return vacationType;
  };

  const requireSickLeaveType = async () => {
    const { absenceTypeRepository } = await import("../repositories/absence-type.repository");
    const sickLeave = await absenceTypeRepository.findByCode("SICK_LEAVE");
    if (!sickLeave) {
      assert.fail("Test requires SICK_LEAVE absence type fixture");
    }
    return sickLeave;
  };

  it("lists employee balances for active employee", async () => {
    const { absenceBalanceService } = await import("./absence-balance.service");
    const employee = await requireActiveEmployee();
    const balances = await absenceBalanceService.listEmployeeBalances(employee.id, TEST_YEAR);
    assert.ok(Array.isArray(balances));
    assert.ok(balances.length > 0);
    assert.ok(Object.prototype.hasOwnProperty.call(balances[0], "notes"));
  });

  it("upserts balance and updates the same employee/type/year row", async () => {
    const { absenceBalanceService } = await import("./absence-balance.service");
    const { absenceBalanceRepository } = await import("../repositories/absence-balance.repository");
    const employee = await requireActiveEmployee();
    const vacationType = await requireVacationType();
    const adminUserId = await requireAdminUserId();

    const created = await absenceBalanceService.upsertEmployeeBalance(
      employee.id,
      vacationType.id,
      { year: TEST_YEAR, totalDays: 10, notes: "initial notes" },
      adminUserId,
    );
    assert.equal(created.assignedDays, 10);
    assert.equal(created.notes, "initial notes");

    const updated = await absenceBalanceService.upsertEmployeeBalance(
      employee.id,
      vacationType.id,
      { year: TEST_YEAR, totalDays: 14, notes: "updated notes" },
      adminUserId,
    );
    assert.equal(updated.assignedDays, 14);
    assert.equal(updated.notes, "updated notes");

    const stored = await absenceBalanceRepository.findByEmployeeTypeYear(
      employee.id,
      vacationType.id,
      TEST_YEAR,
    );
    assert.equal(stored?.totalDays, 14);
    assert.equal(stored?.notes, "updated notes");
  });

  it("blocks approval when balance is insufficient inside a transaction", async () => {
    const { absenceBalanceService } = await import("./absence-balance.service");
    const { getPool } = await import("../database/connection");
    const employee = await requireActiveEmployee();
    const vacationType = await requireVacationType();
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await assert.rejects(
        () =>
          absenceBalanceService.ensureSufficientBalanceForApproval(
            {
              employeeId: employee.id,
              absenceTypeId: vacationType.id,
              startDate: `${TEST_YEAR}-06-01`,
              totalDays: 999,
              status: "PENDING",
            },
            transaction,
          ),
        (error: unknown) => {
          assert.ok(error instanceof AppError);
          assert.equal(error.code, "INSUFFICIENT_ABSENCE_BALANCE");
          return true;
        },
      );
      await transaction.rollback();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  });

  it("allows approval when sufficient vacation balance exists", async () => {
    const { absenceBalanceService } = await import("./absence-balance.service");
    const { getPool } = await import("../database/connection");
    const employee = await requireActiveEmployee();
    const vacationType = await requireVacationType();
    const adminUserId = await requireAdminUserId();

    await absenceBalanceService.upsertEmployeeBalance(
      employee.id,
      vacationType.id,
      { year: TEST_YEAR, totalDays: 20, notes: null },
      adminUserId,
    );

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await absenceBalanceService.ensureSufficientBalanceForApproval(
        {
          employeeId: employee.id,
          absenceTypeId: vacationType.id,
          startDate: `${TEST_YEAR}-06-01`,
          totalDays: 3,
          status: "PENDING",
        },
        transaction,
      );
      await transaction.rollback();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  });

  it("does not block approval for non-deducting absence types", async () => {
    const { absenceBalanceService } = await import("./absence-balance.service");
    const { getPool } = await import("../database/connection");
    const employee = await requireActiveEmployee();
    const sickLeave = await requireSickLeaveType();
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await absenceBalanceService.ensureSufficientBalanceForApproval(
        {
          employeeId: employee.id,
          absenceTypeId: sickLeave.id,
          startDate: `${TEST_YEAR}-06-01`,
          totalDays: 999,
          status: "PENDING",
        },
        transaction,
      );
      await transaction.rollback();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  });

  it("builds balanceImpact for deducting and non-deducting absence types", async () => {
    const { absenceBalanceService } = await import("./absence-balance.service");
    const employee = await requireActiveEmployee();
    const vacationType = await requireVacationType();
    const sickLeave = await requireSickLeaveType();

    const deductingImpact = await absenceBalanceService.getSummaryForRequest(
      {
        employeeId: employee.id,
        absenceTypeId: vacationType.id,
        startDate: `${TEST_YEAR}-06-01`,
        totalDays: 3,
        status: "PENDING",
      },
      vacationType,
    );
    assert.equal(deductingImpact.deductsBalance, true);
    assert.equal(typeof deductingImpact.hasSufficientBalance, "boolean");
    assert.equal(deductingImpact.requestDays, 3);

    const nonDeductingImpact = await absenceBalanceService.getSummaryForRequest(
      {
        employeeId: employee.id,
        absenceTypeId: sickLeave.id,
        startDate: `${TEST_YEAR}-06-01`,
        totalDays: 3,
        status: "PENDING",
      },
      sickLeave,
    );
    assert.equal(nonDeductingImpact.deductsBalance, false);
    assert.match(nonDeductingImpact.message ?? "", /no descuenta saldo/i);
  });

  it("identifies vacation as deducting balance type", async () => {
    const vacationType = await requireVacationType();
    assert.equal(vacationType.deductsBalance, true);
  });

  it("identifies sick leave as non-deducting balance type", async () => {
    const sickLeave = await requireSickLeaveType();
    assert.equal(sickLeave.deductsBalance, false);
  });
});
