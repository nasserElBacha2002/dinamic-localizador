import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { deleteCompanyCascade } from "../test-helpers/integration-cleanup";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { insertOperationalLocationFixture } from "../test-helpers/operational-location-fixture";
import { employeeService } from "./employee.service";
import { AppError } from "../errors/app-error";
import { teamRecommendationService } from "./team-recommendation.service";
import { WORKFORCE_TEAM_RECOMMENDATION_ALGORITHM_VERSION } from "../constants/workforce-team-recommendation-v1";
import { randomUUID } from "node:crypto";

const uniqueSuffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const uniquePhone = (seed: number): string =>
  `+54911${String(Date.now()).slice(-5)}${String(seed).padStart(3, "0")}${Math.floor(Math.random() * 90 + 10)}`;

const isoDaysAgo = (days: number): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
};

async function createPastOperationWithWorkday(input: {
  companyId: string;
  serviceId: string;
  workDate: string;
  /** Extra minutes so unique index on (service, scheduled_start) never collides. */
  startOffsetMinutes?: number;
}): Promise<{ operationId: string; workdayId: string }> {
  const start = new Date(`${input.workDate}T12:00:00.000Z`);
  start.setUTCMinutes(start.getUTCMinutes() + (input.startOffsetMinutes ?? 0));
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
      VALUES (@companyId, @serviceId, @scheduledStart, @scheduledEnd, 60, 90, N'COMPLETED', N'ONE_TIME')
    `);
  const operationId = String(op.recordset[0].id);

  const wd = await getPool()
    .request()
    .input("companyId", sql.UniqueIdentifier, input.companyId)
    .input("operationId", sql.UniqueIdentifier, operationId)
    .input("workDate", sql.Date, input.workDate)
    .input("expectedStart", sql.DateTime2, start)
    .input("expectedEnd", sql.DateTime2, end)
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

  return { operationId, workdayId: String(wd.recordset[0].id) };
}

async function expectEmployeeOnWorkday(input: {
  companyId: string;
  workdayId: string;
  employeeId: string;
}): Promise<void> {
  await getPool()
    .request()
    .input("companyId", sql.UniqueIdentifier, input.companyId)
    .input("workdayId", sql.UniqueIdentifier, input.workdayId)
    .input("employeeId", sql.UniqueIdentifier, input.employeeId)
    .query(`
      INSERT INTO employee_workdays (
        company_id, operation_workday_id, employee_id, expectation_status
      )
      VALUES (@companyId, @workdayId, @employeeId, N'EXPECTED')
    `);
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

async function assignEmployeeDirect(input: {
  companyId: string;
  operationId: string;
  employeeId: string;
  validFrom: string;
}): Promise<void> {
  await getPool()
    .request()
    .input("id", sql.UniqueIdentifier, randomUUID())
    .input("companyId", sql.UniqueIdentifier, input.companyId)
    .input("operationId", sql.UniqueIdentifier, input.operationId)
    .input("employeeId", sql.UniqueIdentifier, input.employeeId)
    .input("validFrom", sql.Date, input.validFrom)
    .query(`
      INSERT INTO operation_assignments (
        id, company_id, operation_id, employee_id, valid_from,
        confirmation_status, assignment_origin
      )
      VALUES (
        @id, @companyId, @operationId, @employeeId, @validFrom,
        N'CONFIRMED', N'MANUAL'
      )
    `);
}

describeDatabaseIntegration("team recommendations phase3", () => {
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

  it("composes strong affinity cluster ABC for teamSize=3", async () => {
    const suffix = uniqueSuffix();
    const company = await createPlatformCompanyFixture({
      name: `Team Rec ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `team-rec-${suffix}@integration.test` },
    });
    const companyId = company.data.company.id;
    createdCompanyIds.push(companyId);

    const serviceId = await insertOperationalLocationFixture({
      companyId,
      name: `Svc ${suffix}`,
      latitude: -34.6037,
      longitude: -58.3816,
    });

    const createEmp = async (name: string, seed: number) => {
      const emp = await employeeService.create(companyId, {
        name,
        phoneNumber: uniquePhone(seed),
        employeeType: "fijo",
      });
      return emp.id;
    };

    const a = await createEmp(`A ${suffix}`, 1);
    const b = await createEmp(`B ${suffix}`, 2);
    const c = await createEmp(`C ${suffix}`, 3);
    const d = await createEmp(`D ${suffix}`, 4);
    const e = await createEmp(`E ${suffix}`, 5);
    const f = await createEmp(`F ${suffix}`, 6);

    // A-B-C strong cluster across many days
    for (let i = 0; i < 12; i += 1) {
      const { workdayId } = await createPastOperationWithWorkday({
        companyId,
        serviceId,
        workDate: isoDaysAgo(30 + i),
        startOffsetMinutes: i,
      });
      await expectEmployeeOnWorkday({ companyId, workdayId, employeeId: a });
      await expectEmployeeOnWorkday({ companyId, workdayId, employeeId: b });
      await expectEmployeeOnWorkday({ companyId, workdayId, employeeId: c });
    }
    // A-D weak
    {
      const { workdayId } = await createPastOperationWithWorkday({
        companyId,
        serviceId,
        workDate: isoDaysAgo(20),
        startOffsetMinutes: 100,
      });
      await expectEmployeeOnWorkday({ companyId, workdayId, employeeId: a });
      await expectEmployeeOnWorkday({ companyId, workdayId, employeeId: d });
    }
    // E-F separate cluster
    for (let i = 0; i < 8; i += 1) {
      const { workdayId } = await createPastOperationWithWorkday({
        companyId,
        serviceId,
        workDate: isoDaysAgo(40 + i),
        startOffsetMinutes: 200 + i,
      });
      await expectEmployeeOnWorkday({ companyId, workdayId, employeeId: e });
      await expectEmployeeOnWorkday({ companyId, workdayId, employeeId: f });
    }

    const operationId = await createCurrentOperation({ companyId, serviceId });
    const result = await teamRecommendationService.recommendTeamForOperation(
      companyId,
      operationId,
      { teamSize: 3, alternatives: 2 },
    );

    assert.equal(result.algorithmVersion, WORKFORCE_TEAM_RECOMMENDATION_ALGORITHM_VERSION);
    assert.equal(result.requestedTeamSize, 3);
    assert.equal(result.existingMemberCount, 0);
    assert.ok(result.recommendations.length >= 1);
    const top = result.recommendations[0]!;
    const ids = top.members.map((m) => m.employee.id).sort();
    assert.deepEqual(ids, [a, b, c].sort());
    assert.equal(top.complete, true);
    assert.ok(top.score >= 0 && top.score <= 1);
    assert.ok(top.reasons.some((r) => r.code === "TEAM_HISTORY_COVERAGE"));
    assert.equal(
      JSON.stringify(top.members).includes("centroid"),
      false,
    );
    assert.equal(JSON.stringify(result).toLowerCase().includes("phone"), false);

    const again = await teamRecommendationService.recommendTeamForOperation(
      companyId,
      operationId,
      { teamSize: 3, alternatives: 2 },
    );
    assert.deepEqual(
      again.recommendations[0]!.members.map((m) => m.employee.id).sort(),
      ids,
    );
  });

  it("respects existing assignees and fills remaining slots", async () => {
    const suffix = uniqueSuffix();
    const company = await createPlatformCompanyFixture({
      name: `Team Exist ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `team-ex-${suffix}@integration.test` },
    });
    const companyId = company.data.company.id;
    createdCompanyIds.push(companyId);

    const serviceId = await insertOperationalLocationFixture({
      companyId,
      name: `Svc Ex ${suffix}`,
      latitude: -34.6,
      longitude: -58.4,
    });

    const createEmp = async (name: string, seed: number) => {
      const emp = await employeeService.create(companyId, {
        name,
        phoneNumber: uniquePhone(seed),
        employeeType: "fijo",
      });
      return emp.id;
    };

    const a = await createEmp(`A ${suffix}`, 11);
    const b = await createEmp(`B ${suffix}`, 12);
    const c = await createEmp(`C ${suffix}`, 13);
    const d = await createEmp(`D ${suffix}`, 14);
    const e = await createEmp(`E ${suffix}`, 15);

    for (let i = 0; i < 6; i += 1) {
      const { workdayId } = await createPastOperationWithWorkday({
        companyId,
        serviceId,
        workDate: isoDaysAgo(25 + i),
        startOffsetMinutes: i * 3,
      });
      for (const employeeId of [a, b, c, d, e]) {
        await expectEmployeeOnWorkday({ companyId, workdayId, employeeId });
      }
    }

    const operationId = await createCurrentOperation({ companyId, serviceId });
    const validFrom = new Date().toISOString().slice(0, 10);
    await assignEmployeeDirect({ companyId, operationId, employeeId: a, validFrom });
    await assignEmployeeDirect({ companyId, operationId, employeeId: b, validFrom });

    const result = await teamRecommendationService.recommendTeamForOperation(
      companyId,
      operationId,
      { teamSize: 5, alternatives: 1 },
    );

    assert.equal(result.existingMemberCount, 2);
    assert.equal(result.slotsToFill, 3);
    const top = result.recommendations[0]!;
    assert.equal(top.members.length, 5);
    const existing = top.members.filter((m) => m.alreadyAssigned);
    assert.equal(existing.length, 2);
    assert.ok(existing.every((m) => m.employee.id === a || m.employee.id === b));
    const suggested = top.members.filter((m) => !m.alreadyAssigned);
    assert.equal(suggested.length, 3);
    assert.ok(!suggested.some((m) => m.employee.id === a || m.employee.id === b));
  });

  it("errors when insufficient eligible employees", async () => {
    const suffix = uniqueSuffix();
    const company = await createPlatformCompanyFixture({
      name: `Team Insuf ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `team-ins-${suffix}@integration.test` },
    });
    const companyId = company.data.company.id;
    createdCompanyIds.push(companyId);

    const serviceId = await insertOperationalLocationFixture({
      companyId,
      name: `Svc Ins ${suffix}`,
      latitude: -34.6,
      longitude: -58.4,
    });

    await employeeService.create(companyId, {
      name: `Only ${suffix}`,
      phoneNumber: uniquePhone(21),
      employeeType: "fijo",
    });
    await employeeService.create(companyId, {
      name: `Only2 ${suffix}`,
      phoneNumber: uniquePhone(22),
      employeeType: "fijo",
    });

    const operationId = await createCurrentOperation({ companyId, serviceId });

    await assert.rejects(
      () =>
        teamRecommendationService.recommendTeamForOperation(companyId, operationId, {
          teamSize: 10,
          alternatives: 1,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "INSUFFICIENT_ELIGIBLE_EMPLOYEES",
    );
  });

  it("errors when teamSize below existing member count", async () => {
    const suffix = uniqueSuffix();
    const company = await createPlatformCompanyFixture({
      name: `Team Below ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `team-bel-${suffix}@integration.test` },
    });
    const companyId = company.data.company.id;
    createdCompanyIds.push(companyId);

    const serviceId = await insertOperationalLocationFixture({
      companyId,
      name: `Svc Bel ${suffix}`,
      latitude: -34.6,
      longitude: -58.4,
    });

    const a = (
      await employeeService.create(companyId, {
        name: `A ${suffix}`,
        phoneNumber: uniquePhone(31),
        employeeType: "fijo",
      })
    ).id;
    const b = (
      await employeeService.create(companyId, {
        name: `B ${suffix}`,
        phoneNumber: uniquePhone(32),
        employeeType: "fijo",
      })
    ).id;
    const c = (
      await employeeService.create(companyId, {
        name: `C ${suffix}`,
        phoneNumber: uniquePhone(33),
        employeeType: "fijo",
      })
    ).id;

    const operationId = await createCurrentOperation({ companyId, serviceId });
    const validFrom = new Date().toISOString().slice(0, 10);
    await assignEmployeeDirect({ companyId, operationId, employeeId: a, validFrom });
    await assignEmployeeDirect({ companyId, operationId, employeeId: b, validFrom });
    await assignEmployeeDirect({ companyId, operationId, employeeId: c, validFrom });

    await assert.rejects(
      () =>
        teamRecommendationService.recommendTeamForOperation(companyId, operationId, {
          teamSize: 2,
        }),
      (error: unknown) => error instanceof AppError && error.code === "TEAM_SIZE_BELOW_EXISTING",
    );
  });
});
