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
import { locationZoneService } from "./location-zone.service";
import { employeeService } from "./employee.service";
import { operationAssignmentService } from "./operation-assignment.service";
import { individualRecommendationService } from "./individual-recommendation.service";
import { AppError } from "../errors/app-error";

const uniqueSuffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const uniquePhone = (seed: number): string =>
  `+54911${String(Date.now()).slice(-5)}${String(seed).padStart(3, "0")}${Math.floor(Math.random() * 90 + 10)}`;

const isoDaysAgo = (days: number): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
};

async function createService(
  companyId: string,
  name: string,
  latitude: number,
  longitude: number,
): Promise<string> {
  const result = await getPool()
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("name", sql.NVarChar(200), name)
    .input("latitude", sql.Decimal(10, 7), latitude)
    .input("longitude", sql.Decimal(10, 7), longitude)
    .query(`
      INSERT INTO operational_locations (
        company_id, name, address, latitude, longitude, allowed_radius_meters, active
      )
      OUTPUT INSERTED.id
      VALUES (@companyId, @name, N'Test', @latitude, @longitude, 150, 1)
    `);
  return String(result.recordset[0].id);
}

async function createPastOperationWithWorkday(input: {
  companyId: string;
  serviceId: string;
  workDate: string;
}): Promise<{ operationId: string; workdayId: string }> {
  const start = new Date(`${input.workDate}T12:00:00.000Z`);
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

describeDatabaseIntegration("individual employee recommendations phase1", () => {
  const createdCompanyIds: string[] = [];

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    for (const companyId of createdCompanyIds.splice(0)) {
      await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          UPDATE employees SET location_zone_id = NULL WHERE company_id = @companyId;
          DELETE FROM location_zones WHERE company_id = @companyId;
        `);
      await deleteCompanyCascade(companyId);
    }
    await teardownDatabaseIntegration();
  });

  it("ranks by historical team affinity on shared active workdays", async () => {
    const suffix = uniqueSuffix();
    const company = await createPlatformCompanyFixture({
      name: `Rec Affinity ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `rec-aff-${suffix}@integration.test` },
    });
    const companyId = company.data.company.id;
    createdCompanyIds.push(companyId);

    const serviceId = await createService(companyId, `Svc ${suffix}`, -34.6037, -58.3816);

    const createEmp = async (name: string, seed: number) =>
      employeeService.create(companyId, {
        name,
        phoneNumber: uniquePhone(seed),
        employeeType: "fijo",
        documentNumber: null,
        categoryId: null,
        locationZoneId: null,
      });

    const empA = await createEmp("Rec A", 1);
    const empB = await createEmp("Rec B", 2);
    const empC = await createEmp("Rec C", 3);
    const empD = await createEmp("Rec D", 4);

    for (let i = 0; i < 4; i += 1) {
      const past = await createPastOperationWithWorkday({
        companyId,
        serviceId,
        workDate: isoDaysAgo(20 + i),
      });
      await expectEmployeeOnWorkday({
        companyId,
        workdayId: past.workdayId,
        employeeId: empA.id,
      });
      await expectEmployeeOnWorkday({
        companyId,
        workdayId: past.workdayId,
        employeeId: empB.id,
      });
    }

    for (let i = 0; i < 1; i += 1) {
      const past = await createPastOperationWithWorkday({
        companyId,
        serviceId,
        workDate: isoDaysAgo(40 + i),
      });
      await expectEmployeeOnWorkday({
        companyId,
        workdayId: past.workdayId,
        employeeId: empA.id,
      });
      await expectEmployeeOnWorkday({
        companyId,
        workdayId: past.workdayId,
        employeeId: empC.id,
      });
    }

    const currentOperationId = await createCurrentOperation({ companyId, serviceId });
    await operationAssignmentService.assignEmployee(companyId, currentOperationId, empA.id);

    const result = await individualRecommendationService.recommendEmployees(
      companyId,
      currentOperationId,
      10,
    );

    assert.equal(result.algorithmVersion, "workforce-recommendation-v1");
    const ranks = Object.fromEntries(
      result.recommendations.map((item) => [item.employee.id, item.rank]),
    );
    assert.ok(ranks[empB.id]! < ranks[empC.id]!);
    assert.ok(ranks[empC.id]! < ranks[empD.id]!);
    assert.equal(
      result.recommendations.find((item) => item.employee.id === empA.id),
      undefined,
    );

    const bReasons = result.recommendations.find((item) => item.employee.id === empB.id)?.reasons;
    assert.ok(bReasons?.some((reason) => reason.code === "TEAM_AFFINITY"));
  });

  it("ranks closer residence zones higher when affinity is equal", async () => {
    const suffix = uniqueSuffix();
    const company = await createPlatformCompanyFixture({
      name: `Rec Loc ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `rec-loc-${suffix}@integration.test` },
    });
    const companyId = company.data.company.id;
    createdCompanyIds.push(companyId);

    const serviceLat = -34.6037;
    const serviceLon = -58.3816;
    const serviceId = await createService(companyId, `Svc Loc ${suffix}`, serviceLat, serviceLon);

    const closeZone = await locationZoneService.create(companyId, "OWNER", {
      name: "Cerca",
      locality: "CABA",
      centroidLatitude: serviceLat + 0.005,
      centroidLongitude: serviceLon,
    });
    const farZone = await locationZoneService.create(companyId, "OWNER", {
      name: "Lejos",
      locality: "CABA",
      centroidLatitude: serviceLat + 0.25,
      centroidLongitude: serviceLon,
    });

    const empA = await employeeService.create(companyId, {
      name: "Loc A",
      phoneNumber: uniquePhone(11),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
      locationZoneId: null,
    });
    const empClose = await employeeService.create(companyId, {
      name: "Loc Close",
      phoneNumber: uniquePhone(12),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
      locationZoneId: closeZone.id,
    });
    const empFar = await employeeService.create(companyId, {
      name: "Loc Far",
      phoneNumber: uniquePhone(13),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
      locationZoneId: farZone.id,
    });

    const currentOperationId = await createCurrentOperation({ companyId, serviceId });
    await operationAssignmentService.assignEmployee(companyId, currentOperationId, empA.id);

    const result = await individualRecommendationService.recommendEmployees(
      companyId,
      currentOperationId,
      10,
    );
    const closeRank = result.recommendations.find((item) => item.employee.id === empClose.id)?.rank;
    const farRank = result.recommendations.find((item) => item.employee.id === empFar.id)?.rank;
    assert.ok(closeRank !== undefined && farRank !== undefined);
    assert.ok(closeRank < farRank);
    assert.ok(
      result.recommendations
        .find((item) => item.employee.id === empClose.id)
        ?.reasons.some((reason) => reason.code === "LOCATION_PROXIMITY"),
    );
  });

  it("surfaces SERVICE_EXPERIENCE for prior workdays on the same service", async () => {
    const suffix = uniqueSuffix();
    const company = await createPlatformCompanyFixture({
      name: `Rec Svc ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `rec-svc-${suffix}@integration.test` },
    });
    const companyId = company.data.company.id;
    createdCompanyIds.push(companyId);

    const serviceId = await createService(companyId, `Svc Exp ${suffix}`, -34.6, -58.38);
    const otherServiceId = await createService(companyId, `Other ${suffix}`, -34.61, -58.39);

    const empA = await employeeService.create(companyId, {
      name: "Svc A",
      phoneNumber: uniquePhone(21),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
      locationZoneId: null,
    });
    const empExp = await employeeService.create(companyId, {
      name: "Svc Exp",
      phoneNumber: uniquePhone(22),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
      locationZoneId: null,
    });
    const empNone = await employeeService.create(companyId, {
      name: "Svc None",
      phoneNumber: uniquePhone(23),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
      locationZoneId: null,
    });

    for (let i = 0; i < 3; i += 1) {
      const past = await createPastOperationWithWorkday({
        companyId,
        serviceId,
        workDate: isoDaysAgo(15 + i),
      });
      await expectEmployeeOnWorkday({
        companyId,
        workdayId: past.workdayId,
        employeeId: empExp.id,
      });
    }

    const otherPast = await createPastOperationWithWorkday({
      companyId,
      serviceId: otherServiceId,
      workDate: isoDaysAgo(10),
    });
    await expectEmployeeOnWorkday({
      companyId,
      workdayId: otherPast.workdayId,
      employeeId: empNone.id,
    });

    const currentOperationId = await createCurrentOperation({ companyId, serviceId });
    await operationAssignmentService.assignEmployee(companyId, currentOperationId, empA.id);

    const result = await individualRecommendationService.recommendEmployees(
      companyId,
      currentOperationId,
      10,
    );
    const exp = result.recommendations.find((item) => item.employee.id === empExp.id);
    const none = result.recommendations.find((item) => item.employee.id === empNone.id);
    assert.ok(exp && none);
    assert.ok(exp.rank < none.rank);
    assert.ok(exp.reasons.some((reason) => reason.code === "SERVICE_EXPERIENCE"));
  });

  it("excludes inactive, already assigned, and cancelled operations", async () => {
    const suffix = uniqueSuffix();
    const company = await createPlatformCompanyFixture({
      name: `Rec Elig ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `rec-elig-${suffix}@integration.test` },
    });
    const companyId = company.data.company.id;
    createdCompanyIds.push(companyId);

    const serviceId = await createService(companyId, `Svc Elig ${suffix}`, -34.6, -58.38);
    const empA = await employeeService.create(companyId, {
      name: "Elig A",
      phoneNumber: uniquePhone(31),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
      locationZoneId: null,
    });
    const empInactive = await employeeService.create(companyId, {
      name: "Elig Inactive",
      phoneNumber: uniquePhone(32),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
      locationZoneId: null,
    });
    await getPool()
      .request()
      .input("employeeId", sql.UniqueIdentifier, empInactive.id)
      .query(`UPDATE employees SET active = 0, updated_at = SYSUTCDATETIME() WHERE id = @employeeId`);

    const currentOperationId = await createCurrentOperation({ companyId, serviceId });
    await operationAssignmentService.assignEmployee(companyId, currentOperationId, empA.id);

    const result = await individualRecommendationService.recommendEmployees(
      companyId,
      currentOperationId,
      50,
    );
    assert.equal(
      result.recommendations.some((item) => item.employee.id === empA.id),
      false,
    );
    assert.equal(
      result.recommendations.some((item) => item.employee.id === empInactive.id),
      false,
    );

    await getPool()
      .request()
      .input("operationId", sql.UniqueIdentifier, currentOperationId)
      .query(`UPDATE scheduled_operations SET status = N'CANCELLED' WHERE id = @operationId`);

    await assert.rejects(
      () => individualRecommendationService.recommendEmployees(companyId, currentOperationId, 10),
      (error: unknown) =>
        error instanceof AppError && error.code === "OPERATION_NOT_ASSIGNABLE",
    );
  });

  it("does not count cancelled expectations as co-occurrence", async () => {
    const suffix = uniqueSuffix();
    const company = await createPlatformCompanyFixture({
      name: `Rec Cancelled ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `rec-can-${suffix}@integration.test` },
    });
    const companyId = company.data.company.id;
    createdCompanyIds.push(companyId);

    const serviceId = await createService(companyId, `Svc Can ${suffix}`, -34.6, -58.38);
    const empA = await employeeService.create(companyId, {
      name: "Can A",
      phoneNumber: uniquePhone(41),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
      locationZoneId: null,
    });
    const empGhost = await employeeService.create(companyId, {
      name: "Can Ghost",
      phoneNumber: uniquePhone(42),
      employeeType: "fijo",
      documentNumber: null,
      categoryId: null,
      locationZoneId: null,
    });

    const past = await createPastOperationWithWorkday({
      companyId,
      serviceId,
      workDate: isoDaysAgo(12),
    });
    await expectEmployeeOnWorkday({
      companyId,
      workdayId: past.workdayId,
      employeeId: empA.id,
    });
    await expectEmployeeOnWorkday({
      companyId,
      workdayId: past.workdayId,
      employeeId: empGhost.id,
    });
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("workdayId", sql.UniqueIdentifier, past.workdayId)
      .input("employeeId", sql.UniqueIdentifier, empGhost.id)
      .query(`
        UPDATE employee_workdays
        SET expectation_status = N'CANCELLED', cancellation_reason = N'ASSIGNMENT'
        WHERE company_id = @companyId
          AND operation_workday_id = @workdayId
          AND employee_id = @employeeId
      `);

    const currentOperationId = await createCurrentOperation({ companyId, serviceId });
    await operationAssignmentService.assignEmployee(companyId, currentOperationId, empA.id);

    const result = await individualRecommendationService.recommendEmployees(
      companyId,
      currentOperationId,
      10,
    );
    const ghost = result.recommendations.find((item) => item.employee.id === empGhost.id);
    assert.ok(ghost);
    assert.equal(
      ghost.reasons.some((reason) => reason.code === "TEAM_AFFINITY"),
      false,
    );
  });
});
