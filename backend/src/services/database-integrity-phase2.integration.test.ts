/**
 * Phase 2 — transactional audit evidence (attendance review + membership).
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { createIntegrationFixtureTracker } from "../test-helpers/integration-cleanup";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { getPool } from "../database/connection";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { AppError } from "../errors/app-error";
import { setAuditBeforeInsertHookForTests } from "../repositories/audit.repository";
import { userRepository } from "../repositories/user.repository";
import { attendanceService } from "./attendance.service";
import { companyUserService } from "./company-user.service";
import { operationAssignmentService } from "./operation-assignment.service";
import { hashPassword, normalizeEmail } from "../utils/password";

const uniqueCompanyName = (): string =>
  `Phase2Audit ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const uniquePhone = (): string => `+54911${Date.now().toString().slice(-8)}`;

describeDatabaseIntegration("database integrity phase2 transactional audit", () => {
  const createdCompanyIds: string[] = [];
  const fixtures = createIntegrationFixtureTracker();

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    setAuditBeforeInsertHookForTests(undefined);
    const { deleteCompanyCascade } = await import("../test-helpers/integration-cleanup");
    for (const companyId of createdCompanyIds) {
      try {
        await deleteCompanyCascade(companyId);
      } catch (error) {
        console.warn("[phase2] company cleanup failed", companyId, error);
      }
    }
    try {
      await fixtures.cleanup();
    } catch (error) {
      console.warn("[phase2] fixtures cleanup failed", error);
    }
    await teardownDatabaseIntegration();
  });

  const seedCompany = async () => {
    const admin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(admin?.isPlatformAdmin, "platform admin required");

    const fixture = await createPlatformCompanyFixture({
      name: uniqueCompanyName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Phase2 Owner Invite",
        email: `phase2-owner-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@integration.test`,
      },
    });
    createdCompanyIds.push(fixture.data.company.id);
    return {
      companyId: fixture.data.company.id,
      actorUserId: admin.id,
    };
  };

  const createPendingReviewAttendance = async (companyId: string): Promise<string> => {
    const pool = getPool();
    const locationInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), `Phase2 Loc ${randomUUID().slice(0, 8)}`)
      .query(`
        INSERT INTO operational_locations (
          company_id, name, address, locality, latitude, longitude, allowed_radius_meters, active
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @name, N'Addr', N'CABA', -34.6, -58.4, 150, 1)
      `);
    const serviceId = String(locationInsert.recordset[0].id);

    const futureStart = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);
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
        VALUES (@companyId, N'Phase2 Review Emp', @phone, N'fijo', 1);
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
    return String(attendanceInsert.recordset[0].id);
  };

  const countAudit = async (
    companyId: string,
    entityId: string,
    action: string,
  ): Promise<number> => {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("entityId", sql.UniqueIdentifier, entityId)
      .input("action", sql.NVarChar(50), action)
      .query(`
        SELECT COUNT(*) AS total
        FROM audit_logs
        WHERE company_id = @companyId
          AND entity_id = @entityId
          AND action = @action
      `);
    return Number(result.recordset[0].total);
  };

  it("attendance review success persists review history and audit in one commit", async () => {
    const { companyId, actorUserId } = await seedCompany();
    const attendanceId = await createPendingReviewAttendance(companyId);

    await attendanceService.review(companyId, attendanceId, actorUserId, {
      decision: "APPROVE",
      reason: "Phase2 approve",
    });

    const pool = getPool();
    const record = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("attendanceId", sql.UniqueIdentifier, attendanceId)
      .query(`
        SELECT validation_status, reviewed_at
        FROM attendance_records
        WHERE id = @attendanceId AND company_id = @companyId
      `);
    assert.equal(String(record.recordset[0].validation_status), "VALID");
    assert.ok(record.recordset[0].reviewed_at);

    const reviews = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("attendanceId", sql.UniqueIdentifier, attendanceId)
      .query(`
        SELECT COUNT(*) AS total FROM attendance_reviews
        WHERE company_id = @companyId AND attendance_id = @attendanceId
      `);
    assert.equal(Number(reviews.recordset[0].total), 1);
    assert.equal(await countAudit(companyId, attendanceId, "review"), 1);
  });

  it("attendance review rolls back when audit insert fails", async () => {
    const { companyId, actorUserId } = await seedCompany();
    const attendanceId = await createPendingReviewAttendance(companyId);

    setAuditBeforeInsertHookForTests(async () => {
      throw new Error("injected audit failure for phase2 attendance review");
    });

    await assert.rejects(
      () =>
        attendanceService.review(companyId, attendanceId, actorUserId, {
          decision: "APPROVE",
          reason: "should rollback",
        }),
      (error: unknown) =>
        error instanceof Error && error.message.includes("injected audit failure"),
    );

    setAuditBeforeInsertHookForTests(undefined);

    const pool = getPool();
    const record = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("attendanceId", sql.UniqueIdentifier, attendanceId)
      .query(`
        SELECT validation_status, reviewed_at
        FROM attendance_records
        WHERE id = @attendanceId AND company_id = @companyId
      `);
    assert.equal(String(record.recordset[0].validation_status), "PENDING_REVIEW");
    assert.equal(record.recordset[0].reviewed_at, null);

    const reviews = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("attendanceId", sql.UniqueIdentifier, attendanceId)
      .query(`
        SELECT COUNT(*) AS total FROM attendance_reviews
        WHERE company_id = @companyId AND attendance_id = @attendanceId
      `);
    assert.equal(Number(reviews.recordset[0].total), 0);
    assert.equal(await countAudit(companyId, attendanceId, "review"), 0);
  });

  it("concurrent attendance review loser does not leave a false success audit", async () => {
    const { companyId, actorUserId } = await seedCompany();
    const attendanceId = await createPendingReviewAttendance(companyId);

    const passwordHash = await hashPassword("phase2-reviewer");
    const reviewerB = await userRepository.create({
      name: "Phase2 Reviewer B",
      email: normalizeEmail(`phase2.reviewer.${randomUUID()}@example.com`),
      passwordHash,
      role: "ADMIN",
    });
    await getPool()
      .request()
      .input("userId", sql.UniqueIdentifier, reviewerB.id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        INSERT INTO user_company_memberships (user_id, company_id, role, status, is_default)
        VALUES (@userId, @companyId, N'ADMIN', N'ACTIVE', 0)
      `);

    const [first, second] = await Promise.allSettled([
      attendanceService.review(companyId, attendanceId, actorUserId, {
        decision: "APPROVE",
        reason: "A",
      }),
      attendanceService.review(companyId, attendanceId, reviewerB.id, {
        decision: "REJECT",
        reason: "B",
      }),
    ]);

    const successes = [first, second].filter((r) => r.status === "fulfilled");
    const failures = [first, second].filter((r) => r.status === "rejected");
    assert.equal(successes.length, 1);
    assert.equal(failures.length, 1);
    const rejected = (failures[0] as PromiseRejectedResult).reason;
    assert.ok(rejected instanceof AppError);
    assert.equal(rejected.code, "ATTENDANCE_ALREADY_REVIEWED");

    assert.equal(await countAudit(companyId, attendanceId, "review"), 1);
  });

  it("membership role change success persists audit with actor and previous/new role", async () => {
    const { companyId, actorUserId } = await seedCompany();
    const passwordHash = await hashPassword("phase2-member");
    const member = await userRepository.create({
      name: "Phase2 Member",
      email: normalizeEmail(`phase2.member.${randomUUID()}@example.com`),
      passwordHash,
      role: "ADMIN",
    });
    await getPool()
      .request()
      .input("userId", sql.UniqueIdentifier, member.id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        INSERT INTO user_company_memberships (user_id, company_id, role, status, is_default)
        VALUES (@userId, @companyId, N'OPERATOR', N'ACTIVE', 0)
      `);

    await companyUserService.update(
      companyId,
      member.id,
      { role: "ADMIN" },
      actorUserId,
      true,
      "OWNER",
    );

    const membership = await getPool()
      .request()
      .input("userId", sql.UniqueIdentifier, member.id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT role FROM user_company_memberships
        WHERE user_id = @userId AND company_id = @companyId
      `);
    assert.equal(String(membership.recordset[0].role), "ADMIN");

    const audit = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("entityId", sql.UniqueIdentifier, member.id)
      .query(`
        SELECT TOP 1 user_id, previous_data, new_data, action
        FROM audit_logs
        WHERE company_id = @companyId
          AND entity_id = @entityId
          AND action = N'company_user_update_allowed'
        ORDER BY created_at DESC
      `);
    assert.equal(String(audit.recordset[0].user_id).toLowerCase(), actorUserId.toLowerCase());
    assert.equal(String(audit.recordset[0].action), "company_user_update_allowed");
    const previous = JSON.parse(String(audit.recordset[0].previous_data));
    const next = JSON.parse(String(audit.recordset[0].new_data));
    assert.equal(previous.role, "OPERATOR");
    assert.equal(next.role, "ADMIN");
    assert.equal(next.actorUserId, actorUserId);
    assert.equal(next.targetUserId, member.id);
  });

  it("membership role change rolls back when audit insert fails", async () => {
    const { companyId, actorUserId } = await seedCompany();
    const passwordHash = await hashPassword("phase2-member-fail");
    const member = await userRepository.create({
      name: "Phase2 Member Fail",
      email: normalizeEmail(`phase2.member.fail.${randomUUID()}@example.com`),
      passwordHash,
      role: "ADMIN",
    });
    await getPool()
      .request()
      .input("userId", sql.UniqueIdentifier, member.id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        INSERT INTO user_company_memberships (user_id, company_id, role, status, is_default)
        VALUES (@userId, @companyId, N'OPERATOR', N'ACTIVE', 0)
      `);

    setAuditBeforeInsertHookForTests(async () => {
      throw new Error("injected audit failure for phase2 membership");
    });

    await assert.rejects(
      () =>
        companyUserService.update(
          companyId,
          member.id,
          { role: "ADMIN" },
          actorUserId,
          true,
          "OWNER",
        ),
      (error: unknown) =>
        error instanceof Error && error.message.includes("injected audit failure"),
    );

    setAuditBeforeInsertHookForTests(undefined);

    const membership = await getPool()
      .request()
      .input("userId", sql.UniqueIdentifier, member.id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT role FROM user_company_memberships
        WHERE user_id = @userId AND company_id = @companyId
      `);
    assert.equal(String(membership.recordset[0].role), "OPERATOR");
    assert.equal(await countAudit(companyId, member.id, "company_user_update_allowed"), 0);
  });

  it("last-owner rejection does not write a success audit", async () => {
    const { companyId, actorUserId } = await seedCompany();
    const passwordHash = await hashPassword("phase2-sole-owner");
    const soleOwner = await userRepository.create({
      name: "Phase2 Sole Owner",
      email: normalizeEmail(`phase2.sole.owner.${randomUUID()}@example.com`),
      passwordHash,
      role: "ADMIN",
    });
    await getPool()
      .request()
      .input("userId", sql.UniqueIdentifier, soleOwner.id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        INSERT INTO user_company_memberships (user_id, company_id, role, status, is_default)
        VALUES (@userId, @companyId, N'OWNER', N'ACTIVE', 1)
      `);

    await assert.rejects(
      () =>
        companyUserService.update(
          companyId,
          soleOwner.id,
          { role: "ADMIN" },
          actorUserId,
          true,
          "OWNER",
        ),
      (error: unknown) =>
        error instanceof AppError && error.code === "LAST_OWNER_PROTECTED",
    );

    assert.equal(await countAudit(companyId, soleOwner.id, "company_user_update_allowed"), 0);

    const membership = await getPool()
      .request()
      .input("userId", sql.UniqueIdentifier, soleOwner.id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT role, status FROM user_company_memberships
        WHERE user_id = @userId AND company_id = @companyId
      `);
    assert.equal(String(membership.recordset[0].role), "OWNER");
    assert.equal(String(membership.recordset[0].status), "ACTIVE");
  });
});
