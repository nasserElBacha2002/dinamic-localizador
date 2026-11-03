import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  resolveCompanyTodayIso,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../../test-helpers/integration-test";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";
import { getPool } from "../../database/connection";
import { createPlatformCompanyFixture } from "../../test-helpers/platform-company-fixture";
import { absenceTypeRepository } from "../../repositories/absence/absence-type.repository";
import { employeeRepository } from "../../repositories/employees/employee.repository";
import { userRepository } from "../../repositories/identity/user.repository";
import { absenceBalanceRepository } from "../../repositories/absence/absence-balance.repository";
import { absenceRequestService } from "./absence-request.service";
import { absenceReviewService } from "./absence-review.service";
import { absenceBalanceService } from "./absence-balance.service";
import { addDaysToDateIso } from "../../utils/workdays/recurring-workday-instant";

const uniqueCompanyName = (): string =>
  `Balance Override ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const uniquePhone = (): string => `+54911${Date.now().toString().slice(-8)}`;

describeDatabaseIntegration("absence approve with insufficient balance", () => {
  const createdCompanyIds: string[] = [];
  let actorUserId = "";

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
    const admin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(admin?.id);
    actorUserId = admin.id;
  });

  after(async () => {
    const { deleteCompanyCascade } = await import("../../test-helpers/integration-cleanup");
    for (const companyId of createdCompanyIds) {
      await deleteCompanyCascade(companyId);
    }
    await teardownDatabaseIntegration();
  });

  it("approves with override and persists negative effective balance (non-ledger)", async () => {
    const created = await createPlatformCompanyFixture({
      name: uniqueCompanyName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Override Owner",
        email: `override-${Date.now()}@integration.test`,
      },
    });
    const companyId = created.data.company.id;
    createdCompanyIds.push(companyId);

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE company_settings SET absence_balance_ledger_enabled = 0 WHERE company_id = @companyId;
        UPDATE absence_types SET requires_approval = 1, deducts_balance = 1
        WHERE company_id = @companyId AND code = N'VACATION';
      `);

    const types = await absenceTypeRepository.listAll(companyId, true);
    const vacation = types.find((t) => t.code === "VACATION");
    assert.ok(vacation);

    const employee = await employeeRepository.create(companyId, {
      name: "Override Emp",
      phoneNumber: uniquePhone(),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
    });

    const year = Number((await resolveCompanyTodayIso(companyId)).slice(0, 4));
    await absenceBalanceRepository.upsert(companyId, {
      employeeId: employee.id,
      absenceTypeId: vacation.id,
      year,
      totalDays: 0,
    });

    const today = await resolveCompanyTodayIso(companyId);
    const startDate = addDaysToDateIso(today, 20);
    const endDate = addDaysToDateIso(today, 70);
    const createdRequest = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employee.id,
        absenceTypeId: vacation.id,
        startDate,
        endDate,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Vacaciones largas",
      },
      actorUserId,
    );
    assert.equal(createdRequest.status, "PENDING");
    assert.ok(createdRequest.totalDays >= 30);

    const beforeSummary = await absenceBalanceService.getSummaryForRequest(
      companyId,
      createdRequest,
      vacation,
    );
    assert.equal(beforeSummary.availableDays, 0);

    const approved = await absenceReviewService.approve(companyId, createdRequest.id, actorUserId, {
      allowInsufficientBalance: true,
    });
    assert.equal(approved.status, "APPROVED");

    const afterSummary = await absenceBalanceService.getSummaryForRequest(
      companyId,
      approved,
      vacation,
    );
    assert.equal(afterSummary.availableDays, -createdRequest.totalDays);

    const audit = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("entityId", sql.UniqueIdentifier, createdRequest.id)
      .query(`
        SELECT TOP 1 new_data
        FROM audit_logs
        WHERE company_id = @companyId
          AND entity_type = N'absence_request'
          AND entity_id = @entityId
          AND action = N'APPROVED'
        ORDER BY created_at DESC
      `);
    const payload = JSON.parse(String(audit.recordset[0]?.new_data ?? "{}")) as Record<
      string,
      unknown
    >;
    assert.equal(payload.balanceApprovalOverride, true);
    assert.equal(payload.balanceBefore, 0);
    assert.equal(payload.requestedDays, createdRequest.totalDays);
    assert.equal(payload.balanceAfter, -createdRequest.totalDays);
    assert.ok(payload.approvedByUserId);
    assert.ok(payload.approvedAt);
  });

  it("approves normally without override metadata when balance is sufficient", async () => {
    const created = await createPlatformCompanyFixture({
      name: uniqueCompanyName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Normal Owner",
        email: `normal-${Date.now()}@integration.test`,
      },
    });
    const companyId = created.data.company.id;
    createdCompanyIds.push(companyId);

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE company_settings SET absence_balance_ledger_enabled = 0 WHERE company_id = @companyId;
        UPDATE absence_types SET requires_approval = 1, deducts_balance = 1
        WHERE company_id = @companyId AND code = N'VACATION';
      `);

    const types = await absenceTypeRepository.listAll(companyId, true);
    const vacation = types.find((t) => t.code === "VACATION");
    assert.ok(vacation);

    const employee = await employeeRepository.create(companyId, {
      name: "Normal Emp",
      phoneNumber: uniquePhone(),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
    });

    const year = Number((await resolveCompanyTodayIso(companyId)).slice(0, 4));
    await absenceBalanceRepository.upsert(companyId, {
      employeeId: employee.id,
      absenceTypeId: vacation.id,
      year,
      totalDays: 20,
    });

    const today = await resolveCompanyTodayIso(companyId);
    const startDate = addDaysToDateIso(today, 25);
    const endDate = addDaysToDateIso(today, 26);
    const createdRequest = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employee.id,
        absenceTypeId: vacation.id,
        startDate,
        endDate,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Corto",
      },
      actorUserId,
    );

    await absenceReviewService.approve(companyId, createdRequest.id, actorUserId);

    const audit = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("entityId", sql.UniqueIdentifier, createdRequest.id)
      .query(`
        SELECT TOP 1 new_data
        FROM audit_logs
        WHERE company_id = @companyId
          AND entity_type = N'absence_request'
          AND entity_id = @entityId
          AND action = N'APPROVED'
        ORDER BY created_at DESC
      `);
    const payload = JSON.parse(String(audit.recordset[0]?.new_data ?? "{}")) as Record<
      string,
      unknown
    >;
    assert.notEqual(payload.balanceApprovalOverride, true);
  });
});
