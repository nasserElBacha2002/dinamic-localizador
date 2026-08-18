/**
 * Phase 0A corrections — SQL Server concurrency evidence (C2/C3/C4).
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, it, mock } from "node:test";
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
import { absenceAttachmentRepository } from "../repositories/absence-attachment.repository";
import { botSessionRepository } from "../repositories/bot-session.repository";
import { absenceRequestService } from "./absence-request.service";
import { absenceReviewService } from "./absence-review.service";
import { attachmentDeletionService } from "./attachment-deletion.service";
import { operationAssignmentService } from "./operation-assignment.service";
import { processCheckoutWithoutLocation } from "./bot/checkout-attendance.flow";
import { employeeWorkdayAvailabilityService } from "./employee-workday-availability.service";
import { attendanceRepository } from "../repositories/attendance.repository";
import { runWithBotRuntimeContext } from "../utils/bot-runtime-context";
import { runWithBotRuntimeSettings } from "../utils/bot-runtime-settings-scope";
import {
  setCheckoutWithoutLocationBeforeCommitHookForTests,
  setOutboundPersistAfterCommitHookForTests,
} from "../utils/checkout-transaction-hooks";
import type { BotRuntimeSettings } from "../types/bot-runtime-settings";

const uniqueCompanyName = (): string =>
  `Phase0ACorr ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const uniquePhone = (): string => `+54911${Date.now().toString().slice(-8)}`;

const addDays = (isoDate: string, days: number): string => {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const countActiveOverlapping = async (
  companyId: string,
  employeeId: string,
  startDate: string,
  endDate: string,
): Promise<number> => {
  const result = await getPool()
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("employeeId", sql.UniqueIdentifier, employeeId)
    .input("startDate", sql.Date, startDate)
    .input("endDate", sql.Date, endDate)
    .query(`
      SELECT COUNT(*) AS c
      FROM absence_requests
      WHERE company_id = @companyId
        AND employee_id = @employeeId
        AND status IN (N'PENDING', N'NEEDS_INFO', N'APPROVED')
        AND start_date <= @endDate
        AND end_date >= @startDate
    `);
  return Number(result.recordset[0].c);
};

describeDatabaseIntegration("database integrity phase0a corrections H1 H3 H4", () => {
  const createdCompanyIds: string[] = [];
  const fixtures = createIntegrationFixtureTracker();
  let actorUserId = "";

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  afterEach(() => {
    setCheckoutWithoutLocationBeforeCommitHookForTests(undefined);
    setOutboundPersistAfterCommitHookForTests(undefined);
    mock.restoreAll();
  });

  after(async () => {
    const { deleteCompanyCascade } = await import("../test-helpers/integration-cleanup");
    for (const companyId of createdCompanyIds) {
      try {
        await deleteCompanyCascade(companyId);
      } catch (error) {
        console.warn("[phase0a-corr] company cleanup failed", companyId, error);
      }
    }
    try {
      await fixtures.cleanup();
    } catch (error) {
      console.warn("[phase0a-corr] fixtures cleanup failed", error);
    }
    await teardownDatabaseIntegration();
  });

  const seedAbsenceCompany = async (options?: { requireAttachment?: boolean }) => {
    const { userRepository } = await import("../repositories/user.repository");
    const admin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(admin);
    actorUserId = admin.id;

    const created = await createPlatformCompanyFixture({
      name: uniqueCompanyName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Phase0A Corr Owner",
        email: `phase0a-corr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@integration.test`,
      },
    });
    const companyId = created.data.company.id;
    createdCompanyIds.push(companyId);

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("requireAttachment", sql.Bit, options?.requireAttachment ? 1 : 0)
      .query(`
        UPDATE absence_types
        SET requires_approval = 1,
            deducts_balance = 1,
            requires_attachment = @requireAttachment,
            attachment_policy = CASE WHEN @requireAttachment = 1 THEN N'REQUIRED' ELSE N'OPTIONAL' END
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

    const year = Number((await resolveCompanyTodayIso(companyId)).slice(0, 4));
    await absenceBalanceRepository.upsert(companyId, {
      employeeId: employeeA.id,
      absenceTypeId: vacation.id,
      year,
      totalDays: 30,
      notes: null,
    });

    return { companyId, vacation, employeeA };
  };

  it("H1 C2: concurrent create vs resubmit overlapping → exactly one writer wins, no overlap rows", async () => {
    const { companyId, vacation, employeeA } = await seedAbsenceCompany();
    const today = await resolveCompanyTodayIso(companyId);
    const start = addDays(today, 40);
    const end = addDays(today, 45);

    const existing = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employeeA.id,
        absenceTypeId: vacation.id,
        startDate: start,
        endDate: end,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Resubmit race base",
      },
      actorUserId,
    );
    await absenceReviewService.needsInfo(companyId, existing.id, actorUserId, {
      comment: "Necesita corrección",
    });

    const [createResult, resubmitResult] = await Promise.allSettled([
      absenceRequestService.createFromAdmin(
        companyId,
        {
          employeeId: employeeA.id,
          absenceTypeId: vacation.id,
          startDate: start,
          endDate: end,
          startPeriod: "FULL_DAY",
          endPeriod: "FULL_DAY",
          reason: "Create vs resubmit",
        },
        actorUserId,
      ),
      absenceRequestService.resubmit(companyId, existing.id, actorUserId),
    ]);

    const successes = [createResult, resubmitResult].filter((r) => r.status === "fulfilled");
    const failures = [createResult, resubmitResult].filter((r) => r.status === "rejected");
    assert.equal(successes.length, 1, "exactly one mutation wins");
    assert.equal(failures.length, 1, "exactly one mutation conflicts");
    const rejected = (failures[0] as PromiseRejectedResult).reason;
    assert.ok(rejected instanceof AppError);
    assert.ok(
      rejected.code === "ABSENCE_OVERLAP" || rejected.code === "ABSENCE_LOCK_TIMEOUT",
      `unexpected conflict code: ${rejected.code}`,
    );

    assert.equal(await countActiveOverlapping(companyId, employeeA.id, start, end), 1);
  });

  it("H1: concurrent create vs updateNeedsInfo date expansion → one winner, no overlap rows", async () => {
    const { companyId, vacation, employeeA } = await seedAbsenceCompany();
    const today = await resolveCompanyTodayIso(companyId);
    const earlyStart = addDays(today, 50);
    const earlyEnd = addDays(today, 52);
    const lateStart = addDays(today, 60);
    const lateEnd = addDays(today, 65);

    const existing = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employeeA.id,
        absenceTypeId: vacation.id,
        startDate: earlyStart,
        endDate: earlyEnd,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Needs info base (non-overlapping)",
      },
      actorUserId,
    );
    await absenceReviewService.needsInfo(companyId, existing.id, actorUserId, {
      comment: "Ajustar fechas",
    });

    const [createResult, updateResult] = await Promise.allSettled([
      absenceRequestService.createFromAdmin(
        companyId,
        {
          employeeId: employeeA.id,
          absenceTypeId: vacation.id,
          startDate: lateStart,
          endDate: lateEnd,
          startPeriod: "FULL_DAY",
          endPeriod: "FULL_DAY",
          reason: "Create overlapping target window",
        },
        actorUserId,
      ),
      absenceRequestService.updateNeedsInfo(
        companyId,
        existing.id,
        {
          startDate: lateStart,
          endDate: lateEnd,
          startPeriod: "FULL_DAY",
          endPeriod: "FULL_DAY",
          reason: "Move into create window",
        },
        actorUserId,
      ),
    ]);

    const successes = [createResult, updateResult].filter((r) => r.status === "fulfilled");
    const failures = [createResult, updateResult].filter((r) => r.status === "rejected");
    assert.equal(successes.length, 1, "exactly one date-window writer wins");
    assert.equal(failures.length, 1);
    const rejected = (failures[0] as PromiseRejectedResult).reason;
    assert.ok(rejected instanceof AppError);
    assert.ok(
      rejected.code === "ABSENCE_OVERLAP" || rejected.code === "ABSENCE_LOCK_TIMEOUT",
      `unexpected conflict code: ${rejected.code}`,
    );

    assert.equal(await countActiveOverlapping(companyId, employeeA.id, lateStart, lateEnd), 1);
  });

  it("H3 C3: concurrent approve vs attachment delete → never APPROVED without AVAILABLE attachment", async () => {
    const { companyId, vacation, employeeA } = await seedAbsenceCompany({
      requireAttachment: true,
    });
    const today = await resolveCompanyTodayIso(companyId);
    const start = addDays(today, 70);
    const end = addDays(today, 72);

    const request = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employeeA.id,
        absenceTypeId: vacation.id,
        startDate: start,
        endDate: end,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Approve vs delete race",
      },
      actorUserId,
    );

    const attachment = await absenceAttachmentRepository.create({
      id: randomUUID(),
      companyId,
      absenceRequestId: request.id,
      bucketName: "phase0a-test-bucket",
      objectKey: `phase0a/${randomUUID()}.pdf`,
      originalFileName: "cert.pdf",
      normalizedFileName: "cert.pdf",
      declaredContentType: "application/pdf",
      detectedContentType: "application/pdf",
      sizeBytes: 1024,
      checksumSha256: "a".repeat(64),
      status: "AVAILABLE",
      source: "ADMIN",
      uploadedByUserId: actorUserId,
    });

    const [approveResult, deleteResult] = await Promise.allSettled([
      absenceReviewService.approve(companyId, request.id, actorUserId),
      attachmentDeletionService.softDeleteSqlOnlyForTests({
        companyId,
        requestId: request.id,
        attachmentId: attachment.id,
        deletedByUserId: actorUserId,
        reason: "race_delete",
      }),
    ]);

    const pool = getPool();
    const absenceRow = await pool
      .request()
      .input("id", sql.UniqueIdentifier, request.id)
      .query(`SELECT status FROM absence_requests WHERE id = @id`);
    const status = String(absenceRow.recordset[0].status);

    const attachmentRow = await pool
      .request()
      .input("id", sql.UniqueIdentifier, attachment.id)
      .query(`SELECT status FROM absence_request_attachments WHERE id = @id`);
    const attachmentStatus = String(attachmentRow.recordset[0].status);

    const availableCount = await absenceAttachmentRepository.countAvailable(
      companyId,
      request.id,
    );

    if (status === "APPROVED") {
      assert.equal(approveResult.status, "fulfilled");
      assert.ok(
        availableCount >= 1 || attachmentStatus === "AVAILABLE",
        "APPROVED must have had a valid AVAILABLE attachment at decision time; post-commit delete may lock",
      );
      // Delete must not have left an APPROVED decision based on a vanished attachment mid-flight.
      // If delete ran after approve, it should be rejected as locked or still show AVAILABLE until post-approve cleanup.
      if (deleteResult.status === "fulfilled") {
        // Approve committed first; delete of attachment after APPROVED is blocked by request status.
        assert.fail("delete must not succeed after/during successful approve on locked request");
      } else {
        const reason = (deleteResult as PromiseRejectedResult).reason;
        assert.ok(reason instanceof AppError);
        assert.ok(
          reason.code === "ABSENCE_ATTACHMENT_LOCKED" ||
            reason.code === "ATTACHMENT_STATUS_CONFLICT" ||
            reason.code === "ATTACHMENT_NOT_FOUND",
          `unexpected delete failure: ${reason.code}`,
        );
      }
    } else {
      assert.notEqual(status, "APPROVED");
      assert.equal(availableCount, 0);
      assert.ok(deleteResult.status === "fulfilled" || approveResult.status === "rejected");
      if (approveResult.status === "rejected") {
        const reason = (approveResult as PromiseRejectedResult).reason;
        assert.ok(reason instanceof AppError);
        assert.equal(reason.code, "ABSENCE_ATTACHMENT_REQUIRED");
      }
    }
  });

  it("H3: approve without attachment is rejected", async () => {
    const { companyId, vacation, employeeA } = await seedAbsenceCompany({
      requireAttachment: true,
    });
    const today = await resolveCompanyTodayIso(companyId);
    const start = addDays(today, 80);
    const end = addDays(today, 81);

    const request = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employeeA.id,
        absenceTypeId: vacation.id,
        startDate: start,
        endDate: end,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "Missing attachment",
      },
      actorUserId,
    );

    await assert.rejects(
      () => absenceReviewService.approve(companyId, request.id, actorUserId),
      (error: unknown) =>
        error instanceof AppError && error.code === "ABSENCE_ATTACHMENT_REQUIRED",
    );

    const status = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, request.id)
      .query(`SELECT status FROM absence_requests WHERE id = @id`);
    assert.equal(String(status.recordset[0].status), "PENDING");
  });

  it("H3: approve with required attachment succeeds", async () => {
    const { companyId, vacation, employeeA } = await seedAbsenceCompany({
      requireAttachment: true,
    });
    const today = await resolveCompanyTodayIso(companyId);
    const start = addDays(today, 85);
    const end = addDays(today, 86);

    const request = await absenceRequestService.createFromAdmin(
      companyId,
      {
        employeeId: employeeA.id,
        absenceTypeId: vacation.id,
        startDate: start,
        endDate: end,
        startPeriod: "FULL_DAY",
        endPeriod: "FULL_DAY",
        reason: "With attachment",
      },
      actorUserId,
    );

    await absenceAttachmentRepository.create({
      id: randomUUID(),
      companyId,
      absenceRequestId: request.id,
      bucketName: "phase0a-test-bucket",
      objectKey: `phase0a/${randomUUID()}.pdf`,
      originalFileName: "ok.pdf",
      normalizedFileName: "ok.pdf",
      declaredContentType: "application/pdf",
      detectedContentType: "application/pdf",
      sizeBytes: 512,
      checksumSha256: "b".repeat(64),
      status: "AVAILABLE",
      source: "ADMIN",
      uploadedByUserId: actorUserId,
    });

    const approved = await absenceReviewService.approve(companyId, request.id, actorUserId);
    assert.equal(approved.status, "APPROVED");
  });

  const seedCheckoutFixture = async (simulationSessionId: string) => {
    const pool = getPool();
    const { userRepository } = await import("../repositories/user.repository");
    const admin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(admin);

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
    assert.ok(serviceId);

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
        VALUES (@companyId, N'Phase0A Checkout Emp', @phone, N'fijo', 1);
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
        SELECT TOP 1 ew.id, ow.expected_end_at, ow.expected_start_at, ow.work_date,
               ow.id AS operation_workday_id
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
          -34.6, -58.4, 10, N'VALID', N'INSIDE_GEOFENCE', N'ON_TIME',
          SYSUTCDATETIME(), 0
        )
      `);
    const attendanceId = String(attendanceInsert.recordset[0].id);

    // Session must match bot runtime simulation scope used by completeSession.
    const session = await botSessionRepository.create(
      {
        companyId,
        employeeId,
        operationId,
        employeeWorkdayId,
        attendanceRecordId: attendanceId,
        phoneNumber: uniquePhone(),
        state: "WAITING_CHECKOUT_LOCATION",
        contextJson: JSON.stringify({ flow: "checkout" }),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
      undefined,
      { mode: "simulation", simulationSessionId },
    );

    const row = expectation.recordset[0] as Record<string, unknown>;
    const candidate = {
      employeeWorkdayId,
      operationWorkdayId: String(row.operation_workday_id),
      operationId,
      serviceId,
      serviceName: "Servicio",
      serviceAddress: "Addr",
      serviceLocality: "CABA",
      serviceLatitude: -34.6,
      serviceLongitude: -58.4,
      allowedRadiusMeters: 150,
      operationKind: "ONE_TIME" as const,
      workDate: String(row.work_date).slice(0, 10),
      expectedStartAt: new Date(row.expected_start_at as Date).toISOString(),
      expectedEndAt: row.expected_end_at
        ? new Date(row.expected_end_at as Date).toISOString()
        : null,
      earlyToleranceMinutes: 60,
      lateToleranceMinutes: 90,
      scheduleTimezone: "America/Argentina/Buenos_Aires",
      attendanceRecordId: attendanceId,
      checkInAt: new Date().toISOString(),
    };

    return {
      companyId,
      employeeId,
      operationId,
      employeeWorkdayId,
      attendanceId,
      sessionId: session.id,
      simulationSessionId,
      candidate,
    };
  };

  const runtimeSettings = (companyId: string): BotRuntimeSettings => ({
    companyId,
    operationTimezone: "America/Argentina/Buenos_Aires",
    defaultRadiusMeters: 150,
    geofenceReviewMarginMeters: 30,
    lateGraceMinutes: 15,
    earlyLeaveToleranceMinutes: 15,
    requireCheckoutLocation: false,
    allowManualAttendanceCorrections: true,
    pendingOperationExpirationHours: 12,
    sessionTtlMinutes: 15,
  });

  const runCheckout = async (
    fixture: Awaited<ReturnType<typeof seedCheckoutFixture>>,
    messageSid: string,
    options?: { skipWhatsAppPersistence?: boolean },
  ) => {
    mock.method(employeeWorkdayAvailabilityService, "revalidateCheckoutCandidate", async () => ({
      kind: "eligible" as const,
      candidate: fixture.candidate,
    }));
    mock.method(attendanceRepository, "findCheckInForEmployeeWorkday", async () => {
      const row = await getPool()
        .request()
        .input("id", sql.UniqueIdentifier, fixture.attendanceId)
        .query(`SELECT * FROM attendance_records WHERE id = @id`);
      const { mapAttendanceRow } = await import("../utils/row-mappers");
      return mapAttendanceRow(row.recordset[0] as Record<string, unknown>);
    });

    const context = {
      simulationSessionId: fixture.simulationSessionId,
      employeeIdOverride: fixture.employeeId,
      phoneNumber: "+5491111111111",
      simulatedNow: new Date(),
      mode: "persistent" as const,
      skipWhatsAppPersistence: options?.skipWhatsAppPersistence ?? true,
      messages: [],
      technicalDetails: {},
      simulationArtifacts: [],
      virtualAttendanceRecords: [],
      lastBotResponse: null,
      lastDetectedIntent: null,
      lastTwilioPayload: null,
    };

    return runWithBotRuntimeContext(context, async () =>
      runWithBotRuntimeSettings(runtimeSettings(fixture.companyId), async () =>
        processCheckoutWithoutLocation({
          companyId: fixture.companyId,
          employeeId: fixture.employeeId,
          employeeWorkdayId: fixture.employeeWorkdayId,
          attendanceRecordId: fixture.attendanceId,
          operationId: fixture.operationId,
          phoneFrom: "+5491111111111",
          phoneTo: "+5491000000000",
          messageSid,
          sessionId: fixture.sessionId,
        }),
      ),
    );
  };

  it("H4: successful checkout without location updates attendance + completes session atomically", async () => {
    const fixture = await seedCheckoutFixture(randomUUID());
    await runCheckout(fixture, `SM-H4-OK-${randomUUID()}`);

    const attendance = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, fixture.attendanceId)
      .query(`SELECT checkout_at, checkout_message_sid FROM attendance_records WHERE id = @id`);
    assert.ok(attendance.recordset[0].checkout_at, "checkout_at must be set");

    const session = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, fixture.sessionId)
      .query(`SELECT state FROM bot_sessions WHERE id = @id`);
    assert.equal(String(session.recordset[0].state), "COMPLETED");
  });

  it("H4: injected failure before commit rolls back attendance checkout and session", async () => {
    const fixture = await seedCheckoutFixture(randomUUID());
    setCheckoutWithoutLocationBeforeCommitHookForTests(async () => {
      throw new Error("injected H4 failure before commit");
    });

    await runCheckout(fixture, `SM-H4-FAIL-${randomUUID()}`);

    const attendance = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, fixture.attendanceId)
      .query(`SELECT checkout_at FROM attendance_records WHERE id = @id`);
    assert.equal(attendance.recordset[0].checkout_at, null);

    const session = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, fixture.sessionId)
      .query(`SELECT state FROM bot_sessions WHERE id = @id`);
    assert.equal(String(session.recordset[0].state), "WAITING_CHECKOUT_LOCATION");
  });

  it("H4: retry with same MessageSid remains idempotent (no double checkout)", async () => {
    const fixture = await seedCheckoutFixture(randomUUID());
    const messageSid = `SM-H4-IDEM-${randomUUID()}`;

    await runCheckout(fixture, messageSid);
    await runCheckout(fixture, messageSid);

    const attendance = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, fixture.attendanceId)
      .query(`
        SELECT checkout_at, checkout_message_sid
        FROM attendance_records WHERE id = @id
      `);
    assert.ok(attendance.recordset[0].checkout_at);
    assert.equal(String(attendance.recordset[0].checkout_message_sid), messageSid);

    const session = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, fixture.sessionId)
      .query(`SELECT state FROM bot_sessions WHERE id = @id`);
    assert.equal(String(session.recordset[0].state), "COMPLETED");
  });

  it("H4: outbound failure after commit keeps checkout and completed session", async () => {
    const fixture = await seedCheckoutFixture(randomUUID());
    let outboundAttempts = 0;
    setOutboundPersistAfterCommitHookForTests(async () => {
      outboundAttempts += 1;
      throw new Error("injected outbound failure after commit");
    });

    await assert.rejects(
      () =>
        runCheckout(fixture, `SM-H4-OUTBOUND-${randomUUID()}`, {
          skipWhatsAppPersistence: false,
        }),
      (error: unknown) =>
        error instanceof Error && error.message.includes("injected outbound failure after commit"),
    );

    assert.equal(outboundAttempts, 1);

    const attendance = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, fixture.attendanceId)
      .query(`SELECT checkout_at FROM attendance_records WHERE id = @id`);
    assert.ok(attendance.recordset[0].checkout_at, "checkout must remain committed");

    const session = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, fixture.sessionId)
      .query(`SELECT state FROM bot_sessions WHERE id = @id`);
    assert.equal(String(session.recordset[0].state), "COMPLETED");
  });

  it("H4: two concurrent checkouts yield one durable checkout", async () => {
    const fixture = await seedCheckoutFixture(randomUUID());
    const sidA = `SM-H4-CONC-A-${randomUUID()}`;
    const sidB = `SM-H4-CONC-B-${randomUUID()}`;

    const [first, second] = await Promise.allSettled([
      runCheckout(fixture, sidA),
      runCheckout(fixture, sidB),
    ]);

    assert.equal(first.status, "fulfilled");
    assert.equal(second.status, "fulfilled");

    const attendance = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, fixture.attendanceId)
      .query(`
        SELECT checkout_at, checkout_message_sid
        FROM attendance_records WHERE id = @id
      `);
    assert.ok(attendance.recordset[0].checkout_at);
    const winnerSid = String(attendance.recordset[0].checkout_message_sid);
    assert.ok(winnerSid === sidA || winnerSid === sidB);

    const session = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, fixture.sessionId)
      .query(`SELECT state FROM bot_sessions WHERE id = @id`);
    assert.equal(String(session.recordset[0].state), "COMPLETED");
  });
});
