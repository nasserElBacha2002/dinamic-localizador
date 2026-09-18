/**
 * Manual attendance — SQL Server evidence for review corrections.
 * Enable: RUN_DB_INTEGRATION_TESTS=true (+ DB_* / JWT_SECRET / FRONTEND_URL / TZ)
 * Requires migration 139 applied (suite re-applies / rolls back / re-applies).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import { applySqlScriptInTransaction, stripLegacyDatabaseUse } from "../database/run-migrations";
import { AppError } from "../errors/app-error";
import { attendanceRepository } from "../repositories/attendance.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { userRepository } from "../repositories/user.repository";
import { manualAttendanceService } from "./manual-attendance.service";
import {
  createIntegrationFixtureTracker,
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

const ROOT = join(process.cwd(), "..");
const MIGRATION_139 = join(ROOT, "database/migrations/139_attendance_manual_registration.sql");
const ROLLBACK_139 = join(
  ROOT,
  "database/migrations/rollback/139_attendance_manual_registration_rollback.sql",
);

const prepareScriptForRunner = (script: string): string =>
  script
    .split(/\r?\nGO\r?\n/gi)
    .map(stripLegacyDatabaseUse)
    .filter(Boolean)
    .join("\nGO\n");

const apply139Forward = async (): Promise<void> => {
  await applySqlScriptInTransaction(
    getPool(),
    prepareScriptForRunner(readFileSync(MIGRATION_139, "utf8")),
  );
};

const apply139Rollback = async (): Promise<void> => {
  await applySqlScriptInTransaction(
    getPool(),
    prepareScriptForRunner(readFileSync(ROLLBACK_139, "utf8")),
  );
};

describeDatabaseIntegration("manual attendance review corrections SQL", () => {
  const fixtures = createIntegrationFixtureTracker();
  let companyId = "";
  let actorUserId = "";
  let serviceId = "";
  let serviceLatitude = -34.6;
  let serviceLongitude = -58.4;

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
    await apply139Forward();

    const admin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(admin);
    actorUserId = admin.id;

    const pool = getPool();
    const companyResult = await pool.request().query(`
      SELECT TOP 1 id FROM companies WHERE status = 'ACTIVE' ORDER BY created_at ASC
    `);
    companyId = String(companyResult.recordset[0]?.id ?? "");
    assert.ok(companyId);

    await companySettingsRepository.update(companyId, {
      allowManualAttendanceCorrections: true,
    });

    const serviceResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id, latitude, longitude
        FROM operational_locations
        WHERE company_id = @companyId AND active = 1
        ORDER BY created_at ASC
      `);
    serviceId = String(serviceResult.recordset[0]?.id ?? "");
    serviceLatitude = Number(serviceResult.recordset[0]?.latitude ?? -34.6);
    serviceLongitude = Number(serviceResult.recordset[0]?.longitude ?? -58.4);
    assert.ok(serviceId);
  });

  after(async () => {
    try {
      await apply139Forward();
    } catch (error) {
      console.warn("[manual-att] restore migration 139 forward failed", error);
    }
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  const createWorkdayFixture = async (input?: { startOffsetMs?: number }) => {
    const pool = getPool();
    const phone = `+54911${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
    const employeeInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), `ManualEmp ${randomUUID().slice(0, 8)}`)
      .input("phone", sql.NVarChar(30), phone)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, N'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const employeeId = String(employeeInsert.recordset[0].id);
    fixtures.trackEmployee(companyId, employeeId);

    const start = new Date(
      Date.now() -
        2 * 60 * 60 * 1000 -
        (input?.startOffsetMs ?? 1 + Math.floor(Math.random() * 2_700_000)),
    );
    const end = new Date(start.getTime() + 8 * 60 * 60 * 1000);

    const operationInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, start)
      .input("scheduledEnd", sql.DateTime2, end)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME', @scheduledStart, @scheduledEnd,
          120, 120, N'SCHEDULED'
        )
      `);
    const operationId = String(operationInsert.recordset[0].id);
    fixtures.trackOperation(companyId, operationId);

    const insertOpWorkday = async (wdStart: Date, wdEnd: Date) => {
      const result = await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("operationId", sql.UniqueIdentifier, operationId)
        .input("scheduledStart", sql.DateTime2, wdStart)
        .input("scheduledEnd", sql.DateTime2, wdEnd)
        .query(`
          INSERT INTO operation_workdays (
            company_id, operation_id, work_date, expected_start_at, expected_end_at,
            early_tolerance_minutes, late_tolerance_minutes, schedule_version, status
          )
          OUTPUT INSERTED.id
          VALUES (
            @companyId, @operationId, CAST(@scheduledStart AS DATE),
            @scheduledStart, @scheduledEnd, 120, 120, 1, 'ACTIVE'
          )
        `);
      return String(result.recordset[0].id);
    };

    const operationWorkdayId = await insertOpWorkday(start, end);
    const secondStart = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const secondEnd = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    const secondOperationWorkdayId = await insertOpWorkday(secondStart, secondEnd);

    const workDate = start.toISOString().slice(0, 10);
    const assignmentInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("workDate", sql.Date, workDate)
      .query(`
        INSERT INTO operation_assignments (
          id, company_id, operation_id, employee_id, valid_from, valid_until
        )
        OUTPUT INSERTED.id
        VALUES (NEWID(), @companyId, @operationId, @employeeId, @workDate, DATEADD(day, 2, @workDate))
      `);
    const assignmentId = String(assignmentInsert.recordset[0].id);

    const insertEw = async (operationWorkdayIdValue: string) => {
      const result = await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("operationWorkdayId", sql.UniqueIdentifier, operationWorkdayIdValue)
        .input("employeeId", sql.UniqueIdentifier, employeeId)
        .input("assignmentId", sql.UniqueIdentifier, assignmentId)
        .query(`
          INSERT INTO employee_workdays (
            company_id, operation_workday_id, employee_id, operation_assignment_id,
            expectation_status
          )
          OUTPUT INSERTED.id
          VALUES (
            @companyId, @operationWorkdayId, @employeeId, @assignmentId, N'EXPECTED'
          )
        `);
      return String(result.recordset[0].id);
    };

    const employeeWorkdayId = await insertEw(operationWorkdayId);
    const otherEmployeeWorkdayId = await insertEw(secondOperationWorkdayId);

    return {
      employeeId,
      operationId,
      operationWorkdayId,
      secondOperationWorkdayId,
      employeeWorkdayId,
      otherEmployeeWorkdayId,
      start,
      end,
      secondStart,
      secondEnd,
    };
  };

  it("migration 139 UP / DOWN / UP restores schema", async () => {
    const pool = getPool();

    await apply139Forward();
    let col = await pool.request().query(`
      SELECT COL_LENGTH(N'dbo.attendance_records', N'arrival_source') AS col_len
    `);
    assert.ok(Number(col.recordset[0]?.col_len) > 0);

    // Convert MANUAL arrival-only rows so rollback is not blocked globally.
    await pool.request().query(`
      UPDATE dbo.attendance_records
      SET checkout_at = COALESCE(checkout_at, SYSUTCDATETIME()),
          checkout_status = COALESCE(checkout_status, N'CHECKOUT_VALID'),
          checkout_review_reason = COALESCE(
            checkout_review_reason,
            N'Filled for migration 139 rollback test'
          ),
          early_departure_minutes = COALESCE(early_departure_minutes, 0),
          extra_worked_minutes = COALESCE(extra_worked_minutes, 0)
      WHERE arrival_source = N'MANUAL'
        AND received_at IS NOT NULL
        AND received_latitude IS NULL
        AND checkout_at IS NULL
    `);

    await apply139Rollback();
    col = await pool.request().query(`
      SELECT COL_LENGTH(N'dbo.attendance_records', N'arrival_source') AS col_len
    `);
    assert.equal(col.recordset[0]?.col_len, null);

    const ck = await pool.request().query(`
      SELECT definition
      FROM sys.check_constraints
      WHERE name = N'CK_attendance_records_arrival_or_checkout'
        AND parent_object_id = OBJECT_ID(N'dbo.attendance_records')
    `);
    assert.ok(ck.recordset[0]?.definition);
    assert.equal(String(ck.recordset[0].definition).includes("MANUAL"), false);

    await apply139Forward();
    col = await pool.request().query(`
      SELECT COL_LENGTH(N'dbo.attendance_records', N'arrival_source') AS col_len
    `);
    assert.ok(Number(col.recordset[0]?.col_len) > 0);
  });

  it("creates manual arrival and checkout with MANUAL source and audit", async () => {
    const fixture = await createWorkdayFixture();
    const occurredAt = new Date(fixture.start.getTime() + 5 * 60 * 1000).toISOString();

    const created = await manualAttendanceService.create(companyId, actorUserId, {
      kind: "CHECK_IN",
      operationId: fixture.operationId,
      employeeId: fixture.employeeId,
      employeeWorkdayId: fixture.employeeWorkdayId,
      occurredAt,
      reason: "Sin batería",
      comment: "Contingencia",
    });

    assert.equal(created.arrivalSource, "MANUAL");
    assert.equal(created.receivedLatitude, null);
    assert.equal(created.employeeWorkdayId, fixture.employeeWorkdayId);

    const checkoutAt = new Date(fixture.end.getTime() - 10 * 60 * 1000).toISOString();
    const withCheckout = await manualAttendanceService.create(companyId, actorUserId, {
      kind: "CHECK_OUT",
      operationId: fixture.operationId,
      employeeId: fixture.employeeId,
      employeeWorkdayId: fixture.employeeWorkdayId,
      occurredAt: checkoutAt,
      reason: "Salida manual",
    });
    assert.equal(withCheckout.checkoutSource, "MANUAL");
    assert.equal(withCheckout.checkoutLatitude, null);

    const audits = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("entityId", sql.UniqueIdentifier, created.id)
      .query(`
        SELECT action, reason FROM audit_logs
        WHERE company_id = @companyId AND entity_id = @entityId
        ORDER BY created_at ASC
      `);
    assert.ok(audits.recordset.some((r: { action: string }) => r.action === "MANUAL_CHECK_IN"));
    assert.ok(audits.recordset.some((r: { action: string }) => r.action === "MANUAL_CHECK_OUT"));
  });

  it("allows exit-only then concurrent missing-arrival register has one winner", async () => {
    const fixture = await createWorkdayFixture({ startOffsetMs: 500_000 });
    const checkoutAt = new Date(fixture.end.getTime() - 5 * 60 * 1000).toISOString();
    await manualAttendanceService.create(companyId, actorUserId, {
      kind: "CHECK_OUT",
      operationId: fixture.operationId,
      employeeId: fixture.employeeId,
      employeeWorkdayId: fixture.employeeWorkdayId,
      occurredAt: checkoutAt,
      reason: "Salida sin llegada",
    });

    const arrivalA = new Date(fixture.start.getTime() + 3 * 60 * 1000).toISOString();
    const arrivalB = new Date(fixture.start.getTime() + 4 * 60 * 1000).toISOString();

    const results = await Promise.allSettled([
      manualAttendanceService.create(companyId, actorUserId, {
        kind: "CHECK_IN",
        operationId: fixture.operationId,
        employeeId: fixture.employeeId,
        employeeWorkdayId: fixture.employeeWorkdayId,
        occurredAt: arrivalA,
        reason: "A",
      }),
      manualAttendanceService.create(companyId, actorUserId, {
        kind: "CHECK_IN",
        operationId: fixture.operationId,
        employeeId: fixture.employeeId,
        employeeWorkdayId: fixture.employeeWorkdayId,
        occurredAt: arrivalB,
        reason: "B",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const err = (rejected[0] as PromiseRejectedResult).reason as AppError;
    assert.equal(err.code, "ARRIVAL_ALREADY_EXISTS");
  });

  it("concurrent edits of arrival: exactly one winner with CAS", async () => {
    const fixture = await createWorkdayFixture({ startOffsetMs: 900_000 });
    const occurredAt = new Date(fixture.start.getTime() + 2 * 60 * 1000).toISOString();
    const created = await manualAttendanceService.create(companyId, actorUserId, {
      kind: "CHECK_IN",
      operationId: fixture.operationId,
      employeeId: fixture.employeeId,
      employeeWorkdayId: fixture.employeeWorkdayId,
      occurredAt,
      reason: "Base",
    });
    assert.ok(created.receivedAt);

    const editA = new Date(fixture.start.getTime() + 6 * 60 * 1000).toISOString();
    const editB = new Date(fixture.start.getTime() + 7 * 60 * 1000).toISOString();

    const results = await Promise.allSettled([
      manualAttendanceService.edit(companyId, actorUserId, created.id, {
        kind: "CHECK_IN",
        occurredAt: editA,
        expectedOccurredAt: created.receivedAt!,
        reason: "Edit A",
      }),
      manualAttendanceService.edit(companyId, actorUserId, created.id, {
        kind: "CHECK_IN",
        occurredAt: editB,
        expectedOccurredAt: created.receivedAt!,
        reason: "Edit B",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const err = (rejected[0] as PromiseRejectedResult).reason as AppError;
    assert.equal(err.code, "ATTENDANCE_CONCURRENT_MODIFICATION");

    const audits = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("entityId", sql.UniqueIdentifier, created.id)
      .query(`
        SELECT COUNT(*) AS cnt
        FROM audit_logs
        WHERE company_id = @companyId
          AND entity_id = @entityId
          AND action = N'MANUAL_CHECK_IN_EDIT'
      `);
    assert.equal(Number(audits.recordset[0].cnt), 1);
  });

  it("registers against the explicitly selected historical workday", async () => {
    const fixture = await createWorkdayFixture({ startOffsetMs: 1_200_000 });
    const created = await manualAttendanceService.create(companyId, actorUserId, {
      kind: "CHECK_IN",
      operationId: fixture.operationId,
      employeeId: fixture.employeeId,
      employeeWorkdayId: fixture.otherEmployeeWorkdayId,
      occurredAt: new Date(fixture.secondStart.getTime() + 5 * 60 * 1000).toISOString(),
      reason: "Jornada histórica",
    });
    assert.equal(created.employeeWorkdayId, fixture.otherEmployeeWorkdayId);

    const onFirst = await attendanceRepository.findActiveByEmployeeWorkday(
      companyId,
      fixture.employeeWorkdayId,
    );
    assert.equal(onFirst, null);
  });

  it("persists WHATSAPP source on normal geo check-in path", async () => {
    const fixture = await createWorkdayFixture({ startOffsetMs: 1_500_000 });
    const pool = getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const row = await attendanceRepository.createInTransaction(companyId, tx, {
        operationId: fixture.operationId,
        employeeId: fixture.employeeId,
        employeeWorkdayId: fixture.employeeWorkdayId,
        receivedLatitude: serviceLatitude,
        receivedLongitude: serviceLongitude,
        distanceMeters: 12,
        validationStatus: "VALID",
        locationStatus: "INSIDE_GEOFENCE",
        punctualityStatus: "ON_TIME",
        receivedAt: new Date(fixture.start.getTime() + 1 * 60 * 1000).toISOString(),
        sourceMessageSid: `SM-wa-${randomUUID()}`,
        validationReason: "ok",
      });
      await tx.commit();
      assert.equal(row.arrivalSource, "WHATSAPP");
      assert.ok(row.sourceMessageSid);
    } catch (error) {
      try {
        await tx.rollback();
      } catch {
        // ignore
      }
      throw error;
    }
  });

  it("isolates tenants on edit", async () => {
    const fixture = await createWorkdayFixture({ startOffsetMs: 1_800_000 });
    const created = await manualAttendanceService.create(companyId, actorUserId, {
      kind: "CHECK_IN",
      operationId: fixture.operationId,
      employeeId: fixture.employeeId,
      employeeWorkdayId: fixture.employeeWorkdayId,
      occurredAt: new Date(fixture.start.getTime() + 2 * 60 * 1000).toISOString(),
      reason: "Tenant A",
    });

    const otherCompany = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id
        FROM companies
        WHERE status = 'ACTIVE' AND id <> @companyId
        ORDER BY created_at ASC
      `);
    const otherCompanyId = String(otherCompany.recordset[0]?.id ?? "");
    if (!otherCompanyId) {
      // Single-tenant DB: foreign UUID still must not mutate the row.
      const foreignCompanyId = randomUUID();
      await assert.rejects(
        () =>
          manualAttendanceService.edit(foreignCompanyId, actorUserId, created.id, {
            kind: "CHECK_IN",
            occurredAt: new Date(fixture.start.getTime() + 3 * 60 * 1000).toISOString(),
            expectedOccurredAt: created.receivedAt!,
            reason: "Cross tenant",
          }),
        (error: unknown) => {
          const status = (error as AppError).statusCode;
          assert.ok(status === 403 || status === 404);
          return true;
        },
      );
      return;
    }

    await companySettingsRepository.update(otherCompanyId, {
      allowManualAttendanceCorrections: true,
    });

    await assert.rejects(
      () =>
        manualAttendanceService.edit(otherCompanyId, actorUserId, created.id, {
          kind: "CHECK_IN",
          occurredAt: new Date(fixture.start.getTime() + 3 * 60 * 1000).toISOString(),
          expectedOccurredAt: created.receivedAt!,
          reason: "Cross tenant",
        }),
      (error: unknown) => {
        assert.equal((error as AppError).statusCode, 404);
        return true;
      },
    );

    const unchanged = await attendanceRepository.findById(companyId, created.id);
    assert.equal(unchanged?.receivedAt, created.receivedAt);
  });
});
