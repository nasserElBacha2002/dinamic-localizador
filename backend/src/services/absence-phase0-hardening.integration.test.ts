import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  resolveCompanyTodayIso,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { getPool } from "../database/connection";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { absenceRequestService } from "./absence-request.service";
import { absenceReviewService } from "./absence-review.service";
import { absenceBalanceRepository } from "../repositories/absence-balance.repository";
import { AppError } from "../errors/app-error";

const uniqueCompanyName = (): string =>
  `Absence Phase0 ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const uniquePhone = (): string => `+54911${Date.now().toString().slice(-8)}`;

describeDatabaseIntegration("absence phase0 hardening integration", () => {
  const createdCompanyIds: string[] = [];
  let actorUserId = "";

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    const pool = getPool();
    for (const companyId of createdCompanyIds) {
      await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
        DELETE FROM absence_request_events WHERE company_id = @companyId;
        DELETE FROM absence_workday_sync_jobs WHERE company_id = @companyId;
        DELETE FROM absence_requests WHERE company_id = @companyId;
        DELETE FROM employee_absence_balances WHERE company_id = @companyId;
        DELETE FROM employees WHERE company_id = @companyId;
        DELETE FROM employee_categories WHERE company_id = @companyId;
        DELETE FROM company_absence_settings WHERE company_id = @companyId;
        DELETE FROM absence_types WHERE company_id = @companyId;
        DELETE FROM user_company_memberships WHERE company_id = @companyId;
        DELETE FROM company_settings WHERE company_id = @companyId;
        DELETE FROM company_modules WHERE company_id = @companyId;
        DELETE FROM company_location_types WHERE company_id = @companyId;
        DELETE FROM company_work_schedule_days WHERE company_id = @companyId;
        DELETE FROM company_work_schedules WHERE company_id = @companyId;
        UPDATE absence_types SET calendar_id = NULL WHERE company_id = @companyId;
        DELETE FROM company_calendar_dates WHERE company_id = @companyId;
        DELETE FROM company_work_calendar_weekdays WHERE company_id = @companyId;
        DELETE FROM company_work_calendars WHERE company_id = @companyId;
        DELETE FROM user_invitations WHERE company_id = @companyId;
        DELETE FROM audit_logs WHERE company_id = @companyId;
        DELETE FROM companies WHERE id = @companyId;
      `);
    }
    await teardownDatabaseIntegration();
  });

  const seedCompany = async (timezone = "America/Argentina/Buenos_Aires") => {
    const { userRepository } = await import("../repositories/user.repository");
    const admin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(admin);
    actorUserId = admin.id;

    const created = await createPlatformCompanyFixture({
      name: uniqueCompanyName(),
      defaultTimezone: timezone,
      owner: {
        name: "Absence Owner",
        email: `absence-owner-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@integration.test`,
      },
    });
    const companyId = created.data.company.id;
    createdCompanyIds.push(companyId);

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("timezone", sql.NVarChar(64), timezone)
      .query(`
      UPDATE company_settings
      SET operation_timezone = @timezone
      WHERE company_id = @companyId;

      UPDATE absence_types
      SET requires_approval = 1, deducts_balance = 1
      WHERE company_id = @companyId AND code = N'VACATION';

      UPDATE absence_types
      SET requires_approval = 0, deducts_balance = 0
      WHERE company_id = @companyId AND code = N'PERSONAL_PROCEDURE';
    `);

    const types = await absenceTypeRepository.listAll(companyId, true);
    const vacation = types.find((type) => type.code === "VACATION");
    const personal = types.find((type) => type.code === "PERSONAL_PROCEDURE");
    assert.ok(vacation);
    assert.ok(personal);

    const employee = await employeeRepository.create(companyId, {
      name: "Absence Worker",
      phoneNumber: uniquePhone(),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
    });

    await absenceBalanceRepository.upsert(companyId, {
      employeeId: employee.id,
      absenceTypeId: vacation.id,
      year: Number((await resolveCompanyTodayIso(companyId)).slice(0, 4)),
      totalDays: 20,
    });

    return { companyId, vacation, personal, employee };
  };

  it("creates with approval required as PENDING and without approval as APPROVED", async () => {
    const { companyId, vacation, personal, employee } = await seedCompany();
    const today = await resolveCompanyTodayIso(companyId);
    const tomorrow = new Date(`${today}T12:00:00.000Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const nextDay = tomorrow.toISOString().slice(0, 10);

    const pending = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employee.id,
        absenceTypeId: vacation.id,
        startDate: today,
        endDate: today,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Vacaciones cortas",
      },
      actorUserId,
    );
    assert.equal(pending.status, "PENDING");

    const auto = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employee.id,
        absenceTypeId: personal.id,
        startDate: nextDay,
        endDate: nextDay,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Trámite personal",
      },
      actorUserId,
    );
    assert.equal(auto.status, "APPROVED");
    assert.ok(auto.events.some((event) => event.eventType === "APPROVED"));
  });

  it("supports needs-info edit and resubmit back to PENDING", async () => {
    const { companyId, vacation, employee } = await seedCompany();
    const today = await resolveCompanyTodayIso(companyId);

    const created = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employee.id,
        absenceTypeId: vacation.id,
        startDate: today,
        endDate: today,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Necesita corrección",
      },
      actorUserId,
    );

    const needsInfo = await absenceReviewService.needsInfo(companyId, created.id, actorUserId, {
      comment: "Falta aclarar motivo",
    });
    assert.equal(needsInfo.status, "NEEDS_INFO");

    const updated = await absenceRequestService.updateNeedsInfo(
      companyId,
      created.id,
      { reason: "Motivo corregido por admin" },
      actorUserId,
    );
    assert.equal(updated.status, "NEEDS_INFO");
    assert.equal(updated.reason, "Motivo corregido por admin");

    const resubmitted = await absenceRequestService.resubmit(companyId, created.id, actorUserId);
    assert.equal(resubmitted.status, "PENDING");
    assert.ok(resubmitted.events.some((event) => event.eventType === "RESUBMITTED"));
  });

  it("blocks cross-company access by id", async () => {
    const a = await seedCompany();
    const b = await seedCompany();
    const today = await resolveCompanyTodayIso(a.companyId);

    const created = await absenceRequestService.createFromAdmin(
      a.companyId,
      {
        employeeId: a.employee.id,
        absenceTypeId: a.vacation.id,
        startDate: today,
        endDate: today,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Solo empresa A",
      },
      actorUserId,
    );

    await assert.rejects(
      () => absenceRequestService.getById(b.companyId, created.id),
      (error: unknown) => error instanceof AppError && error.statusCode === 404,
    );
  });

  it("allows only one winner when two approvals race", async () => {
    const { companyId, vacation, employee } = await seedCompany();
    const today = await resolveCompanyTodayIso(companyId);
    const created = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employee.id,
        absenceTypeId: vacation.id,
        startDate: today,
        endDate: today,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Carrera de aprobación",
      },
      actorUserId,
    );

    const results = await Promise.allSettled([
      absenceReviewService.approve(companyId, created.id, actorUserId),
      absenceReviewService.approve(companyId, created.id, actorUserId),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const detail = await absenceRequestService.getById(companyId, created.id);
    assert.equal(detail.status, "APPROVED");
    assert.equal(detail.events.filter((event) => event.eventType === "APPROVED").length, 1);
  });

  it("allows only one winner when approve and reject race", async () => {
    const { companyId, vacation, employee } = await seedCompany();
    const today = await resolveCompanyTodayIso(companyId);
    const created = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employee.id,
        absenceTypeId: vacation.id,
        startDate: today,
        endDate: today,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Aprobar vs rechazar",
      },
      actorUserId,
    );

    const results = await Promise.allSettled([
      absenceReviewService.approve(companyId, created.id, actorUserId),
      absenceReviewService.reject(companyId, created.id, actorUserId, {
        reason: "Rechazo concurrente",
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    assert.equal(fulfilled.length, 1);
    const detail = await absenceRequestService.getById(companyId, created.id);
    assert.ok(detail.status === "APPROVED" || detail.status === "REJECTED");
  });

  it("blocks overlapping concurrent creates for the same employee", async () => {
    const { companyId, vacation, employee } = await seedCompany();
    const today = await resolveCompanyTodayIso(companyId);
    const payload = {
      employeeId: employee.id,
      absenceTypeId: vacation.id,
      startDate: today,
      endDate: today,
      startPeriod: "FULL_DAY" as const,
      endPeriod: "FULL_DAY" as const,
      reason: "Overlap concurrente",
    };

    const results = await Promise.allSettled([
      absenceRequestService.createFromAdmin(companyId, payload, actorUserId),
      absenceRequestService.createFromAdmin(companyId, payload, actorUserId),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
  });
});
