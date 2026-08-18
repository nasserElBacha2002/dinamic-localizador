import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { AppError } from "../errors/app-error";
import { getPool } from "../database/connection";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";
import { deleteCompanyCascade } from "../test-helpers/integration-cleanup";
import { locationZoneService } from "./location-zone.service";
import { employeeService } from "./employee.service";
import { employeeRepository } from "../repositories/employee.repository";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { RECOMMENDATION_REASON_CODES, WORKFORCE_RECOMMENDATION_ALGORITHM_VERSION } from "../types/recommendation";

const uniqueSuffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const uniquePhone = (seed: number): string =>
  `+54911${String(Date.now()).slice(-5)}${String(seed).padStart(3, "0")}${Math.floor(Math.random() * 90 + 10)}`;

describeDatabaseIntegration("location zones phase0 corrections", () => {
  const createdCompanyIds: string[] = [];
  const createdUserEmails: string[] = [];

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
    for (const email of createdUserEmails.splice(0)) {
      await getPool()
        .request()
        .input("email", sql.NVarChar(255), email)
        .query(`DELETE FROM users WHERE email = @email`);
    }
    await teardownDatabaseIntegration();
  });

  it("validates migration 094 schema objects", async () => {
    const pool = getPool();
    const table = await pool.request().query(`
      SELECT 1 AS ok FROM sys.tables WHERE name = N'location_zones' AND schema_id = SCHEMA_ID(N'dbo')
    `);
    assert.equal(table.recordset.length, 1);

    const column = await pool.request().query(`
      SELECT is_nullable
      FROM sys.columns
      WHERE object_id = OBJECT_ID(N'dbo.employees') AND name = N'location_zone_id'
    `);
    assert.equal(column.recordset.length, 1);
    assert.equal(Boolean(column.recordset[0].is_nullable), true);

    const fk = await pool.request().query(`
      SELECT 1 AS ok FROM sys.foreign_keys WHERE name = N'FK_employees_location_zone'
    `);
    assert.equal(fk.recordset.length, 1);

    const uq = await pool.request().query(`
      SELECT 1 AS ok FROM sys.indexes
      WHERE name = N'UQ_location_zones_company_normalized_name_locality'
        AND object_id = OBJECT_ID(N'dbo.location_zones')
    `);
    assert.equal(uq.recordset.length, 1);

    const checks = await pool.request().query(`
      SELECT name FROM sys.check_constraints
      WHERE parent_object_id = OBJECT_ID(N'dbo.location_zones')
        AND name IN (
          N'CK_location_zones_centroid_pair',
          N'CK_location_zones_centroid_latitude',
          N'CK_location_zones_centroid_longitude'
        )
    `);
    assert.equal(checks.recordset.length, 3);

    const trigger = await pool.request().query(`
      SELECT 1 AS ok FROM sys.triggers WHERE name = N'TR_employees_location_zone_company_scope'
    `);
    assert.equal(trigger.recordset.length, 1);
  });

  it("enforces inactive historical keep, clear, switch, and rejects new inactive", async () => {
    const suffix = uniqueSuffix();
    const ownerEmail = `zones-corr-${suffix}@integration.test`;
    createdUserEmails.push(ownerEmail);

    const company = await createPlatformCompanyFixture({
      name: `Zones Corr ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: ownerEmail },
    });
    const companyId = company.data.company.id;
    createdCompanyIds.push(companyId);

    const zoneA = await locationZoneService.create(companyId, "OWNER", {
      name: "Caballito",
      locality: "CABA",
    });
    const zoneB = await locationZoneService.create(companyId, "OWNER", {
      name: "Flores",
      locality: "CABA",
    });

    const employee = await employeeService.create(companyId, {
      name: "Histórico",
      phoneNumber: uniquePhone(1),
      employeeType: "fijo",
      locationZoneId: zoneA.id,
    });
    assert.equal(employee.locationZoneId, zoneA.id);

    const preservedActive = await employeeService.update(companyId, employee.id, {
      name: "Histórico Edit",
      locationZoneId: zoneA.id,
    });
    assert.equal(preservedActive.locationZoneId, zoneA.id);

    await locationZoneService.update(companyId, "OWNER", zoneA.id, { isActive: false });

    const preservedInactive = await employeeService.update(companyId, employee.id, {
      phoneNumber: uniquePhone(11),
      locationZoneId: zoneA.id,
    });
    assert.equal(preservedInactive.locationZoneId, zoneA.id);

    const clearedFromInactive = await employeeService.update(companyId, employee.id, {
      locationZoneId: null,
    });
    assert.equal(clearedFromInactive.locationZoneId, null);

    const withActiveB = await employeeService.update(companyId, employee.id, {
      locationZoneId: zoneB.id,
    });
    assert.equal(withActiveB.locationZoneId, zoneB.id);

    const clearedFromActive = await employeeService.update(companyId, employee.id, {
      locationZoneId: null,
    });
    assert.equal(clearedFromActive.locationZoneId, null);

    await assert.rejects(
      () =>
        employeeService.create(companyId, {
          name: "Nuevo inactive",
          phoneNumber: uniquePhone(2),
          employeeType: "fijo",
          locationZoneId: zoneA.id,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "EMPLOYEE_LOCATION_ZONE_INVALID",
    );

    await locationZoneService.update(companyId, "OWNER", zoneB.id, { isActive: false });
    const other = await employeeService.create(companyId, {
      name: "Sin zona",
      phoneNumber: uniquePhone(3),
      employeeType: "fijo",
    });
    await assert.rejects(
      () =>
        employeeService.update(companyId, other.id, {
          locationZoneId: zoneB.id,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "EMPLOYEE_LOCATION_ZONE_INVALID",
    );

    const withA = await employeeService.create(companyId, {
      name: "Con A inactive",
      phoneNumber: uniquePhone(4),
      employeeType: "fijo",
    });
    // Direct SQL assign historical inactive then try switch to different inactive
    await getPool()
      .request()
      .input("employeeId", sql.UniqueIdentifier, withA.id)
      .input("zoneId", sql.UniqueIdentifier, zoneA.id)
      .query(`UPDATE employees SET location_zone_id = @zoneId WHERE id = @employeeId`);

    await assert.rejects(
      () =>
        employeeService.update(companyId, withA.id, {
          locationZoneId: zoneB.id,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "EMPLOYEE_LOCATION_ZONE_INVALID",
    );
  });

  it("rejects cross-company zone via service and DB trigger", async () => {
    const suffix = uniqueSuffix();
    const emailA = `zones-x-a-${suffix}@integration.test`;
    const emailB = `zones-x-b-${suffix}@integration.test`;
    createdUserEmails.push(emailA, emailB);

    const companyA = await createPlatformCompanyFixture({
      name: `Zones XA ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "A", email: emailA },
    });
    const companyB = await createPlatformCompanyFixture({
      name: `Zones XB ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "B", email: emailB },
    });
    createdCompanyIds.push(companyA.data.company.id, companyB.data.company.id);

    const zoneB = await locationZoneService.create(companyB.data.company.id, "OWNER", {
      name: "Palermo",
    });

    await assert.rejects(
      () =>
        employeeService.create(companyA.data.company.id, {
          name: "Cross",
          phoneNumber: uniquePhone(5),
          employeeType: "fijo",
          locationZoneId: zoneB.id,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "EMPLOYEE_LOCATION_ZONE_INVALID",
    );

    await assert.rejects(async () => {
      await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, companyA.data.company.id)
        .input("phone", sql.NVarChar(30), uniquePhone(6))
        .input("zoneId", sql.UniqueIdentifier, zoneB.id)
        .query(`
          INSERT INTO employees (company_id, name, phone_number, employee_type, location_zone_id)
          VALUES (@companyId, N'Trig Bypass', @phone, N'fijo', @zoneId)
        `);
    });
  });

  it("classifies invalid category vs invalid zone on create", async () => {
    const suffix = uniqueSuffix();
    const email = `zones-err-${suffix}@integration.test`;
    createdUserEmails.push(email);
    const company = await createPlatformCompanyFixture({
      name: `Zones Err ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email },
    });
    const companyId = company.data.company.id;
    createdCompanyIds.push(companyId);

    const zone = await locationZoneService.create(companyId, "OWNER", { name: "Almagro" });
    const foreignCategoryId = "00000000-0000-4000-8000-000000000099";

    await assert.rejects(
      () =>
        employeeService.create(companyId, {
          name: "Bad category",
          phoneNumber: uniquePhone(7),
          employeeType: "fijo",
          categoryId: foreignCategoryId,
          locationZoneId: zone.id,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "EMPLOYEE_CATEGORY_INVALID",
    );

    await locationZoneService.update(companyId, "OWNER", zone.id, { isActive: false });
    const categories = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT TOP 1 id FROM employee_categories
        WHERE is_active = 1 AND (company_id IS NULL OR company_id = @companyId)
      `);
    const categoryId = String(categories.recordset[0].id);

    await assert.rejects(
      () =>
        employeeService.create(companyId, {
          name: "Bad zone",
          phoneNumber: uniquePhone(8),
          employeeType: "fijo",
          categoryId,
          locationZoneId: zone.id,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "EMPLOYEE_LOCATION_ZONE_INVALID",
    );
  });

  it("createMany keeps locationZoneId null", async () => {
    const suffix = uniqueSuffix();
    const email = `zones-bulk-${suffix}@integration.test`;
    createdUserEmails.push(email);
    const company = await createPlatformCompanyFixture({
      name: `Zones Bulk ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email },
    });
    const companyId = company.data.company.id;
    createdCompanyIds.push(companyId);

    const created = await employeeService.createManyForImport(companyId, [
      {
        name: "Import Uno",
        phoneNumber: uniquePhone(9),
        employeeType: "fijo",
        locationZoneId: "00000000-0000-4000-8000-000000000001",
      },
    ]);
    assert.equal(created[0]?.locationZoneId, null);

    const viaRepo = await employeeRepository.createMany(companyId, [
      {
        name: "Import Dos",
        documentNumber: null,
        phoneNumber: uniquePhone(10),
        employeeType: "fijo",
        categoryId: null,
      },
    ]);
    assert.equal(viaRepo[0]?.locationZoneId, null);
  });

  it("rejects duplicate normalized zone keys", async () => {
    const suffix = uniqueSuffix();
    const email = `zones-dup-${suffix}@integration.test`;
    createdUserEmails.push(email);
    const company = await createPlatformCompanyFixture({
      name: `Zones Dup ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email },
    });
    const companyId = company.data.company.id;
    createdCompanyIds.push(companyId);

    await locationZoneService.create(companyId, "OWNER", {
      name: "Villa Urquiza",
      locality: "CABA",
    });
    await assert.rejects(
      () =>
        locationZoneService.create(companyId, "OWNER", {
          name: "  villa urquiza ",
          locality: "caba",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "LOCATION_ZONE_NAME_ALREADY_EXISTS",
    );
  });

  it("keeps recommendation contracts as types only", () => {
    assert.equal(WORKFORCE_RECOMMENDATION_ALGORITHM_VERSION, "workforce-recommendation-v1");
    assert.ok(RECOMMENDATION_REASON_CODES.includes("LOCATION_PROXIMITY"));
  });
});
