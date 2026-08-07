/**
 * Phase 1 tenant isolation — SQL Server composite FK evidence.
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 * Requires migrations 087 + 088 (expand/contract for work_team_members).
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
import {
  assertCompositeFkMetadata,
  assertUniqueKeyColumns,
} from "../test-helpers/composite-fk-metadata";

const uniqueCompanyName = (): string =>
  `Phase1Tenant ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const uniquePhone = (): string => `+54911${Date.now().toString().slice(-8)}`;

const isFkViolation = (error: unknown): boolean =>
  Boolean(
    error &&
      typeof error === "object" &&
      "number" in error &&
      (error as { number?: number }).number === 547,
  );

describeDatabaseIntegration("database integrity phase1 tenant composite FKs", () => {
  const createdCompanyIds: string[] = [];
  const fixtures = createIntegrationFixtureTracker();

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
        console.warn("[phase1] company cleanup failed", companyId, error);
      }
    }
    try {
      await fixtures.cleanup();
    } catch (error) {
      console.warn("[phase1] fixtures cleanup failed", error);
    }
    await teardownDatabaseIntegration();
  });

  const seedTwoCompanies = async () => {
    const a = await createPlatformCompanyFixture({
      name: uniqueCompanyName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Phase1 Owner A",
        email: `phase1-a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@integration.test`,
      },
    });
    const b = await createPlatformCompanyFixture({
      name: uniqueCompanyName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Phase1 Owner B",
        email: `phase1-b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@integration.test`,
      },
    });
    createdCompanyIds.push(a.data.company.id, b.data.company.id);
    return { companyA: a.data.company.id, companyB: b.data.company.id };
  };

  const insertEmployee = async (companyId: string, name: string): Promise<string> => {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(20), uniquePhone())
      .input("name", sql.NVarChar(200), name)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, N'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const id = String(result.recordset[0].id);
    fixtures.trackEmployee(companyId, id);
    return id;
  };

  const insertLocation = async (companyId: string): Promise<string> => {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(200), `Loc ${randomUUID().slice(0, 8)}`)
      .query(`
        INSERT INTO operational_locations (
          company_id, name, address, locality, latitude, longitude, allowed_radius_meters, active
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @name, N'Addr', N'CABA', -34.6, -58.4, 150, 1)
      `);
    return String(result.recordset[0].id);
  };

  const insertOperation = async (companyId: string, serviceId: string): Promise<string> => {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, new Date(Date.now() + 86400000))
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, scheduled_start, early_tolerance_minutes,
          late_tolerance_minutes, status, operation_kind
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @serviceId, @scheduledStart, 60, 90, N'SCHEDULED', N'ONE_TIME')
      `);
    const id = String(result.recordset[0].id);
    fixtures.trackOperation(companyId, id);
    return id;
  };

  const vacationTypeId = async (companyId: string): Promise<string> => {
    const type = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM absence_types WHERE company_id = @companyId AND code = N'VACATION'
      `);
    const id = String(type.recordset[0]?.id ?? "");
    assert.ok(id, `VACATION type missing for company ${companyId}`);
    return id;
  };

  const insertAbsenceRequest = async (
    companyId: string,
    employeeId: string,
    absenceTypeId: string,
  ): Promise<string> => {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("absenceTypeId", sql.UniqueIdentifier, absenceTypeId)
      .input("startDate", sql.Date, "2031-06-10")
      .input("endDate", sql.Date, "2031-06-12")
      .query(`
        INSERT INTO absence_requests (
          company_id, employee_id, absence_type_id,
          start_date, end_date, start_period, end_period, total_days,
          reason, status, requested_via, attachment_policy_snapshot
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @employeeId, @absenceTypeId,
          @startDate, @endDate, N'FULL_DAY', N'FULL_DAY', 3,
          N'phase1 same-tenant', N'PENDING', N'ADMIN', N'OPTIONAL'
        )
      `);
    return String(result.recordset[0].id);
  };

  /* --- Cross-tenant families (direct SQL → 547) --- */

  it("rejects cross-tenant attendance_records (employee from other company)", async () => {
    const { companyA, companyB } = await seedTwoCompanies();
    const employeeB = await insertEmployee(companyB, "Emp B");
    const locationA = await insertLocation(companyA);
    const operationA = await insertOperation(companyA, locationA);

    await assert.rejects(
      () =>
        getPool()
          .request()
          .input("companyId", sql.UniqueIdentifier, companyA)
          .input("operationId", sql.UniqueIdentifier, operationA)
          .input("employeeId", sql.UniqueIdentifier, employeeB)
          .query(`
            INSERT INTO attendance_records (
              company_id, operation_id, employee_id,
              received_latitude, received_longitude, distance_meters,
              validation_status, location_status, punctuality_status, received_at, is_simulation
            )
            VALUES (
              @companyId, @operationId, @employeeId,
              -34.6, -58.4, 10, N'VALID', N'INSIDE_GEOFENCE', N'ON_TIME', SYSUTCDATETIME(), 0
            )
          `),
      (error: unknown) => isFkViolation(error),
    );
  });

  it("rejects cross-tenant operation_assignments (operation from other company)", async () => {
    const { companyA, companyB } = await seedTwoCompanies();
    const employeeA = await insertEmployee(companyA, "Emp A");
    const locationB = await insertLocation(companyB);
    const operationB = await insertOperation(companyB, locationB);

    await assert.rejects(
      () =>
        getPool()
          .request()
          .input("companyId", sql.UniqueIdentifier, companyA)
          .input("operationId", sql.UniqueIdentifier, operationB)
          .input("employeeId", sql.UniqueIdentifier, employeeA)
          .query(`
            INSERT INTO operation_assignments (
              id, company_id, operation_id, employee_id,
              valid_from, valid_until, assignment_origin
            )
            VALUES (
              NEWID(), @companyId, @operationId, @employeeId,
              CAST(SYSUTCDATETIME() AS DATE), NULL, N'MANUAL'
            )
          `),
      (error: unknown) => isFkViolation(error),
    );
  });

  it("rejects cross-tenant absence_requests (type from other company)", async () => {
    const { companyA, companyB } = await seedTwoCompanies();
    const employeeA = await insertEmployee(companyA, "Emp Abs");
    const absenceTypeIdB = await vacationTypeId(companyB);

    await assert.rejects(
      () =>
        getPool()
          .request()
          .input("companyId", sql.UniqueIdentifier, companyA)
          .input("employeeId", sql.UniqueIdentifier, employeeA)
          .input("absenceTypeId", sql.UniqueIdentifier, absenceTypeIdB)
          .input("startDate", sql.Date, "2030-01-10")
          .input("endDate", sql.Date, "2030-01-12")
          .query(`
            INSERT INTO absence_requests (
              company_id, employee_id, absence_type_id,
              start_date, end_date, start_period, end_period, total_days,
              reason, status, requested_via, attachment_policy_snapshot
            )
            VALUES (
              @companyId, @employeeId, @absenceTypeId,
              @startDate, @endDate, N'FULL_DAY', N'FULL_DAY', 3,
              N'cross tenant', N'PENDING', N'ADMIN', N'OPTIONAL'
            )
          `),
      (error: unknown) => isFkViolation(error),
    );
  });

  it("rejects cross-tenant absence_request_drafts (employee from other company)", async () => {
    const { companyA, companyB } = await seedTwoCompanies();
    const employeeB = await insertEmployee(companyB, "Draft Emp B");
    const typeA = await vacationTypeId(companyA);

    await assert.rejects(
      () =>
        getPool()
          .request()
          .input("companyId", sql.UniqueIdentifier, companyA)
          .input("employeeId", sql.UniqueIdentifier, employeeB)
          .input("absenceTypeId", sql.UniqueIdentifier, typeA)
          .query(`
            INSERT INTO absence_request_drafts (
              company_id, employee_id, absence_type_id,
              start_date, end_date, start_period, end_period, reason,
              attachment_policy_snapshot, status, expires_at
            )
            VALUES (
              @companyId, @employeeId, @absenceTypeId,
              '2031-07-01', '2031-07-02', N'FULL_DAY', N'FULL_DAY', N'cross',
              N'OPTIONAL', N'OPEN', DATEADD(HOUR, 1, SYSUTCDATETIME())
            )
          `),
      (error: unknown) => isFkViolation(error),
    );
  });

  it("rejects cross-tenant absence_request_attachments (request from other company)", async () => {
    const { companyA, companyB } = await seedTwoCompanies();
    const employeeB = await insertEmployee(companyB, "Att Emp B");
    const typeB = await vacationTypeId(companyB);
    const requestB = await insertAbsenceRequest(companyB, employeeB, typeB);
    const objectKey = `phase1/cross-${randomUUID()}.pdf`;

    await assert.rejects(
      () =>
        getPool()
          .request()
          .input("companyId", sql.UniqueIdentifier, companyA)
          .input("requestId", sql.UniqueIdentifier, requestB)
          .input("objectKey", sql.NVarChar(500), objectKey)
          .query(`
            INSERT INTO absence_request_attachments (
              company_id, absence_request_id, storage_provider, bucket_name, object_key,
              original_file_name, normalized_file_name, declared_content_type, detected_content_type,
              size_bytes, checksum_sha256, status, source
            )
            VALUES (
              @companyId, @requestId, N'GOOGLE_CLOUD_STORAGE', N'test-bucket', @objectKey,
              N'x.pdf', N'x.pdf', N'application/pdf', N'application/pdf',
              10, REPLICATE(N'a', 64), N'AVAILABLE', N'ADMIN'
            )
          `),
      (error: unknown) => isFkViolation(error),
    );
  });

  it("rejects cross-tenant employee_absence_balances (employee from other company)", async () => {
    const { companyA, companyB } = await seedTwoCompanies();
    const employeeB = await insertEmployee(companyB, "Bal Emp B");
    const typeA = await vacationTypeId(companyA);

    await assert.rejects(
      () =>
        getPool()
          .request()
          .input("companyId", sql.UniqueIdentifier, companyA)
          .input("employeeId", sql.UniqueIdentifier, employeeB)
          .input("absenceTypeId", sql.UniqueIdentifier, typeA)
          .query(`
            INSERT INTO employee_absence_balances (
              company_id, employee_id, absence_type_id, year, total_days
            )
            VALUES (@companyId, @employeeId, @absenceTypeId, 2031, 10)
          `),
      (error: unknown) => isFkViolation(error),
    );
  });

  it("rejects cross-tenant bot_sessions (employee from other company)", async () => {
    const { companyA, companyB } = await seedTwoCompanies();
    const employeeB = await insertEmployee(companyB, "Bot Emp B");

    await assert.rejects(
      () =>
        getPool()
          .request()
          .input("companyId", sql.UniqueIdentifier, companyA)
          .input("employeeId", sql.UniqueIdentifier, employeeB)
          .input("phone", sql.NVarChar(30), uniquePhone())
          .query(`
            INSERT INTO bot_sessions (
              company_id, employee_id, phone_number, state, expires_at
            )
            VALUES (
              @companyId, @employeeId, @phone, N'WAITING_LOCATION',
              DATEADD(MINUTE, 15, SYSUTCDATETIME())
            )
          `),
      (error: unknown) => isFkViolation(error),
    );
  });

  it("rejects cross-tenant whatsapp_attendance_notifications (employee from other company)", async () => {
    const { companyA, companyB } = await seedTwoCompanies();
    const employeeB = await insertEmployee(companyB, "Notif Emp B");
    const locationA = await insertLocation(companyA);
    const operationA = await insertOperation(companyA, locationA);

    await assert.rejects(
      () =>
        getPool()
          .request()
          .input("companyId", sql.UniqueIdentifier, companyA)
          .input("employeeId", sql.UniqueIdentifier, employeeB)
          .input("operationId", sql.UniqueIdentifier, operationA)
          .query(`
            INSERT INTO whatsapp_attendance_notifications (
              company_id, employee_id, operation_id, notification_type, status
            )
            VALUES (
              @companyId, @employeeId, @operationId, N'ARRIVAL_REMINDER_15_MIN', N'PENDING'
            )
          `),
      (error: unknown) => isFkViolation(error),
    );
  });

  it("rejects cross-tenant employee_workdays ↔ absence_requests", async () => {
    const { companyA, companyB } = await seedTwoCompanies();
    const employeeA = await insertEmployee(companyA, "Wd Emp A");
    const employeeB = await insertEmployee(companyB, "Wd Emp B");
    const typeB = await vacationTypeId(companyB);
    const requestB = await insertAbsenceRequest(companyB, employeeB, typeB);
    const locationA = await insertLocation(companyA);
    const operationA = await insertOperation(companyA, locationA);
    const start = new Date(Date.now() + 86400000);

    const workday = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyA)
      .input("operationId", sql.UniqueIdentifier, operationA)
      .input("scheduledStart", sql.DateTime2, start)
      .input("scheduledEnd", sql.DateTime2, new Date(start.getTime() + 8 * 3600000))
      .query(`
        INSERT INTO operation_workdays (
          company_id, operation_id, work_date, expected_start_at, expected_end_at,
          early_tolerance_minutes, late_tolerance_minutes, schedule_version, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @operationId, CAST(@scheduledStart AS DATE),
          @scheduledStart, @scheduledEnd, 60, 90, 1, N'ACTIVE'
        )
      `);
    const operationWorkdayId = String(workday.recordset[0].id);

    await assert.rejects(
      () =>
        getPool()
          .request()
          .input("companyId", sql.UniqueIdentifier, companyA)
          .input("employeeId", sql.UniqueIdentifier, employeeA)
          .input("operationWorkdayId", sql.UniqueIdentifier, operationWorkdayId)
          .input("absenceRequestId", sql.UniqueIdentifier, requestB)
          .query(`
            INSERT INTO employee_workdays (
              company_id, operation_workday_id, employee_id,
              expectation_status, absence_request_id
            )
            VALUES (
              @companyId, @operationWorkdayId, @employeeId,
              N'EXPECTED', @absenceRequestId
            )
          `),
      (error: unknown) => isFkViolation(error),
    );
  });

  it("rejects cross-tenant work_team_members (employee from other company)", async () => {
    const { companyA, companyB } = await seedTwoCompanies();
    const employeeB = await insertEmployee(companyB, "Emp Team B");
    const teamA = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyA)
      .input("name", sql.NVarChar(200), `Team ${randomUUID().slice(0, 8)}`)
      .query(`
        INSERT INTO work_teams (company_id, name, normalized_name, is_active)
        OUTPUT INSERTED.id
        VALUES (@companyId, @name, LOWER(@name), 1)
      `);
    const workTeamId = String(teamA.recordset[0].id);

    await assert.rejects(
      () =>
        getPool()
          .request()
          .input("companyId", sql.UniqueIdentifier, companyA)
          .input("workTeamId", sql.UniqueIdentifier, workTeamId)
          .input("employeeId", sql.UniqueIdentifier, employeeB)
          .query(`
            INSERT INTO work_team_members (company_id, work_team_id, employee_id)
            VALUES (@companyId, @workTeamId, @employeeId)
          `),
      (error: unknown) => isFkViolation(error),
    );
  });

  /* --- Same-tenant regression --- */

  it("allows same-tenant attendance_records insert", async () => {
    const { companyA } = await seedTwoCompanies();
    const employeeA = await insertEmployee(companyA, "Emp Same");
    const locationA = await insertLocation(companyA);
    const operationA = await insertOperation(companyA, locationA);

    const inserted = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyA)
      .input("operationId", sql.UniqueIdentifier, operationA)
      .input("employeeId", sql.UniqueIdentifier, employeeA)
      .query(`
        INSERT INTO attendance_records (
          company_id, operation_id, employee_id,
          received_latitude, received_longitude, distance_meters,
          validation_status, location_status, punctuality_status, received_at, is_simulation
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @operationId, @employeeId,
          -34.6, -58.4, 10, N'VALID', N'INSIDE_GEOFENCE', N'ON_TIME', SYSUTCDATETIME(), 0
        )
      `);
    assert.ok(inserted.recordset[0].id);
  });

  it("allows same-tenant work_team_members insert with company_id", async () => {
    const { companyA } = await seedTwoCompanies();
    const employeeA = await insertEmployee(companyA, "Emp Member");
    const teamA = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyA)
      .input("name", sql.NVarChar(200), `TeamOK ${randomUUID().slice(0, 8)}`)
      .query(`
        INSERT INTO work_teams (company_id, name, normalized_name, is_active)
        OUTPUT INSERTED.id
        VALUES (@companyId, @name, LOWER(@name), 1)
      `);
    const workTeamId = String(teamA.recordset[0].id);

    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyA)
      .input("workTeamId", sql.UniqueIdentifier, workTeamId)
      .input("employeeId", sql.UniqueIdentifier, employeeA)
      .query(`
        INSERT INTO work_team_members (company_id, work_team_id, employee_id)
        VALUES (@companyId, @workTeamId, @employeeId)
      `);

    const row = await getPool()
      .request()
      .input("workTeamId", sql.UniqueIdentifier, workTeamId)
      .input("employeeId", sql.UniqueIdentifier, employeeA)
      .query(`
        SELECT company_id FROM work_team_members
        WHERE work_team_id = @workTeamId AND employee_id = @employeeId
      `);
    assert.equal(String(row.recordset[0].company_id).toLowerCase(), companyA.toLowerCase());
  });

  /* --- Metadata: FK columns + parent unique keys --- */

  it("validates composite FK column mapping (not name-only)", async () => {
    const expectations = [
      {
        fkName: "FK_attendance_records_employee_company",
        childTable: "attendance_records",
        childCompanyColumn: "company_id",
        childForeignColumn: "employee_id",
        parentTable: "employees",
        parentCompanyColumn: "company_id",
        parentIdColumn: "id",
      },
      {
        fkName: "FK_attendance_records_operation_company",
        childTable: "attendance_records",
        childCompanyColumn: "company_id",
        childForeignColumn: "operation_id",
        parentTable: "scheduled_operations",
        parentCompanyColumn: "company_id",
        parentIdColumn: "id",
      },
      {
        fkName: "FK_attendance_reviews_attendance_company",
        childTable: "attendance_reviews",
        childCompanyColumn: "company_id",
        childForeignColumn: "attendance_id",
        parentTable: "attendance_records",
        parentCompanyColumn: "company_id",
        parentIdColumn: "id",
      },
      {
        fkName: "FK_operation_assignments_employee_company",
        childTable: "operation_assignments",
        childCompanyColumn: "company_id",
        childForeignColumn: "employee_id",
        parentTable: "employees",
        parentCompanyColumn: "company_id",
        parentIdColumn: "id",
      },
      {
        fkName: "FK_absence_requests_employee_company",
        childTable: "absence_requests",
        childCompanyColumn: "company_id",
        childForeignColumn: "employee_id",
        parentTable: "employees",
        parentCompanyColumn: "company_id",
        parentIdColumn: "id",
      },
      {
        fkName: "FK_ara_request_company",
        childTable: "absence_request_attachments",
        childCompanyColumn: "company_id",
        childForeignColumn: "absence_request_id",
        parentTable: "absence_requests",
        parentCompanyColumn: "company_id",
        parentIdColumn: "id",
      },
      {
        fkName: "FK_ard_employee_company",
        childTable: "absence_request_drafts",
        childCompanyColumn: "company_id",
        childForeignColumn: "employee_id",
        parentTable: "employees",
        parentCompanyColumn: "company_id",
        parentIdColumn: "id",
      },
      {
        fkName: "FK_employee_absence_balances_employee_company",
        childTable: "employee_absence_balances",
        childCompanyColumn: "company_id",
        childForeignColumn: "employee_id",
        parentTable: "employees",
        parentCompanyColumn: "company_id",
        parentIdColumn: "id",
      },
      {
        fkName: "FK_eabm_balance_company",
        childTable: "employee_absence_balance_movements",
        childCompanyColumn: "company_id",
        childForeignColumn: "balance_id",
        parentTable: "employee_absence_balances",
        parentCompanyColumn: "company_id",
        parentIdColumn: "id",
      },
      {
        fkName: "FK_bot_sessions_employee_company",
        childTable: "bot_sessions",
        childCompanyColumn: "company_id",
        childForeignColumn: "employee_id",
        parentTable: "employees",
        parentCompanyColumn: "company_id",
        parentIdColumn: "id",
      },
      {
        fkName: "FK_whatsapp_attendance_notifications_employee_company",
        childTable: "whatsapp_attendance_notifications",
        childCompanyColumn: "company_id",
        childForeignColumn: "employee_id",
        parentTable: "employees",
        parentCompanyColumn: "company_id",
        parentIdColumn: "id",
      },
      {
        fkName: "FK_employee_workdays_absence_request_company",
        childTable: "employee_workdays",
        childCompanyColumn: "company_id",
        childForeignColumn: "absence_request_id",
        parentTable: "absence_requests",
        parentCompanyColumn: "company_id",
        parentIdColumn: "id",
      },
      {
        fkName: "FK_work_team_members_employee_company",
        childTable: "work_team_members",
        childCompanyColumn: "company_id",
        childForeignColumn: "employee_id",
        parentTable: "employees",
        parentCompanyColumn: "company_id",
        parentIdColumn: "id",
      },
      {
        fkName: "FK_work_team_members_team_company",
        childTable: "work_team_members",
        childCompanyColumn: "company_id",
        childForeignColumn: "work_team_id",
        parentTable: "work_teams",
        parentCompanyColumn: "company_id",
        parentIdColumn: "id",
      },
    ] as const;

    for (const expectation of expectations) {
      await assertCompositeFkMetadata(expectation);
    }
  });

  it("validates parent UNIQUE(company_id, id) keys via index metadata", async () => {
    const keys = [
      { indexName: "UQ_employees_company_id", table: "dbo.employees", columns: ["company_id", "id"] as const },
      {
        indexName: "UQ_scheduled_operations_company_id",
        table: "dbo.scheduled_operations",
        columns: ["company_id", "id"] as const,
      },
      {
        indexName: "UQ_attendance_records_company_id",
        table: "dbo.attendance_records",
        columns: ["company_id", "id"] as const,
      },
      { indexName: "UQ_work_teams_company_id", table: "dbo.work_teams", columns: ["company_id", "id"] as const },
      {
        indexName: "UQ_absence_requests_company_id",
        table: "dbo.absence_requests",
        columns: ["company_id", "id"] as const,
      },
      {
        indexName: "UQ_employee_absence_balances_company_id",
        table: "dbo.employee_absence_balances",
        columns: ["company_id", "id"] as const,
      },
    ];

    for (const key of keys) {
      await assertUniqueKeyColumns(key);
    }
  });
});
