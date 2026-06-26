import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { connectDatabase, closeDatabase, getPool } from "../database/connection";
import { absenceBalanceRepository } from "../repositories/absence-balance.repository";
import { absenceBalanceService } from "../services/absence-balance.service";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { employeeRepository } from "../repositories/employee.repository";

describe("absence balance phase 2", () => {
  before(async () => {
    await connectDatabase();
  });

  after(async () => {
    await closeDatabase();
  });

  it("lists employee balances without SQL errors", async () => {
    const employees = await employeeRepository.list({ page: 1, limit: 1, active: true });
    const employee = employees.items[0];
    if (!employee) {
      return;
    }

    const balances = await absenceBalanceService.listEmployeeBalances(employee.id, 2026);
    assert.ok(Array.isArray(balances));
    assert.ok(balances.length > 0);
  });

  it("upserts balance and returns summary", async () => {
    const employees = await employeeRepository.list({ page: 1, limit: 1, active: true });
    const vacationType = await absenceTypeRepository.findByCode("VACATION");
    const employee = employees.items[0];
    const adminResult = await getPool()
      .request()
      .query(`SELECT TOP 1 id FROM users WHERE role = 'ADMIN' AND active = 1`);

    const adminUserId = adminResult.recordset[0]?.id
      ? String(adminResult.recordset[0].id)
      : null;

    if (!employee || !vacationType || !adminUserId) {
      return;
    }

    const summary = await absenceBalanceService.upsertEmployeeBalance(
      employee.id,
      vacationType.id,
      { year: 2099, totalDays: 14, notes: "test balance" },
      adminUserId,
    );

    assert.equal(summary.year, 2099);
    assert.equal(summary.assignedDays, 14);

    const stored = await absenceBalanceRepository.findByEmployeeTypeYear(
      employee.id,
      vacationType.id,
      2099,
    );
    assert.equal(stored?.totalDays, 14);
  });

  it("identifies vacation as deducting balance type", async () => {
    const vacationType = await absenceTypeRepository.findByCode("VACATION");
    assert.ok(vacationType);
    assert.equal(vacationType.deductsBalance, true);
  });

  it("identifies sick leave as non-deducting balance type", async () => {
    const sickLeave = await absenceTypeRepository.findByCode("SICK_LEAVE");
    assert.ok(sickLeave);
    assert.equal(sickLeave.deductsBalance, false);
  });
});
