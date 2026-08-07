/**
 * Phase 0A integrity hardening — SQL Server concurrency evidence (H1, H2).
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 * Requires migration 086 (attendance review unique).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  resolveCompanyTodayIso,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { createIntegrationFixtureTracker } from "../test-helpers/integration-cleanup";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { getPool } from "../database/connection";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { AppError } from "../errors/app-error";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { absenceBalanceRepository } from "../repositories/absence-balance.repository";
import { absenceRequestService } from "./absence-request.service";
import { attendanceService } from "./attendance.service";
import { operationAssignmentService } from "./operation-assignment.service";
import { hashPassword, normalizeEmail } from "../utils/password";

const uniqueCompanyName = (): string =>
  `Phase0A ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const uniquePhone = (): string => `+54911${Date.now().toString().slice(-8)}`;

const addDays = (isoDate: string, days: number): string => {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

describeDatabaseIntegration("database integrity phase0a H1 H2", () => {
  const createdCompanyIds: string[] = [];
  const fixtures = createIntegrationFixtureTracker();
  let actorUserId = "";

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    const { deleteCompanyCascade } = await import("../test-helpers/integration-cleanup");
    for (const companyId of createdCompanyIds) {
      try {
        await deleteCompanyCascade(companyId);
      } catch (error) {
        console.warn("[phase0a] company cleanup failed", companyId, error);
      }
    }
    try {
      await fixtures.cleanup();
    } catch (error) {
      console.warn("[phase0a] fixtures cleanup failed", error);
    }
    await teardownDatabaseIntegration();
  });

  const seedAbsenceCompany = async () => {
    const { userRepository } = await import("../repositories/user.repository");
    const admin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(admin);
    actorUserId = admin.id;

    const created = await createPlatformCompanyFixture({
      name: uniqueCompanyName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Phase0A Owner",
        email: `phase0a-owner-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@integration.test`,
      },
    });
    const companyId = created.data.company.id;
    createdCompanyIds.push(companyId);

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        UPDATE absence_types
        SET requires_approval = 1, deducts_balance = 1
        WHERE company_id = @companyId AND code = N'VACATION';
      `);

    const types = await absenceTypeRepository.listAll(companyId, true);
    const vacation = types.find((type) => type.code === "VACATION");
    assert.ok(vacation);

    const employeeA = await employeeRepository.create(companyId, {
      name: "Employee A",
      phoneNumber: uniquePhone(),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
    });
    const employeeB = await employeeRepository.create(companyId, {
      name: "Employee B",
      phoneNumber: uniquePhone(),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
    });

    const year = Number((await resolveCompanyTodayIso(companyId)).slice(0, 4));
    await absenceBalanceRepository.upsert(companyId, {
      employeeId: employeeA.id,
      absenceTypeId: vacation.id,
      year,
      totalDays: 30,
      notes: null,
    });
    await absenceBalanceRepository.upsert(companyId, {
      employeeId: employeeB.id,
      absenceTypeId: vacation.id,
      year,
      totalDays: 30,
      notes: null,
    });

    return { companyId, vacation, employeeA, employeeB };
  };

  it("H1: concurrent overlapping absences → 1 success / 1 conflict and one active row", async () => {
    const { companyId, vacation, employeeA } = await seedAbsenceCompany();
    const today = await resolveCompanyTodayIso(companyId);
    const startA = addDays(today, 10);
    const endA = addDays(today, 15);
    const startB = addDays(today, 12);
    const endB = addDays(today, 14);

    const [first, second] = await Promise.allSettled([
      absenceRequestService.createFromAdmin(
        companyId,
        {
          employeeId: employeeA.id,
          absenceTypeId: vacation.id,
          startDate: startA,
          endDate: endA,
          startPeriod: "FULL_DAY",
          endPeriod: "FULL_DAY",
          reason: "Overlap race A",
        },
        actorUserId,
      ),
      absenceRequestService.createFromAdmin(
        companyId,
        {
          employeeId: employeeA.id,
          absenceTypeId: vacation.id,
          startDate: startB,
          endDate: endB,
          startPeriod: "FULL_DAY",
          endPeriod: "FULL_DAY",
          reason: "Overlap race B",
        },
        actorUserId,
      ),
    ]);

    const successes = [first, second].filter((r) => r.status === "fulfilled");
    const failures = [first, second].filter((r) => r.status === "rejected");
    assert.equal(successes.length, 1);
    assert.equal(failures.length, 1);
    const rejected = (failures[0] as PromiseRejectedResult).reason;
    assert.ok(rejected instanceof AppError);
    assert.equal(rejected.code, "ABSENCE_OVERLAP");

    const pool = getPool();
    const count = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeA.id)
      .input("startDate", sql.Date, startA)
      .input("endDate", sql.Date, endA)
      .query(`
        SELECT COUNT(*) AS c
        FROM absence_requests
        WHERE company_id = @companyId
          AND employee_id = @employeeId
          AND status IN (N'PENDING', N'NEEDS_INFO', N'APPROVED')
          AND start_date <= @endDate
          AND end_date >= @startDate
      `);
    assert.equal(Number(count.recordset[0].c), 1);
  });

  it("H1: different employees are not serialized by the same lock", async () => {
    const { companyId, vacation, employeeA, employeeB } = await seedAbsenceCompany();
    const today = await resolveCompanyTodayIso(companyId);
    const start = addDays(today, 20);
    const end = addDays(today, 22);

    const [a, b] = await Promise.allSettled([
      absenceRequestService.createFromAdmin(
        companyId,
        {
          employeeId: employeeA.id,
          absenceTypeId: vacation.id,
          startDate: start,
          endDate: end,
          startPeriod: "FULL_DAY",
          endPeriod: "FULL_DAY",
          reason: "Employee A parallel",
        },
        actorUserId,
      ),
      absenceRequestService.createFromAdmin(
        companyId,
        {
          employeeId: employeeB.id,
          absenceTypeId: vacation.id,
          startDate: start,
          endDate: end,
          startPeriod: "FULL_DAY",
          endPeriod: "FULL_DAY",
          reason: "Employee B parallel",
        },
        actorUserId,
      ),
    ]);

    assert.equal(a.status, "fulfilled");
    assert.equal(b.status, "fulfilled");
  });

  it("H2: concurrent reviews → 1 success / 1 conflict and exactly one review row", async () => {
    const pool = getPool();
    const { userRepository } = await import("../repositories/user.repository");
    const admin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(admin);
    actorUserId = admin.id;

    const companyResult = await pool.request().query(`
      SELECT TOP 1 id FROM companies WHERE status = N'ACTIVE' ORDER BY created_at ASC
    `);
    const companyId = String(companyResult.recordset[0]?.id ?? "");
    assert.ok(companyId);

    const serviceResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM operational_locations
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    const serviceId = String(serviceResult.recordset[0]?.id ?? "");
    assert.ok(serviceId, "ACTIVE operational_location required");

    const passwordHash = await hashPassword("phase0a-reviewer");
    const reviewerB = await userRepository.create({
      name: "Phase0A Reviewer B",
      email: normalizeEmail(`phase0a.reviewer.${randomUUID()}@example.com`),
      passwordHash,
      role: "ADMIN",
    });
    await pool
      .request()
      .input("userId", sql.UniqueIdentifier, reviewerB.id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        INSERT INTO user_company_memberships (user_id, company_id, role, status, is_default)
        VALUES (@userId, @companyId, N'ADMIN', N'ACTIVE', 0)
      `);

    const futureStart = new Date(Date.now() + 11 * 24 * 60 * 60 * 1000);
    const operationInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, futureStart)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, scheduled_start, early_tolerance_minutes,
          late_tolerance_minutes, status, operation_kind
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @serviceId, @scheduledStart, 60, 90, N'SCHEDULED', N'ONE_TIME')
      `);
    const operationId = String(operationInsert.recordset[0].id);
    fixtures.trackOperation(companyId, operationId);

    const employeeInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(20), uniquePhone())
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, N'Phase0A Review Emp', @phone, N'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const employeeId = String(employeeInsert.recordset[0].id);
    fixtures.trackEmployee(companyId, employeeId);

    await operationAssignmentService.assignEmployee(companyId, operationId, employeeId);

    const expectation = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT TOP 1 ew.id
        FROM employee_workdays ew
        INNER JOIN operation_workdays ow ON ow.id = ew.operation_workday_id
        WHERE ew.company_id = @companyId
          AND ow.operation_id = @operationId
          AND ew.employee_id = @employeeId
          AND ew.expectation_status <> N'CANCELLED'
      `);
    const employeeWorkdayId = String(expectation.recordset[0]?.id ?? "");
    assert.ok(employeeWorkdayId);

    const attendanceInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, employeeWorkdayId)
      .query(`
        INSERT INTO attendance_records (
          company_id, operation_id, employee_id, employee_workday_id,
          received_latitude, received_longitude,
          distance_meters, validation_status, location_status, punctuality_status,
          received_at, is_simulation
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @operationId, @employeeId, @employeeWorkdayId,
          -34.6, -58.4, 10, N'PENDING_REVIEW', N'INSIDE_GEOFENCE', N'ON_TIME',
          SYSUTCDATETIME(), 0
        )
      `);
    const attendanceId = String(attendanceInsert.recordset[0].id);

    const [first, second] = await Promise.allSettled([
      attendanceService.review(companyId, attendanceId, actorUserId, {
        decision: "APPROVE",
        reason: "Reviewer A",
      }),
      attendanceService.review(companyId, attendanceId, reviewerB.id, {
        decision: "REJECT",
        reason: "Reviewer B",
      }),
    ]);

    const successes = [first, second].filter((r) => r.status === "fulfilled");
    const failures = [first, second].filter((r) => r.status === "rejected");
    assert.equal(successes.length, 1, "exactly one reviewer wins");
    assert.equal(failures.length, 1, "exactly one reviewer conflicts");
    const rejected = (failures[0] as PromiseRejectedResult).reason;
    assert.ok(rejected instanceof AppError);
    assert.equal(rejected.code, "ATTENDANCE_ALREADY_REVIEWED");

    const reviewCount = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("attendanceId", sql.UniqueIdentifier, attendanceId)
      .query(`
        SELECT COUNT(*) AS c
        FROM attendance_reviews
        WHERE company_id = @companyId AND attendance_id = @attendanceId
      `);
    assert.equal(Number(reviewCount.recordset[0].c), 1);

    const attendance = await pool
      .request()
      .input("attendanceId", sql.UniqueIdentifier, attendanceId)
      .query(`
        SELECT reviewed_at, validation_status
        FROM attendance_records
        WHERE id = @attendanceId
      `);
    assert.ok(attendance.recordset[0].reviewed_at);
    assert.ok(
      attendance.recordset[0].validation_status === "VALID" ||
        attendance.recordset[0].validation_status === "REJECTED",
    );

    await pool
      .request()
      .input("userId", sql.UniqueIdentifier, reviewerB.id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        DELETE FROM attendance_reviews WHERE reviewed_by = @userId;
        DELETE FROM user_company_memberships WHERE user_id = @userId AND company_id = @companyId;
        DELETE FROM users WHERE id = @userId;
      `);
  });
});
