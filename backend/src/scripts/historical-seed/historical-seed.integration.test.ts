import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import { randomUUID } from "node:crypto";
import sql from "mssql";
import { getPool } from "../../database/connection";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../../test-helpers/integration-test";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";
import { deleteCompanyCascade } from "../../test-helpers/integration-cleanup";
import { createPlatformCompanyFixture } from "../../test-helpers/platform-company-fixture";
import { employeeService } from "../../services/employee.service";
import { individualRecommendationService } from "../../services/individual-recommendation.service";
import { serviceService } from "../../services/service.service";
import { cleanupHistoricalSeed } from "./cleanup";
import {
  assertBatchNotExists,
  countSeededByBatch,
  executeHistoricalSeed,
  loadSeedCatalog,
} from "./execute";
import { buildBatchMarker, buildOperationNotes, isCycleIntegrationName } from "./markers";
import { planHistoricalSeed } from "./planner";
import type { HistoricalSeedPlan, PlannedOperation, SeedEmployee } from "./types";

const uniqueSuffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const uniquePhone = (seed: number): string =>
  `+54911${String(Date.now()).slice(-5)}${String(seed).padStart(3, "0")}${Math.floor(Math.random() * 90 + 10)}`;

async function createService(
  companyId: string,
  name: string,
  latitude: number,
  longitude: number,
): Promise<string> {
  const created = await serviceService.create(companyId, {
    name,
    address: "Test",
    neighborhood: "Test Zone",
    locality: "CABA",
    latitude,
    longitude,
    allowedRadiusMeters: 150,
  });
  return created.id;
}

async function createCurrentOperation(input: {
  companyId: string;
  serviceId: string;
}): Promise<string> {
  const start = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
  const op = await getPool()
    .request()
    .input("companyId", sql.UniqueIdentifier, input.companyId)
    .input("serviceId", sql.UniqueIdentifier, input.serviceId)
    .input("scheduledStart", sql.DateTime2, start)
    .input("scheduledEnd", sql.DateTime2, end)
    .query(`
      INSERT INTO scheduled_operations (
        company_id, service_id, scheduled_start, scheduled_end,
        early_tolerance_minutes, late_tolerance_minutes, status, operation_kind
      )
      OUTPUT INSERTED.id
      VALUES (@companyId, @serviceId, @scheduledStart, @scheduledEnd, 60, 90, N'SCHEDULED', N'ONE_TIME')
    `);
  return String(op.recordset[0].id);
}

/** Direct assignment insert — no notification outbox. */
async function assignEmployeeWithoutSideEffects(input: {
  companyId: string;
  operationId: string;
  employeeId: string;
  validFrom: string;
  validUntil?: string | null;
}): Promise<void> {
  await getPool()
    .request()
    .input("id", sql.UniqueIdentifier, randomUUID())
    .input("companyId", sql.UniqueIdentifier, input.companyId)
    .input("operationId", sql.UniqueIdentifier, input.operationId)
    .input("employeeId", sql.UniqueIdentifier, input.employeeId)
    .input("validFrom", sql.Date, input.validFrom)
    .input("validUntil", sql.Date, input.validUntil ?? input.validFrom)
    .query(`
      INSERT INTO operation_assignments (
        id, company_id, operation_id, employee_id, valid_from, valid_until,
        confirmation_status, assignment_origin
      )
      VALUES (
        @id, @companyId, @operationId, @employeeId, @validFrom, @validUntil,
        N'CONFIRMED', N'MANUAL'
      )
    `);
}

async function countAssignmentNotifications(companyId: string): Promise<number> {
  const result = await getPool()
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .query(`
      SELECT COUNT(*) AS cnt
      FROM whatsapp_operation_assignment_notifications
      WHERE company_id = @companyId
    `);
  return Number(result.recordset[0]?.cnt ?? 0);
}

const buildControlledAffinityPlan = (input: {
  companyId: string;
  batchId: string;
  serviceId: string;
  empA: SeedEmployee;
  empB: SeedEmployee;
  empC: SeedEmployee;
  empD: SeedEmployee;
  timezone: string;
}): HistoricalSeedPlan => {
  const mkOp = (
    index: number,
    workDate: string,
    members: SeedEmployee[],
  ): PlannedOperation => ({
    index,
    workDate,
    startHour: 9,
    durationHours: 4,
    serviceId: input.serviceId,
    mode: "individual",
    workTeamIndex: null,
    assignments: members.map((e) => ({ employeeId: e.id, attendance: "on_time" as const })),
    label: `affinity-${index}`,
  });

  const operations: PlannedOperation[] = [];
  let i = 0;
  for (let d = 10; d <= 17; d += 1) {
    operations.push(mkOp(i++, `2026-05-${String(d).padStart(2, "0")}`, [input.empA, input.empB]));
  }
  for (let d = 1; d <= 2; d += 1) {
    operations.push(mkOp(i++, `2026-04-${String(d).padStart(2, "0")}`, [input.empA, input.empC]));
  }

  return {
    batchId: input.batchId,
    companyId: input.companyId,
    seed: 42,
    monthsBack: 12,
    timezone: input.timezone,
    clusters: [],
    workTeams: [],
    operations,
    estimates: {
      operations: operations.length,
      workdays: operations.length,
      individualAssignments: operations.reduce((s, o) => s + o.assignments.length, 0),
      teamAssignments: 0,
      employeeWorkdays: operations.reduce((s, o) => s + o.assignments.length, 0),
      attendanceRecords: operations.reduce((s, o) => s + o.assignments.length, 0),
      workTeams: 0,
    },
    expectedStrongPairs: [],
  };
};

describeDatabaseIntegration("historical operation synthetic seed", () => {
  const createdCompanyIds: string[] = [];

  before(async () => {
    setupUnitTestEnv();
    process.env.ALLOW_SYNTHETIC_OPERATION_SEED = "true";
    await setupDatabaseIntegration();
  });

  after(async () => {
    for (const companyId of createdCompanyIds.splice(0)) {
      await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          UPDATE employees SET location_zone_id = NULL WHERE company_id = @companyId;
          UPDATE operational_locations SET location_zone_id = NULL WHERE company_id = @companyId;
          DELETE FROM company_location_zones WHERE company_id = @companyId;
        `);
      await deleteCompanyCascade(companyId);
    }
    await teardownDatabaseIntegration();
  });

  it("seeds historical ops, excludes Cycle integration, cleanup is selective", async () => {
    const suffix = uniqueSuffix();
    const company = await createPlatformCompanyFixture({
      name: `Hist Seed ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `hist-seed-${suffix}@integration.test` },
    });
    const companyId = company.data.company.id;
    createdCompanyIds.push(companyId);

    await createService(companyId, `Svc ${suffix}`, -34.6037, -58.3816);
    await createService(companyId, `Svc2 ${suffix}`, -34.61, -58.39);

    const createEmp = async (name: string, seed: number) =>
      employeeService.create(companyId, {
        name,
        phoneNumber: uniquePhone(seed),
        employeeType: "fijo",
        documentNumber: null,
        categoryId: null,
        locationZoneId: null,
      });

    await createEmp("Cycle integration test", 1);
    await Promise.all([
      createEmp("Seed Alpha", 2),
      createEmp("Seed Bravo", 3),
      createEmp("Seed Charlie", 4),
      createEmp("Seed Delta", 5),
      createEmp("Seed Echo", 6),
      createEmp("Seed Foxtrot", 7),
    ]);

    const catalog = await loadSeedCatalog(companyId);
    assert.equal(catalog.excludedCycleIntegration, 1);
    assert.equal(catalog.employees.length, 6);
    assert.ok(catalog.employees.every((e) => !isCycleIntegrationName(e.name)));
    assert.ok(catalog.services.length >= 2);
    assert.ok(Number.isFinite(catalog.geofenceReviewMarginMeters));

    const batchId = `ai-history-test-${suffix}`;
    const plan = planHistoricalSeed({
      companyId,
      employees: catalog.employees,
      services: catalog.services,
      operations: 10,
      monthsBack: 12,
      seed: 20260814,
      batchId,
      timezone: catalog.timezone,
      todayIso: "2026-08-14",
    });

    assert.equal(plan.operations.length, 10);
    assert.ok(plan.operations.every((o) => o.workDate < "2026-08-14"));

    await assertBatchNotExists(companyId, batchId);
    const result = await executeHistoricalSeed(plan, catalog);
    assert.equal(result.operationsCreated, 10);
    assert.ok(result.workTeamsCreated >= 1);

    const marker = buildBatchMarker(batchId);
    const ops = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("marker", sql.NVarChar(200), marker)
      .query(`
        SELECT COUNT(*) AS cnt FROM scheduled_operations
        WHERE company_id = @companyId
          AND CHARINDEX(@marker, notes) > 0
          AND status = N'COMPLETED'
      `);
    assert.equal(Number(ops.recordset[0].cnt), 10);

    await cleanupHistoricalSeed(companyId, batchId, { dryRun: false });
    const countsAfter = await countSeededByBatch(companyId, batchId);
    assert.equal(countsAfter.operations, 0);
    assert.equal(countsAfter.workTeams, 0);

    const employeesLeft = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`SELECT COUNT(*) AS cnt FROM employees WHERE company_id = @companyId AND active = 1`);
    assert.equal(Number(employeesLeft.recordset[0].cnt), 7);
  });

  it("cleanup matches exact batch only (literal marker, not LIKE)", async () => {
    const suffix = uniqueSuffix();
    const company = await createPlatformCompanyFixture({
      name: `Hist Cleanup ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `hist-clean-${suffix}@integration.test` },
    });
    const companyId = company.data.company.id;
    createdCompanyIds.push(companyId);

    const serviceId = await createService(companyId, `Svc Clean ${suffix}`, -34.6, -58.38);
    const emp = await employeeService.create(companyId, {
      name: "Cleanup Emp",
      phoneNumber: uniquePhone(90),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
      locationZoneId: null,
    });

    const insertOp = async (notes: string, hourOffset: number): Promise<string> => {
      const start = new Date(Date.UTC(2026, 2, 1, 12 + hourOffset, 0, 0));
      const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
      const op = await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("serviceId", sql.UniqueIdentifier, serviceId)
        .input("scheduledStart", sql.DateTime2, start)
        .input("scheduledEnd", sql.DateTime2, end)
        .input("notes", sql.NVarChar(1000), notes)
        .query(`
          INSERT INTO scheduled_operations (
            company_id, service_id, scheduled_start, scheduled_end,
            early_tolerance_minutes, late_tolerance_minutes, status, operation_kind, notes
          )
          OUTPUT INSERTED.id
          VALUES (@companyId, @serviceId, @scheduledStart, @scheduledEnd, 60, 90, N'COMPLETED', N'ONE_TIME', @notes)
        `);
      return String(op.recordset[0].id);
    };

    const batch1 = "ai-history-test-1";
    const batch2 = "ai-history-test-2";
    const id1 = await insertOp(buildOperationNotes(batch1, "synthetic-1"), 0);
    const id2 = await insertOp(buildOperationNotes(batch2, "synthetic-2"), 1);
    const idReal = await insertOp("Operación real AI HISTORY SEED sin marker exacto", 2);

    const dry = await cleanupHistoricalSeed(companyId, batch1, { dryRun: true });
    assert.equal(dry.operationsDeleted, 1);

    await cleanupHistoricalSeed(companyId, batch1, { dryRun: false });

    const remaining = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`SELECT id, notes FROM scheduled_operations WHERE company_id = @companyId`);
    const ids = new Set((remaining.recordset as Array<{ id: string }>).map((r) => String(r.id)));
    assert.equal(ids.has(id1), false);
    assert.ok(ids.has(id2));
    assert.ok(ids.has(idReal));

    const employeesLeft = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, emp.id)
      .query(`SELECT COUNT(*) AS cnt FROM employees WHERE company_id = @companyId AND id = @employeeId`);
    assert.equal(Number(employeesLeft.recordset[0].cnt), 1);

    await cleanupHistoricalSeed(companyId, batch2, { dryRun: false });
  });

  it("assertBatchNotExists detects work-team-only partial batch", async () => {
    const suffix = uniqueSuffix();
    const company = await createPlatformCompanyFixture({
      name: `Hist Teams ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `hist-teams-${suffix}@integration.test` },
    });
    const companyId = company.data.company.id;
    createdCompanyIds.push(companyId);

    const batchId = `ai-history-teams-${suffix}`;
    const marker = buildBatchMarker(batchId);
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, randomUUID())
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(150), `[AI_HISTORY_SEED] ${batchId} Team 001`)
      .input("normalizedName", sql.NVarChar(150), `aihistoryseed ${batchId} team 001`)
      .input("description", sql.NVarChar(500), `${marker} orphan team`)
      .query(`
        INSERT INTO work_teams (id, company_id, name, normalized_name, description, is_active)
        VALUES (@id, @companyId, @name, @normalizedName, @description, 1)
      `);

    await assert.rejects(
      () => assertBatchNotExists(companyId, batchId),
      /BATCH_ALREADY_EXISTS/,
    );

    await cleanupHistoricalSeed(companyId, batchId, { dryRun: false });
    await assertBatchNotExists(companyId, batchId);
  });

  it("seeded affinity patterns rank B above C above D without notification side effects", async () => {
    const suffix = uniqueSuffix();
    const company = await createPlatformCompanyFixture({
      name: `Hist Rank ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `hist-rank-${suffix}@integration.test` },
    });
    const companyId = company.data.company.id;
    createdCompanyIds.push(companyId);

    const serviceId = await createService(companyId, `Svc Rank ${suffix}`, -34.6037, -58.3816);

    const createEmp = async (name: string, seed: number) =>
      employeeService.create(companyId, {
        name,
        phoneNumber: uniquePhone(seed),
        employeeType: "fijo",
        documentNumber: null,
        categoryId: null,
        locationZoneId: null,
      });

    const empA = await createEmp("Rank A", 11);
    const empB = await createEmp("Rank B", 12);
    const empC = await createEmp("Rank C", 13);
    const empD = await createEmp("Rank D", 14);
    await createEmp("Rank Extra1", 15);
    await createEmp("Rank Extra2", 16);

    const catalog = await loadSeedCatalog(companyId);
    const batchId = `ai-history-rank-${suffix}`;
    const plan = buildControlledAffinityPlan({
      companyId,
      batchId,
      serviceId,
      empA: { id: empA.id, name: empA.name },
      empB: { id: empB.id, name: empB.name },
      empC: { id: empC.id, name: empC.name },
      empD: { id: empD.id, name: empD.name },
      timezone: catalog.timezone,
    });

    await executeHistoricalSeed(plan, catalog);

    const currentOperationId = await createCurrentOperation({ companyId, serviceId });
    const notificationsBefore = await countAssignmentNotifications(companyId);
    await assignEmployeeWithoutSideEffects({
      companyId,
      operationId: currentOperationId,
      employeeId: empA.id,
      validFrom: new Date().toISOString().slice(0, 10),
    });
    const notificationsAfter = await countAssignmentNotifications(companyId);
    assert.equal(notificationsAfter, notificationsBefore);

    const result = await individualRecommendationService.recommendEmployees(
      companyId,
      currentOperationId,
      10,
    );

    const ranks = Object.fromEntries(
      result.recommendations.map((item) => [item.employee.id, item.rank]),
    );
    assert.ok(ranks[empB.id]! < ranks[empC.id]!, `expected B ahead of C: ${JSON.stringify(ranks)}`);
    assert.ok(ranks[empC.id]! < ranks[empD.id]!, `expected C ahead of D: ${JSON.stringify(ranks)}`);

    await cleanupHistoricalSeed(companyId, batchId, { dryRun: false });
  });
});
