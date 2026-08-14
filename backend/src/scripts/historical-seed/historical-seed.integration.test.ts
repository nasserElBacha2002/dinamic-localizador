import assert from "node:assert/strict";
import { after, before, it } from "node:test";
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
import { operationAssignmentService } from "../../services/operation-assignment.service";
import { individualRecommendationService } from "../../services/individual-recommendation.service";
import { serviceService } from "../../services/service.service";
import { cleanupHistoricalSeed } from "./cleanup";
import {
  assertBatchNotExists,
  countSeededByBatch,
  executeHistoricalSeed,
  loadSeedCatalog,
} from "./execute";
import { buildBatchMarker, isCycleIntegrationName } from "./markers";
import { planHistoricalSeed } from "./planner";
import type { HistoricalSeedPlan, PlannedOperation, SeedEmployee, SeedService } from "./types";

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
  // empD never co-works with A

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
          DELETE FROM location_zones WHERE company_id = @companyId;
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

    const _serviceId = await createService(companyId, `Svc ${suffix}`, -34.6037, -58.3816);
    const _otherServiceId = await createService(companyId, `Svc2 ${suffix}`, -34.61, -58.39);

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
    const employees = await Promise.all([
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
    assert.ok(plan.workTeams.length >= 1);

    await assertBatchNotExists(companyId, batchId);
    const result = await executeHistoricalSeed(plan, catalog);
    assert.equal(result.operationsCreated, 10);
    assert.equal(result.workdaysCreated, 10);
    assert.ok(result.assignmentsCreated >= 20);
    assert.ok(result.employeeWorkdaysCreated >= 20);
    assert.ok(result.attendanceCreated > 0);
    assert.ok(result.workTeamsCreated >= 1);

    const marker = buildBatchMarker(batchId);
    const ops = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("marker", sql.NVarChar(200), `%${marker}%`)
      .query(`
        SELECT COUNT(*) AS cnt FROM scheduled_operations
        WHERE company_id = @companyId AND notes LIKE @marker AND status = N'COMPLETED'
      `);
    assert.equal(Number(ops.recordset[0].cnt), 10);

    const cycleAssigned = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT COUNT(*) AS cnt
        FROM operation_assignments oa
        INNER JOIN employees e ON e.id = oa.employee_id
        WHERE oa.company_id = @companyId
          AND LOWER(e.name) LIKE N'%cycle integration%'
      `);
    assert.equal(Number(cycleAssigned.recordset[0].cnt), 0);

    const countsBefore = await countSeededByBatch(companyId, batchId);
    assert.equal(countsBefore.operations, 10);

    const dryCleanup = await cleanupHistoricalSeed(companyId, batchId, { dryRun: true });
    assert.equal(dryCleanup.operationsDeleted, 10);
    assert.ok(dryCleanup.attendanceDeleted > 0);

    const cleaned = await cleanupHistoricalSeed(companyId, batchId, { dryRun: false });
    assert.equal(cleaned.operationsDeleted, 10);

    const countsAfter = await countSeededByBatch(companyId, batchId);
    assert.equal(countsAfter.operations, 0);
    assert.equal(countsAfter.workTeams, 0);

    const employeesLeft = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`SELECT COUNT(*) AS cnt FROM employees WHERE company_id = @companyId AND active = 1`);
    assert.equal(Number(employeesLeft.recordset[0].cnt), 7);

    const servicesLeft = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`SELECT COUNT(*) AS cnt FROM operational_locations WHERE company_id = @companyId`);
    assert.equal(Number(servicesLeft.recordset[0].cnt), 2);

    void _serviceId;
    void _otherServiceId;
    void employees;
  });

  it("seeded affinity patterns rank B above C above D in recommendations", async () => {
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
    const service: SeedService = catalog.services.find((s) => s.id === serviceId)!;
    assert.ok(service);

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
    await operationAssignmentService.assignEmployee(companyId, currentOperationId, empA.id);

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
