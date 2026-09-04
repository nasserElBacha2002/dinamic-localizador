import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { createIntegrationFixtureTracker } from "../test-helpers/integration-cleanup";
import { locationZoneService } from "./location-zone.service";
import { employeeService } from "./employee.service";
import { serviceService } from "./service.service";
import { normalizeLocationZoneName } from "../utils/normalize-location-zone-name";

const uniqueSuffix = (): string => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const uniquePhone = (n: number): string =>
  `+54911${String(Date.now()).slice(-6)}${String(n).padStart(2, "0")}`;

describeDatabaseIntegration("global location zones cross-company", () => {
  const fixtures = createIntegrationFixtureTracker();
  const createdCompanyIds: string[] = [];
  const createdUserEmails: string[] = [];

  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await fixtures.cleanup();
    const pool = getPool();
    for (const companyId of createdCompanyIds) {
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          UPDATE employees SET location_zone_id = NULL WHERE company_id = @companyId;
          UPDATE operational_locations SET location_zone_id = NULL WHERE company_id = @companyId;
          DELETE FROM company_location_zones WHERE company_id = @companyId;
        `);
    }
    await teardownDatabaseIntegration();
  });

  it("cross-company create shares one global zone and two associations", async () => {
    const suffix = uniqueSuffix();
    const zoneName = `Caballito Cross ${suffix}`;
    const fixtureA = await createPlatformCompanyFixture({
      name: `LZ Cross A ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner A", email: `lz-a-${suffix}@integration.test` },
    });
    const fixtureB = await createPlatformCompanyFixture({
      name: `LZ Cross B ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner B", email: `lz-b-${suffix}@integration.test` },
    });
    createdCompanyIds.push(fixtureA.data.company.id, fixtureB.data.company.id);
    createdUserEmails.push(`lz-a-${suffix}@integration.test`, `lz-b-${suffix}@integration.test`);

    const a = await locationZoneService.create(fixtureA.data.company.id, "OWNER", {
      name: zoneName,
      locality: "CABA",
    });
    const b = await locationZoneService.create(fixtureB.data.company.id, "OWNER", {
      name: zoneName.toUpperCase(),
      locality: "caba",
    });

    assert.equal(a.id, b.id);

    const pool = getPool();
    const globals = await pool
      .request()
      .input("normalizedName", sql.NVarChar(120), normalizeLocationZoneName(zoneName))
      .input("normalizedLocality", sql.NVarChar(120), normalizeLocationZoneName("CABA"))
      .query(`
        SELECT COUNT(*) AS c FROM location_zones
        WHERE normalized_name = @normalizedName AND normalized_locality = @normalizedLocality
      `);
    assert.equal(Number(globals.recordset[0].c), 1);

    const associations = await pool
      .request()
      .input("zoneId", sql.UniqueIdentifier, a.id)
      .query(`
        SELECT COUNT(*) AS c FROM company_location_zones WHERE location_zone_id = @zoneId
      `);
    assert.ok(Number(associations.recordset[0].c) >= 2);
  });

  it("same company create twice stays one association", async () => {
    const suffix = uniqueSuffix();
    const zoneName = `Flores Once ${suffix}`;
    const fixture = await createPlatformCompanyFixture({
      name: `LZ Once ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `lz-once-${suffix}@integration.test` },
    });
    createdCompanyIds.push(fixture.data.company.id);

    const first = await locationZoneService.create(fixture.data.company.id, "OWNER", {
      name: zoneName,
      locality: "CABA",
    });
    const second = await locationZoneService.create(fixture.data.company.id, "OWNER", {
      name: ` ${zoneName} `,
      locality: "CABA",
    });
    assert.equal(first.id, second.id);

    const pool = getPool();
    const count = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, fixture.data.company.id)
      .input("zoneId", sql.UniqueIdentifier, first.id)
      .query(`
        SELECT COUNT(*) AS c FROM company_location_zones
        WHERE company_id = @companyId AND location_zone_id = @zoneId
      `);
    assert.equal(Number(count.recordset[0].c), 1);
  });

  it("normalization folds accents into one global row", async () => {
    const suffix = uniqueSuffix();
    const fixture = await createPlatformCompanyFixture({
      name: `LZ Accent ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `lz-accent-${suffix}@integration.test` },
    });
    createdCompanyIds.push(fixture.data.company.id);
    const companyId = fixture.data.company.id;

    const a = await locationZoneService.create(companyId, "OWNER", {
      name: `Núñez ${suffix}`,
      locality: "CABA",
    });
    const b = await locationZoneService.create(companyId, "OWNER", {
      name: `Nunez ${suffix}`,
      locality: "CABA",
    });
    const c = await locationZoneService.create(companyId, "OWNER", {
      name: ` NÚÑEZ ${suffix} `,
      locality: "caba",
    });
    assert.equal(a.id, b.id);
    assert.equal(b.id, c.id);
  });

  it("concurrent creates from two companies leave one global zone", async () => {
    const suffix = uniqueSuffix();
    const zoneName = `Concurrent Caballito ${suffix}`;
    const fixtureA = await createPlatformCompanyFixture({
      name: `LZ Conc A ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner A", email: `lz-ca-${suffix}@integration.test` },
    });
    const fixtureB = await createPlatformCompanyFixture({
      name: `LZ Conc B ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner B", email: `lz-cb-${suffix}@integration.test` },
    });
    createdCompanyIds.push(fixtureA.data.company.id, fixtureB.data.company.id);

    const [left, right] = await Promise.all([
      locationZoneService.create(fixtureA.data.company.id, "OWNER", {
        name: zoneName,
        locality: "CABA",
      }),
      locationZoneService.create(fixtureB.data.company.id, "OWNER", {
        name: zoneName,
        locality: "CABA",
      }),
    ]);
    assert.equal(left.id, right.id);

    const pool = getPool();
    const globals = await pool
      .request()
      .input("normalizedName", sql.NVarChar(120), normalizeLocationZoneName(zoneName))
      .input("normalizedLocality", sql.NVarChar(120), "caba")
      .query(`
        SELECT COUNT(*) AS c FROM location_zones
        WHERE normalized_name = @normalizedName AND normalized_locality = @normalizedLocality
      `);
    assert.equal(Number(globals.recordset[0].c), 1);
  });

  it("inactive association keeps historical employee refs but blocks new assigns", async () => {
    const suffix = uniqueSuffix();
    const fixture = await createPlatformCompanyFixture({
      name: `LZ Hist ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `lz-hist-${suffix}@integration.test` },
    });
    const companyId = fixture.data.company.id;
    createdCompanyIds.push(companyId);

    const zone = await locationZoneService.create(companyId, "OWNER", {
      name: `Almagro Hist ${suffix}`,
      locality: "CABA",
    });

    const employee = await employeeService.create(companyId, {
      name: `Emp Hist ${suffix}`,
      phoneNumber: uniquePhone(1),
      employeeType: "fijo",
      locationZoneId: zone.id,
    });
    fixtures.trackEmployee(companyId, employee.id);

    await locationZoneService.update(companyId, "OWNER", zone.id, { isActive: false });

    const updated = await employeeService.update(companyId, employee.id, {
      phoneNumber: uniquePhone(2),
    });
    assert.equal(updated.locationZoneId, zone.id);

    await assert.rejects(
      () =>
        employeeService.create(companyId, {
          name: `Emp Blocked ${suffix}`,
          phoneNumber: uniquePhone(3),
          employeeType: "fijo",
          locationZoneId: zone.id,
        }),
      (error: unknown) =>
        error instanceof AppError &&
        (error.code === "EMPLOYEE_LOCATION_ZONE_INVALID" || error.statusCode === 400),
    );
  });

  it("company admin cannot edit global fields; platform admin can", async () => {
    const suffix = uniqueSuffix();
    const fixture = await createPlatformCompanyFixture({
      name: `LZ Perm ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `lz-perm-${suffix}@integration.test` },
    });
    const companyId = fixture.data.company.id;
    createdCompanyIds.push(companyId);

    const zone = await locationZoneService.create(companyId, "OWNER", {
      name: `Palermo Perm ${suffix}`,
      locality: "CABA",
    });

    await assert.rejects(
      () =>
        locationZoneService.update(companyId, "OWNER", zone.id, {
          name: `Renamed ${suffix}`,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "FORBIDDEN_GLOBAL_LOCATION_EDIT",
    );

    await assert.rejects(
      () => locationZoneService.geocode(companyId, "OWNER", zone.id, {}),
      (error: unknown) =>
        error instanceof AppError && error.code === "FORBIDDEN_GLOBAL_LOCATION_EDIT",
    );

    const renamed = await locationZoneService.update(
      companyId,
      "OWNER",
      zone.id,
      { name: `Palermo Platform ${suffix}` },
      { isPlatformAdmin: true },
    );
    assert.match(renamed.name, /Palermo Platform/);
  });

  it("company A cannot toggle association belonging only to company B (IDOR)", async () => {
    const suffix = uniqueSuffix();
    const fixtureA = await createPlatformCompanyFixture({
      name: `LZ IDOR A ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner A", email: `lz-idor-a-${suffix}@integration.test` },
    });
    const fixtureB = await createPlatformCompanyFixture({
      name: `LZ IDOR B ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner B", email: `lz-idor-b-${suffix}@integration.test` },
    });
    createdCompanyIds.push(fixtureA.data.company.id, fixtureB.data.company.id);

    const zoneB = await locationZoneService.create(fixtureB.data.company.id, "OWNER", {
      name: `IDOR Zone ${suffix}`,
      locality: "CABA",
    });

    await assert.rejects(
      () =>
        locationZoneService.update(fixtureA.data.company.id, "OWNER", zoneB.id, {
          isActive: false,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "LOCATION_ZONE_NOT_FOUND",
    );
  });
});

describeDatabaseIntegration("global location zones operational location inactive association", () => {
  const createdCompanyIds: string[] = [];

  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    const pool = getPool();
    for (const companyId of createdCompanyIds) {
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          UPDATE operational_locations SET location_zone_id = NULL WHERE company_id = @companyId;
          DELETE FROM company_location_zones WHERE company_id = @companyId;
        `);
    }
    await teardownDatabaseIntegration();
  });

  it("allows unrelated service update after association deactivate; blocks new zone assign", async () => {
    const suffix = uniqueSuffix();
    const fixture = await createPlatformCompanyFixture({
      name: `LZ Svc ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `lz-svc-${suffix}@integration.test` },
    });
    const companyId = fixture.data.company.id;
    createdCompanyIds.push(companyId);

    const zone = await locationZoneService.create(companyId, "OWNER", {
      name: `Boedo Svc ${suffix}`,
      locality: "CABA",
    });

    const service = await serviceService.create(companyId, {
      name: `Sucursal ${suffix}`,
      address: "Av Test 123",
      neighborhood: zone.name,
      locality: "CABA",
      latitude: -34.62,
      longitude: -58.44,
      allowedRadiusMeters: 150,
      active: true,
    });
    assert.equal(service.locationZoneId, zone.id);

    await locationZoneService.update(companyId, "OWNER", zone.id, { isActive: false });

    const updated = await serviceService.update(companyId, service.id, {
      address: "Av Test 456",
    });
    assert.equal(updated.locationZoneId, zone.id);

    await assert.rejects(
      () =>
        serviceService.create(companyId, {
          name: `Sucursal Blocked ${suffix}`,
          address: "Av Otra 1",
          neighborhood: zone.name,
          locality: "CABA",
          latitude: -34.62,
          longitude: -58.44,
          allowedRadiusMeters: 150,
          active: true,
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "LOCATION_ZONE_ASSOCIATION_INACTIVE",
    );
  });
});
