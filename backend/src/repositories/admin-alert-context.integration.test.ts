/**
 * SQL Server integration for admin-alert context queries.
 *
 * Regression: Invalid object name 'services' — service_id FK → operational_locations.
 * Also asserts functional candidates (unavailable + missing check-in) with real fixtures.
 *
 * Enable: RUN_DB_INTEGRATION_TESTS=true (+ DB_* / JWT_SECRET / FRONTEND_URL / TZ)
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import { adminAlertContextRepository } from "../repositories/admin-alert-context.repository";
import { companyAlertRecipientRepository } from "../repositories/company-alert-recipient.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { deleteCompanyCascade } from "../test-helpers/integration-cleanup";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { insertOperationalLocationFixture } from "../test-helpers/operational-location-fixture";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import {
  buildMissingCheckinDedupKey,
  buildUnavailableDedupKey,
} from "../utils/admin-alert/dedup-keys";

const uniqueCompanyName = (): string =>
  `AdminAlertCtx ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const uniquePhone = (seed: number): string =>
  `+54911${String(Date.now()).slice(-5)}${String(seed).padStart(3, "0")}${Math.floor(Math.random() * 90 + 10)}`;

const eqId = (left: string, right: string): boolean =>
  left.trim().toLowerCase() === right.trim().toLowerCase();

type SeededCompany = {
  companyId: string;
  employeeId: string;
  employeeName: string;
  serviceId: string;
  serviceName: string;
  serviceAddress: string;
  serviceLocality: string;
  recipientId: string;
  recipientPhone: string;
};

describeDatabaseIntegration("admin alert context operational_locations joins", () => {
  const createdCompanyIds: string[] = [];

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    for (const companyId of createdCompanyIds.splice(0)) {
      await deleteCompanyCascade(companyId);
    }
    await teardownDatabaseIntegration();
  });

  const trackCompany = (companyId: string): void => {
    createdCompanyIds.push(companyId);
  };

  /** Align enablement/recipient clocks so past COMPLETED operations still qualify. */
  const backdateAlertWindows = async (
    companyId: string,
    recipientId: string,
    daysAgo = 2,
  ): Promise<void> => {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("recipientId", sql.UniqueIdentifier, recipientId)
      .input("daysAgo", sql.Int, daysAgo)
      .query(`
        UPDATE company_settings
        SET admin_alerts_enabled_at = DATEADD(day, -@daysAgo, SYSUTCDATETIME())
        WHERE company_id = @companyId
          AND admin_alerts_enabled = 1;

        UPDATE company_alert_recipients
        SET created_at = DATEADD(day, -@daysAgo, SYSUTCDATETIME())
        WHERE company_id = @companyId AND id = @recipientId;
      `);
  };

  const seedCompany = async (input?: {
    adminAlertsEnabled?: boolean;
    recipient?: {
      isEnabled?: boolean;
      receiveOperationalAlerts?: boolean;
    };
    serviceName?: string;
    serviceAddress?: string;
    serviceLocality?: string;
    /** When true, move enabled_at/recipient.created_at into the past for COMPLETED ops. */
    backdateAlertWindows?: boolean;
  }): Promise<SeededCompany> => {
    const created = await createPlatformCompanyFixture({
      name: uniqueCompanyName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Admin Alert Ctx Owner",
        email: `admin-alert-ctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@integration.test`,
      },
    });
    const companyId = created.data.company.id;
    trackCompany(companyId);

    const adminAlertsEnabled = input?.adminAlertsEnabled ?? true;
    await companySettingsRepository.update(companyId, { adminAlertsEnabled });

    const serviceName = input?.serviceName ?? `Loc ${randomUUID().slice(0, 8)}`;
    const serviceAddress = input?.serviceAddress ?? "Av. Corrientes 1234";
    const serviceLocality = input?.serviceLocality ?? "CABA";
    const serviceId = await insertOperationalLocationFixture({
      companyId,
      name: serviceName,
      address: serviceAddress,
      latitude: -34.6037,
      longitude: -58.3816,
      allowedRadiusMeters: 150,
    });
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, serviceId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("locality", sql.NVarChar(120), serviceLocality)
      .query(`
        UPDATE operational_locations
        SET locality = @locality
        WHERE id = @id AND company_id = @companyId
      `);

    const employeeName = `Emp ${randomUUID().slice(0, 8)}`;
    const employee = await employeeRepository.create(companyId, {
      name: employeeName,
      phoneNumber: uniquePhone(1),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
    });

    const recipientPhone = uniquePhone(2);
    const recipient = await companyAlertRecipientRepository.create(companyId, {
      phoneNumber: recipientPhone,
      displayName: "Ops Admin",
      isEnabled: input?.recipient?.isEnabled ?? true,
      receiveOperationalAlerts: input?.recipient?.receiveOperationalAlerts ?? true,
      receiveRequestAlerts: false,
      receiveSecurityAlerts: false,
    });

    if (adminAlertsEnabled && input?.backdateAlertWindows) {
      await backdateAlertWindows(companyId, recipient.id);
    }

    return {
      companyId,
      employeeId: employee.id,
      employeeName,
      serviceId,
      serviceName,
      serviceAddress,
      serviceLocality,
      recipientId: recipient.id,
      recipientPhone,
    };
  };

  const insertUnavailableAssignment = async (input: {
    companyId: string;
    serviceId: string;
    employeeId: string;
    unavailableAt?: Date;
    confirmationStatus?: "UNAVAILABLE" | "CONFIRMED" | "PENDING";
  }): Promise<{
    operationId: string;
    assignmentId: string;
    scheduledStart: Date;
    scheduledEnd: Date;
    unavailableAt: Date;
    scheduleVersion: number;
  }> => {
    const scheduledStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const scheduledEnd = new Date(scheduledStart.getTime() + 4 * 60 * 60 * 1000);
    const unavailableAt = input.unavailableAt ?? new Date();
    const workDate = scheduledStart.toISOString().slice(0, 10);

    const operationInsert = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("serviceId", sql.UniqueIdentifier, input.serviceId)
      .input("scheduledStart", sql.DateTime2, scheduledStart)
      .input("scheduledEnd", sql.DateTime2, scheduledEnd)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME', @scheduledStart, @scheduledEnd,
          60, 90, N'SCHEDULED'
        )
      `);
    const operationId = String(operationInsert.recordset[0].id);

    const assignmentInsert = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("workDate", sql.Date, workDate)
      .input("status", sql.NVarChar(30), input.confirmationStatus ?? "UNAVAILABLE")
      .input("unavailableAt", sql.DateTime2, unavailableAt)
      .query(`
        INSERT INTO operation_assignments (
          id, company_id, operation_id, employee_id, valid_from, valid_until,
          confirmation_status, unavailable_at, confirmation_schedule_version
        )
        OUTPUT INSERTED.id, INSERTED.confirmation_schedule_version
        VALUES (
          NEWID(), @companyId, @operationId, @employeeId, @workDate, @workDate,
          @status, @unavailableAt, 1
        )
      `);

    return {
      operationId,
      assignmentId: String(assignmentInsert.recordset[0].id),
      scheduledStart,
      scheduledEnd,
      unavailableAt,
      scheduleVersion: Number(assignmentInsert.recordset[0].confirmation_schedule_version ?? 1),
    };
  };

  const insertCompletedMissingCheckin = async (input: {
    companyId: string;
    serviceId: string;
    employeeId: string;
    confirmationStatus?: "CONFIRMED" | "PENDING" | "UNAVAILABLE";
  }): Promise<{
    operationId: string;
    assignmentId: string;
    employeeWorkdayId: string;
    scheduledStart: Date;
    scheduledEnd: Date;
  }> => {
    // Past window so COMPLETED + occurred_at is stable and ahead of admin_alerts_enabled_at.
    const scheduledStart = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const scheduledEnd = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const workDate = scheduledStart.toISOString().slice(0, 10);

    const operationInsert = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("serviceId", sql.UniqueIdentifier, input.serviceId)
      .input("scheduledStart", sql.DateTime2, scheduledStart)
      .input("scheduledEnd", sql.DateTime2, scheduledEnd)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, operation_kind, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @serviceId, N'ONE_TIME', @scheduledStart, @scheduledEnd,
          60, 90, N'COMPLETED'
        )
      `);
    const operationId = String(operationInsert.recordset[0].id);

    const workdayInsert = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("workDate", sql.Date, workDate)
      .input("expectedStart", sql.DateTime2, scheduledStart)
      .input("expectedEnd", sql.DateTime2, scheduledEnd)
      .query(`
        INSERT INTO operation_workdays (
          company_id, operation_id, work_date, expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes, schedule_version, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @operationId, @workDate, @expectedStart, @expectedEnd,
          60, 90, 1, N'ACTIVE'
        )
      `);
    const operationWorkdayId = String(workdayInsert.recordset[0].id);

    const assignmentInsert = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("workDate", sql.Date, workDate)
      .input("status", sql.NVarChar(30), input.confirmationStatus ?? "CONFIRMED")
      .query(`
        INSERT INTO operation_assignments (
          id, company_id, operation_id, employee_id, valid_from, valid_until,
          confirmation_status, confirmation_schedule_version
        )
        OUTPUT INSERTED.id
        VALUES (
          NEWID(), @companyId, @operationId, @employeeId, @workDate, @workDate,
          @status, 1
        )
      `);
    const assignmentId = String(assignmentInsert.recordset[0].id);

    const ewInsert = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("operationWorkdayId", sql.UniqueIdentifier, operationWorkdayId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
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

    return {
      operationId,
      assignmentId,
      employeeWorkdayId: String(ewInsert.recordset[0].id),
      scheduledStart,
      scheduledEnd,
    };
  };

  const insertValidAttendance = async (input: {
    companyId: string;
    operationId: string;
    employeeId: string;
    employeeWorkdayId: string;
  }): Promise<void> => {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("operationId", sql.UniqueIdentifier, input.operationId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, input.employeeWorkdayId)
      .input("receivedAt", sql.DateTime2, new Date())
      .query(`
        INSERT INTO attendance_records (
          company_id, operation_id, employee_id, employee_workday_id,
          received_latitude, received_longitude, distance_meters,
          validation_status, location_status, punctuality_status, received_at
        )
        VALUES (
          @companyId, @operationId, @employeeId, @employeeWorkdayId,
          -34.6037, -58.3816, 10,
          N'VALID', N'INSIDE_GEOFENCE', N'ON_TIME', @receivedAt
        )
      `);
  };

  it("FK scheduled_operations.service_id references operational_locations", async () => {
    const result = await getPool().request().query(`
      SELECT
        OBJECT_NAME(fk.referenced_object_id) AS referenced_table,
        COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS referenced_column
      FROM sys.foreign_keys fk
      INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
      WHERE fk.parent_object_id = OBJECT_ID(N'dbo.scheduled_operations')
        AND COL_NAME(fkc.parent_object_id, fkc.parent_column_id) = N'service_id'
      ORDER BY referenced_table, referenced_column
    `);

    const tables = new Set(result.recordset.map((row) => String(row.referenced_table)));
    assert.ok(
      tables.has("operational_locations"),
      "expected FK to operational_locations",
    );

    const columns = result.recordset.map((row) => String(row.referenced_column));
    assert.ok(columns.includes("id"));
  });

  it("operational_locations exposes name/address/locality used by admin alerts", async () => {
    const result = await getPool().request().query(`
      SELECT name
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'dbo.operational_locations')
        AND name IN (N'id', N'company_id', N'name', N'address', N'locality')
    `);
    const names = new Set(result.recordset.map((row) => String(row.name)));
    for (const required of ["id", "company_id", "name", "address", "locality"]) {
      assert.ok(names.has(required), `missing column operational_locations.${required}`);
    }
  });

  it("listMissingUnavailableObligations returns operational_locations fields", async () => {
    const seeded = await seedCompany({
      serviceName: "Sucursal Unavailable Norte",
      serviceAddress: "Calle Falsa 123",
      serviceLocality: "Palermo",
    });
    const assignment = await insertUnavailableAssignment({
      companyId: seeded.companyId,
      serviceId: seeded.serviceId,
      employeeId: seeded.employeeId,
    });

    const obligations = await adminAlertContextRepository.listMissingUnavailableObligations(5000);
    const matches = obligations.filter(
      (row) =>
        eqId(row.companyId, seeded.companyId) && eqId(row.operationId, assignment.operationId),
    );

    assert.equal(matches.length, 1);
    const candidate = matches[0]!;
    assert.equal(candidate.alertType, "EMPLOYEE_UNAVAILABLE");
    assert.equal(candidate.category, "OPERATIONAL");
    assert.ok(eqId(candidate.recipientId, seeded.recipientId));
    assert.equal(candidate.recipientPhone, seeded.recipientPhone);
    assert.ok(eqId(candidate.employeeId, seeded.employeeId));
    assert.ok(eqId(candidate.operationId!, assignment.operationId));
    assert.equal(
      candidate.deduplicationKey,
      buildUnavailableDedupKey(assignment.assignmentId, assignment.scheduleVersion),
    );
    assert.equal(candidate.occurredAt, assignment.unavailableAt.toISOString());

    const payload = candidate.payload as {
      employeeName: string;
      serviceName: string;
      serviceAddress: string | null;
      serviceLocality: string | null;
    };
    assert.equal(payload.employeeName, seeded.employeeName);
    assert.equal(payload.serviceName, seeded.serviceName);
    assert.equal(payload.serviceAddress, seeded.serviceAddress);
    assert.equal(payload.serviceLocality, seeded.serviceLocality);
  });

  it("listMissingMissingCheckinObligations uses operational_locations and drops after VALID attendance", async () => {
    const seeded = await seedCompany({
      serviceName: "Sucursal Missing Checkin",
      serviceAddress: "Av. Santa Fe 5000",
      serviceLocality: "Palermo",
      backdateAlertWindows: true,
    });
    const fixture = await insertCompletedMissingCheckin({
      companyId: seeded.companyId,
      serviceId: seeded.serviceId,
      employeeId: seeded.employeeId,
    });

    const before = await adminAlertContextRepository.listMissingMissingCheckinObligations(5000);
    const matchesBefore = before.filter(
      (row) =>
        eqId(row.companyId, seeded.companyId) && eqId(row.operationId, fixture.operationId),
    );
    assert.equal(matchesBefore.length, 1);
    const candidate = matchesBefore[0]!;
    assert.equal(candidate.alertType, "MISSING_CHECKIN_AFTER_OPERATION");
    assert.equal(candidate.category, "OPERATIONAL");
    assert.ok(eqId(candidate.recipientId, seeded.recipientId));
    assert.equal(candidate.recipientPhone, seeded.recipientPhone);
    assert.ok(eqId(candidate.employeeId, seeded.employeeId));
    assert.equal(
      candidate.deduplicationKey,
      buildMissingCheckinDedupKey(fixture.employeeWorkdayId),
    );
    assert.equal(candidate.occurredAt, fixture.scheduledEnd.toISOString());

    const payload = candidate.payload as {
      serviceName: string;
      serviceAddress: string | null;
      serviceLocality: string | null;
    };
    assert.equal(payload.serviceName, seeded.serviceName);
    assert.equal(payload.serviceAddress, seeded.serviceAddress);
    assert.equal(payload.serviceLocality, seeded.serviceLocality);

    await insertValidAttendance({
      companyId: seeded.companyId,
      operationId: fixture.operationId,
      employeeId: seeded.employeeId,
      employeeWorkdayId: fixture.employeeWorkdayId,
    });

    const after = await adminAlertContextRepository.listMissingMissingCheckinObligations(5000);
    const matchesAfter = after.filter(
      (row) =>
        eqId(row.companyId, seeded.companyId) && eqId(row.operationId, fixture.operationId),
    );
    assert.equal(matchesAfter.length, 0);
  });

  it("company and recipient scoping excludes disabled alerts and foreign tenants", async () => {
    const disabledAlerts = await seedCompany({ adminAlertsEnabled: false });
    await insertUnavailableAssignment({
      companyId: disabledAlerts.companyId,
      serviceId: disabledAlerts.serviceId,
      employeeId: disabledAlerts.employeeId,
    });

    const disabledRecipient = await seedCompany({
      recipient: { isEnabled: false, receiveOperationalAlerts: true },
    });
    await insertUnavailableAssignment({
      companyId: disabledRecipient.companyId,
      serviceId: disabledRecipient.serviceId,
      employeeId: disabledRecipient.employeeId,
    });

    const noOperational = await seedCompany({
      recipient: { isEnabled: true, receiveOperationalAlerts: false },
    });
    await insertUnavailableAssignment({
      companyId: noOperational.companyId,
      serviceId: noOperational.serviceId,
      employeeId: noOperational.employeeId,
    });

    const companyA = await seedCompany({ serviceName: "Tenant A Location" });
    const assignmentA = await insertUnavailableAssignment({
      companyId: companyA.companyId,
      serviceId: companyA.serviceId,
      employeeId: companyA.employeeId,
    });

    const companyB = await seedCompany({ serviceName: "Tenant B Location" });
    await insertUnavailableAssignment({
      companyId: companyB.companyId,
      serviceId: companyB.serviceId,
      employeeId: companyB.employeeId,
    });

    const obligations = await adminAlertContextRepository.listMissingUnavailableObligations(5000);

    assert.equal(
      obligations.filter((row) => eqId(row.companyId, disabledAlerts.companyId)).length,
      0,
    );
    assert.equal(
      obligations.filter((row) => eqId(row.companyId, disabledRecipient.companyId)).length,
      0,
    );
    assert.equal(
      obligations.filter((row) => eqId(row.companyId, noOperational.companyId)).length,
      0,
    );

    const forA = obligations.filter((row) => eqId(row.companyId, companyA.companyId));
    const forB = obligations.filter((row) => eqId(row.companyId, companyB.companyId));
    assert.equal(forA.length, 1);
    assert.equal(forB.length, 1);
    assert.ok(eqId(forA[0]!.operationId!, assignmentA.operationId));
    assert.ok(!forA.some((row) => eqId(row.companyId, companyB.companyId)));
    assert.ok(!forB.some((row) => eqId(row.companyId, companyA.companyId)));
    assert.ok(eqId(forA[0]!.recipientId, companyA.recipientId));
    assert.ok(eqId(forB[0]!.recipientId, companyB.recipientId));
  });
});
