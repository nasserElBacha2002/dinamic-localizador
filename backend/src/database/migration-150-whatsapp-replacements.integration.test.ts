import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { deleteCompanyCascade } from "../test-helpers/integration-cleanup";
import { insertOperationalLocationFixture } from "../test-helpers/operational-location-fixture";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";

const createdCompanyIds: string[] = [];

describeDatabaseIntegration("migration 150 replacement request tenant constraints", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    for (const companyId of createdCompanyIds.splice(0)) {
      await getPool().request().input("companyId", sql.UniqueIdentifier, companyId).query(`
        DELETE FROM replacement_request_notifications WHERE company_id = @companyId;
        DELETE FROM replacement_request_candidates WHERE company_id = @companyId;
        DELETE FROM replacement_requests WHERE company_id = @companyId;
      `);
      await deleteCompanyCascade(companyId);
    }
    await teardownDatabaseIntegration();
  });

  it("installs composite request ownership foreign keys and workflow checkpoints", async () => {
    const result = await getPool().request().query(`
      SELECT fk.name, COL_NAME(fkc.parent_object_id, fkc.parent_column_id) parent_column,
        COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) referenced_column
      FROM sys.foreign_keys fk
      JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id
      WHERE fk.parent_object_id IN (
        OBJECT_ID(N'dbo.replacement_requests'),
        OBJECT_ID(N'dbo.replacement_request_candidates'),
        OBJECT_ID(N'dbo.replacement_request_notifications')
      )
      ORDER BY fk.name, fkc.constraint_column_id;
    `);
    const tuples = result.recordset.map((row: Record<string, unknown>) =>
      `${String(row.name)}:${String(row.parent_column)}:${String(row.referenced_column)}`,
    );

    assert.ok(tuples.includes("FK_replacement_requests_root:company_id:company_id"));
    assert.ok(tuples.includes("FK_replacement_requests_root:root_request_id:id"));
    assert.ok(tuples.includes("FK_replacement_requests_parent:company_id:company_id"));
    assert.ok(tuples.includes("FK_replacement_requests_parent:parent_request_id:id"));
    assert.ok(tuples.includes("FK_replacement_candidates_request:company_id:company_id"));
    assert.ok(tuples.includes("FK_replacement_candidates_request:request_id:id"));
    assert.ok(tuples.includes("FK_replacement_notifications_request:company_id:company_id"));
    assert.ok(tuples.includes("FK_replacement_notifications_request:request_id:id"));

    const columns = await getPool().request().query(`
      SELECT name FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.replacement_requests')
        AND name IN (N'candidates_materialized_at', N'notifications_materialized_at')
    `);
    assert.equal(columns.recordset.length, 2);
  });

  it("rejects a candidate whose company differs from its request", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const companyA = await createPlatformCompanyFixture({
      name: `Replacement FK A ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner A", email: `replacement-fk-a-${suffix}@integration.test` },
    });
    const companyB = await createPlatformCompanyFixture({
      name: `Replacement FK B ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner B", email: `replacement-fk-b-${suffix}@integration.test` },
    });
    const companyAId = companyA.data.company.id;
    const companyBId = companyB.data.company.id;
    createdCompanyIds.push(companyAId, companyBId);

    const serviceId = await insertOperationalLocationFixture({
      companyId: companyAId,
      name: `Replacement FK service ${suffix}`,
      latitude: -34.6,
      longitude: -58.4,
    });
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const workDate = start.toISOString().slice(0, 10);
    const employeeA = await getPool().request()
      .input("companyId", sql.UniqueIdentifier, companyAId)
      .input("phone", sql.NVarChar(30), `+54911${Math.floor(Math.random() * 9_000_000_000 + 1_000_000_000)}`)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, N'Replacement FK absent', @phone, N'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const employeeB = await getPool().request()
      .input("companyId", sql.UniqueIdentifier, companyBId)
      .input("phone", sql.NVarChar(30), `+54911${Math.floor(Math.random() * 9_000_000_000 + 1_000_000_000)}`)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, N'Replacement FK candidate', @phone, N'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const operation = await getPool().request()
      .input("companyId", sql.UniqueIdentifier, companyAId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("start", sql.DateTime2, start)
      .input("end", sql.DateTime2, end)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, scheduled_start, scheduled_end,
          early_tolerance_minutes, late_tolerance_minutes, status, operation_kind
        ) OUTPUT INSERTED.id
        VALUES (@companyId, @serviceId, @start, @end, 60, 90, N'SCHEDULED', N'ONE_TIME')
      `);
    const workday = await getPool().request()
      .input("companyId", sql.UniqueIdentifier, companyAId)
      .input("operationId", sql.UniqueIdentifier, String(operation.recordset[0].id))
      .input("workDate", sql.Date, workDate)
      .input("start", sql.DateTime2, start)
      .input("end", sql.DateTime2, end)
      .query(`
        INSERT INTO operation_workdays (
          company_id, operation_id, work_date, expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes, schedule_version, status
        ) OUTPUT INSERTED.id
        VALUES (@companyId, @operationId, @workDate, @start, @end, 60, 90, 1, N'ACTIVE')
      `);
    const absentWorkday = await getPool().request()
      .input("companyId", sql.UniqueIdentifier, companyAId)
      .input("workdayId", sql.UniqueIdentifier, String(workday.recordset[0].id))
      .input("employeeId", sql.UniqueIdentifier, String(employeeA.recordset[0].id))
      .query(`
        INSERT INTO employee_workdays (company_id, operation_workday_id, employee_id, expectation_status)
        OUTPUT INSERTED.id
        VALUES (@companyId, @workdayId, @employeeId, N'EXPECTED')
      `);
    const request = await getPool().request()
      .input("companyId", sql.UniqueIdentifier, companyAId)
      .input("workdayId", sql.UniqueIdentifier, String(workday.recordset[0].id))
      .input("absentWorkdayId", sql.UniqueIdentifier, String(absentWorkday.recordset[0].id))
      .input("employeeId", sql.UniqueIdentifier, String(employeeA.recordset[0].id))
      .query(`
        INSERT INTO replacement_requests (
          company_id, operation_workday_id, absent_employee_workday_id, absent_employee_id
        ) OUTPUT INSERTED.id
        VALUES (@companyId, @workdayId, @absentWorkdayId, @employeeId)
      `);

    await assert.rejects(
      getPool().request()
        .input("companyA", sql.UniqueIdentifier, companyAId)
        .input("companyB", sql.UniqueIdentifier, companyBId)
        .input("requestId", sql.UniqueIdentifier, String(request.recordset[0].id))
        .input("employeeId", sql.UniqueIdentifier, String(employeeB.recordset[0].id))
        .query(`INSERT INTO replacement_request_candidates(company_id,request_id,employee_id,rank)
          VALUES (@companyB, @requestId, @employeeId, 3)`),
    );
  });
});
