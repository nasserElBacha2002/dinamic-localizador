import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sql from "mssql";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { createIntegrationFixtureTracker } from "../test-helpers/integration-cleanup";
import { getPool } from "../database/connection";
import { employeeDeactivationService } from "./employee-deactivation.service";
import { employeeService } from "./employee.service";
import { operationAssignmentService } from "./operation-assignment.service";
import { AppError } from "../errors/app-error";
import { employeeDeactivationRepository } from "../repositories/employee-deactivation.repository";

const uniquePhone = (suffix: number): string =>
  `+54911${Date.now().toString().slice(-7)}${suffix}`;

describeDatabaseIntegration("employee assisted deactivation integration", () => {
  const fixtures = createIntegrationFixtureTracker();

  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await fixtures.cleanup();
    await teardownDatabaseIntegration();
  });

  it("deactivates without impact atomically with profile fields", async () => {
    const pool = getPool();
    const companyResult = await pool.request().query(`
      SELECT TOP 1 id FROM companies WHERE status = 'ACTIVE' ORDER BY created_at ASC
    `);
    const companyId = String(companyResult.recordset[0]?.id ?? "");
    assert.ok(companyId);

    const employeeInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(20), uniquePhone(1))
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, N'Deactivation Direct', @phone, 'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const employeeId = String(employeeInsert.recordset[0].id);
    fixtures.trackEmployee(companyId, employeeId);

    const result = await employeeDeactivationService.deactivate(companyId, employeeId, {
      confirmAffectedRelease: false,
      profile: { name: "Deactivation Direct Updated" },
    });

    assert.equal(result.employee.active, false);
    assert.equal(result.employee.name, "Deactivation Direct Updated");
  });

  it("rejects update(active:false) and requires confirmation for future ops", async () => {
    const pool = getPool();
    const companyResult = await pool.request().query(`
      SELECT TOP 1 id FROM companies WHERE status = 'ACTIVE' ORDER BY created_at ASC
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

    const futureStart = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const operationInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, futureStart)
      .input("notes", sql.NVarChar(200), "Inventario futuro")
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, scheduled_start, early_tolerance_minutes,
          late_tolerance_minutes, status, operation_kind, notes
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @serviceId, @scheduledStart, 60, 90, 'SCHEDULED', 'ONE_TIME', @notes)
      `);
    const operationId = String(operationInsert.recordset[0].id);
    fixtures.trackOperation(companyId, operationId);

    const employeeInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(20), uniquePhone(2))
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, N'Deactivation Future', @phone, 'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const employeeId = String(employeeInsert.recordset[0].id);
    fixtures.trackEmployee(companyId, employeeId);

    await operationAssignmentService.assignEmployee(companyId, operationId, employeeId);

    await assert.rejects(
      () => employeeService.update(companyId, employeeId, { active: false }),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "EMPLOYEE_DEACTIVATION_REQUIRES_DEDICATED_ENDPOINT",
    );

    const impact = await employeeDeactivationService.getDeactivationImpact(companyId, employeeId);
    assert.equal(impact.requiresConfirmation, true);
    assert.ok(impact.affectedAssignmentsCount >= 1);
    assert.equal(impact.affectedAssignments[0]?.operationName, "Inventario futuro");

    await assert.rejects(
      () => employeeDeactivationService.deactivate(companyId, employeeId, {
        confirmAffectedRelease: false,
      }),
      (error: unknown) =>
        error instanceof AppError && error.code === "EMPLOYEE_DEACTIVATION_CONFIRMATION_REQUIRED",
    );

    const result = await employeeDeactivationService.deactivate(companyId, employeeId, {
      confirmAffectedRelease: true,
      profile: { name: "Deactivation Future Done" },
    });
    assert.equal(result.employee.active, false);
    assert.ok(result.removedAssignmentIds.length + result.endedAssignments.length >= 1);
  });

  it("blocks concurrent assignment while deactivation holds the employee lock", async () => {
    const pool = getPool();
    const companyResult = await pool.request().query(`
      SELECT TOP 1 id FROM companies WHERE status = 'ACTIVE' ORDER BY created_at ASC
    `);
    const companyId = String(companyResult.recordset[0]?.id ?? "");
    assert.ok(companyId);

    const employeeInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(20), uniquePhone(3))
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, N'Deactivation Race', @phone, 'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const employeeId = String(employeeInsert.recordset[0].id);
    fixtures.trackEmployee(companyId, employeeId);

    const holder = new sql.Transaction(pool);
    await holder.begin();
    try {
      const locked = await employeeDeactivationRepository.lockEmployeeForUpdate(
        companyId,
        employeeId,
        holder,
      );
      assert.ok(locked?.active);

      const contender = new sql.Transaction(pool);
      await contender.begin();
      try {
        await new sql.Request(contender).query(`SET LOCK_TIMEOUT 1000`);
        await assert.rejects(
          () =>
            employeeDeactivationRepository.lockEmployeeForUpdate(companyId, employeeId, contender),
          (error: unknown) =>
            error instanceof Error &&
            (/LOCK_TIMEOUT|1222|timeout/i.test(error.message) ||
              (error as { number?: number }).number === 1222),
        );
      } finally {
        await contender.rollback();
      }

      await new sql.Request(holder)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("employeeId", sql.UniqueIdentifier, employeeId)
        .query(`
          UPDATE employees SET active = 0, updated_at = SYSUTCDATETIME()
          WHERE company_id = @companyId AND id = @employeeId
        `);
      await holder.commit();
    } catch (error) {
      await holder.rollback();
      throw error;
    }

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
        VALUES (@companyId, @serviceId, @scheduledStart, 60, 90, 'SCHEDULED', 'ONE_TIME')
      `);
    const operationId = String(operationInsert.recordset[0].id);
    fixtures.trackOperation(companyId, operationId);

    await assert.rejects(
      () => operationAssignmentService.assignEmployee(companyId, operationId, employeeId),
      (error: unknown) => error instanceof AppError && error.code === "EMPLOYEE_INACTIVE",
    );
  });

  it("rolls back profile+deactivation on phone conflict and stays idempotent when already inactive", async () => {
    const pool = getPool();
    const companyResult = await pool.request().query(`
      SELECT TOP 1 id FROM companies WHERE status = 'ACTIVE' ORDER BY created_at ASC
    `);
    const companyId = String(companyResult.recordset[0]?.id ?? "");
    assert.ok(companyId);

    const existingPhone = uniquePhone(4);
    const existingInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(20), existingPhone)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, N'Phone Owner', @phone, 'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const existingId = String(existingInsert.recordset[0].id);
    fixtures.trackEmployee(companyId, existingId);

    const targetInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(20), uniquePhone(5))
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, N'Phone Target', @phone, 'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const targetId = String(targetInsert.recordset[0].id);
    fixtures.trackEmployee(companyId, targetId);

    await assert.rejects(
      () =>
        employeeDeactivationService.deactivate(companyId, targetId, {
          confirmAffectedRelease: false,
          profile: { phoneNumber: existingPhone, name: "Should Not Persist" },
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "EMPLOYEE_PHONE_ALREADY_EXISTS",
    );

    const afterConflict = await employeeService.getById(companyId, targetId);
    assert.equal(afterConflict.active, true);
    assert.equal(afterConflict.name, "Phone Target");

    const first = await employeeDeactivationService.deactivate(companyId, targetId, {
      confirmAffectedRelease: false,
    });
    assert.equal(first.employee.active, false);

    const second = await employeeDeactivationService.deactivate(companyId, targetId, {
      confirmAffectedRelease: false,
      profile: { name: "Still Inactive" },
    });
    assert.equal(second.employee.active, false);
    assert.equal(second.employee.name, "Still Inactive");
  });
});
