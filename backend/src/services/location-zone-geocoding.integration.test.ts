import assert from "node:assert/strict";
import { after, before, it, mock } from "node:test";
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
import { locationZoneRepository } from "../repositories/location-zone.repository";
import { locationZoneService } from "./location-zone.service";
import { locationZoneGeocodingService } from "./location-zone-geocoding.service";

const uniqueSuffix = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describeDatabaseIntegration("location zone geocoding phase A corrections", () => {
  const createdCompanyIds: string[] = [];
  const createdUserEmails: string[] = [];

  before(async () => {
    setupUnitTestEnv();
    await setupDatabaseIntegration();
  });

  after(async () => {
    mock.restoreAll();
    for (const companyId of createdCompanyIds.splice(0)) {
      await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          UPDATE employees SET location_zone_id = NULL WHERE company_id = @companyId;
          DELETE FROM company_location_zones WHERE company_id = @companyId;
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

  it("validates migration 106 geocoding columns and constraints", async () => {
    const pool = getPool();
    const columns = await pool.request().query(`
      SELECT name FROM sys.columns
      WHERE object_id = OBJECT_ID(N'dbo.location_zones')
        AND name IN (
          N'geocoding_status',
          N'geocoding_source',
          N'geocoded_at',
          N'geocoding_last_error'
        )
    `);
    assert.equal(columns.recordset.length, 4);

    const checks = await pool.request().query(`
      SELECT name FROM sys.check_constraints
      WHERE parent_object_id = OBJECT_ID(N'dbo.location_zones')
        AND name IN (
          N'CK_location_zones_geocoding_status',
          N'CK_location_zones_geocoding_source',
          N'CK_location_zones_geocoding_status_requires_centroid',
          N'CK_location_zones_geocoding_status_source_coherence'
        )
    `);
    assert.equal(
      checks.recordset.length,
      4,
      "expected enum + integrity constraints from 106 (fresh) and/or 107 (upgrade)",
    );
  });

  it("rejects RESOLVED/MANUAL without centroids and incoherent status/source", async () => {
    const pool = getPool();
    const suffix = uniqueSuffix();
    const ownerEmail = `zone-geo-ck-${suffix}@integration.test`;
    createdUserEmails.push(ownerEmail);
    const fixture = await createPlatformCompanyFixture({
      name: `Zone Geo CK ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: ownerEmail },
    });
    const companyId = fixture.data.company.id;
    createdCompanyIds.push(companyId);

    await assert.rejects(async () => {
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          INSERT INTO location_zones (
name, normalized_name, locality, normalized_locality,
            geocoding_status, geocoding_source, is_active
          ) VALUES (
            N'NoCentroid', N'nocentroid', N'CABA', N'caba',
            N'RESOLVED', N'AUTO', 1
          )
        `);
    });

    await assert.rejects(async () => {
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          INSERT INTO location_zones (
name, normalized_name, locality, normalized_locality,
            centroid_latitude, centroid_longitude,
            geocoding_status, geocoding_source, is_active
          ) VALUES (
            N'BadManual', N'badmanual', N'CABA', N'caba',
            -34.6, -58.4, N'MANUAL', N'AUTO', 1
          )
        `);
    });
  });

  it("rejects invalid geocoding_status / geocoding_source at SQL level", async () => {
    const pool = getPool();
    const suffix = uniqueSuffix();
    const ownerEmail = `zone-geo-ck-${suffix}@integration.test`;
    createdUserEmails.push(ownerEmail);
    const fixture = await createPlatformCompanyFixture({
      name: `Zone Geo CK ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: ownerEmail },
    });
    const companyId = fixture.data.company.id;
    createdCompanyIds.push(companyId);

    await assert.rejects(async () => {
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          INSERT INTO location_zones (
name, normalized_name, locality, normalized_locality,
            geocoding_status, is_active
          ) VALUES (
            N'BadStatus', N'badstatus', N'CABA', N'caba',
            N'WEIRD', 1
          )
        `);
    });

    await assert.rejects(async () => {
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          INSERT INTO location_zones (
name, normalized_name, locality, normalized_locality,
            geocoding_source, is_active
          ) VALUES (
            N'BadSource', N'badsource', N'CABA', N'caba',
            N'WEIRD', 1
          )
        `);
    });
  });

  it("does not let AUTO geocode overwrite MANUAL centroids", async () => {
    const suffix = uniqueSuffix();
    const ownerEmail = `zone-geo-manual-${suffix}@integration.test`;
    createdUserEmails.push(ownerEmail);
    const fixture = await createPlatformCompanyFixture({
      name: `Zone Geo Manual ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: ownerEmail },
    });
    const companyId = fixture.data.company.id;
    createdCompanyIds.push(companyId);

    const zone = await locationZoneService.create(companyId, "OWNER", {
      name: `Manual Caballito ${suffix}`,
      locality: "CABA",
      centroidLatitude: -34.62,
      centroidLongitude: -58.44,
    });
    assert.equal(zone.geocodingStatus, "MANUAL");

    const applied = await locationZoneRepository.applyGeocodeResult(
      zone.id,
      {
        centroidLatitude: -34.5,
        centroidLongitude: -58.5,
        geocodingStatus: "RESOLVED",
        geocodingSource: "AUTO",
        geocodedAt: new Date(),
        geocodingLastError: null,
      },
      {
        expectedNormalizedName: zone.normalizedName,
        expectedNormalizedLocality: zone.normalizedLocality,
        expectedUpdatedAt: zone.updatedAt,
        allowManualOverride: false,
      },
    );
    assert.equal(applied, null);

    const refreshed = await locationZoneRepository.findByIdForCompany(companyId, zone.id);
    assert.ok(refreshed);
    assert.equal(refreshed.geocodingStatus, "MANUAL");
    assert.equal(refreshed.centroidLatitude, -34.62);
    assert.equal(refreshed.centroidLongitude, -58.44);
  });

  it("does not persist AUTO result when normalized key became stale", async () => {
    const suffix = uniqueSuffix();
    const ownerEmail = `zone-geo-stale-${suffix}@integration.test`;
    createdUserEmails.push(ownerEmail);
    const fixture = await createPlatformCompanyFixture({
      name: `Zone Geo Stale ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: ownerEmail },
    });
    const companyId = fixture.data.company.id;
    createdCompanyIds.push(companyId);

    const zone = await locationZoneService.create(companyId, "OWNER", {
      name: `Stale Caballito ${suffix}`,
      locality: "CABA",
    });

    const renamed = await locationZoneService.update(
      companyId,
      "OWNER",
      zone.id,
      { name: `Stale Boedo ${suffix}` },
      { isPlatformAdmin: true },
    );
    assert.equal(renamed.normalizedName, `stale boedo ${suffix}`.toLowerCase());
    assert.equal(renamed.centroidLatitude, null);
    assert.equal(renamed.geocodingStatus, "PENDING");

    const applied = await locationZoneRepository.applyGeocodeResult(
      zone.id,
      {
        centroidLatitude: -34.62,
        centroidLongitude: -58.44,
        geocodingStatus: "RESOLVED",
        geocodingSource: "AUTO",
        geocodedAt: new Date(),
        geocodingLastError: null,
      },
      {
        expectedNormalizedName: zone.normalizedName,
        expectedNormalizedLocality: zone.normalizedLocality,
        expectedUpdatedAt: zone.updatedAt,
        allowManualOverride: false,
      },
    );
    assert.equal(applied, null);

    const refreshed = await locationZoneRepository.findByIdForCompany(companyId, zone.id);
    assert.ok(refreshed);
    assert.equal(refreshed.normalizedName, renamed.normalizedName);
    assert.equal(refreshed.centroidLatitude, null);
    assert.equal(refreshed.geocodingStatus, "PENDING");
  });

  it("treats historical non-null centroids without status as MANUAL-compatible after 106", async () => {
    const pool = getPool();
    const suffix = uniqueSuffix();
    const ownerEmail = `zone-geo-hist-${suffix}@integration.test`;
    createdUserEmails.push(ownerEmail);
    const fixture = await createPlatformCompanyFixture({
      name: `Zone Geo Hist ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: ownerEmail },
    });
    const companyId = fixture.data.company.id;
    createdCompanyIds.push(companyId);

    const normalizedName = `hist ${suffix}`;
    const normalizedLocality = "caba";

    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(120), `Hist ${suffix}`)
      .input("normalizedName", sql.NVarChar(120), normalizedName)
      .input("locality", sql.NVarChar(120), "CABA")
      .input("normalizedLocality", sql.NVarChar(120), normalizedLocality)
      .query(`
        DECLARE @zoneId UNIQUEIDENTIFIER = NEWID();

        INSERT INTO location_zones (
          id, name, normalized_name, locality, normalized_locality,
          centroid_latitude, centroid_longitude, geocoding_status, geocoding_source, is_active
        ) VALUES (
          @zoneId, @name, @normalizedName, @locality, @normalizedLocality,
          -34.6000000, -58.3800000, NULL, NULL, 1
        );

        INSERT INTO company_location_zones (company_id, location_zone_id, is_active)
        VALUES (@companyId, @zoneId, 1);

        UPDATE dbo.location_zones
        SET
          geocoding_status = N'MANUAL',
          geocoding_source = N'MANUAL',
          geocoded_at = COALESCE(geocoded_at, updated_at),
          geocoding_last_error = NULL
        WHERE id = @zoneId
          AND normalized_name = @normalizedName
          AND centroid_latitude IS NOT NULL
          AND centroid_longitude IS NOT NULL
          AND geocoding_status IS NULL;
      `);

    const zone = await locationZoneRepository.findByNormalizedKey(normalizedName, normalizedLocality);
    assert.ok(zone);
    assert.equal(zone.geocodingStatus, "MANUAL");
    assert.equal(zone.geocodingSource, "MANUAL");
    assert.ok(zone.centroidLatitude !== null);
  });

  it("force=true still rejects stale normalized key (0 write)", async () => {
    const suffix = uniqueSuffix();
    const ownerEmail = `zone-geo-force-stale-${suffix}@integration.test`;
    createdUserEmails.push(ownerEmail);
    const fixture = await createPlatformCompanyFixture({
      name: `Zone Geo Force Stale ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: ownerEmail },
    });
    const companyId = fixture.data.company.id;
    createdCompanyIds.push(companyId);

    const zone = await locationZoneService.create(companyId, "OWNER", {
      name: `Force Stale Boedo ${suffix}`,
      locality: "CABA",
      centroidLatitude: -34.63,
      centroidLongitude: -58.41,
    });
    assert.equal(zone.geocodingStatus, "MANUAL");
    assert.equal(zone.normalizedName, `force stale boedo ${suffix}`.toLowerCase());

    const renamed = await locationZoneService.update(
      companyId,
      "OWNER",
      zone.id,
      { name: `Force Stale Caballito ${suffix}` },
      { isPlatformAdmin: true },
    );
    assert.equal(renamed.normalizedName, `force stale caballito ${suffix}`.toLowerCase());
    // MANUAL rename preserves centroids
    assert.equal(renamed.centroidLatitude, -34.63);
    assert.equal(renamed.geocodingStatus, "MANUAL");

    const applied = await locationZoneRepository.applyGeocodeResult(
      zone.id,
      {
        centroidLatitude: -34.5,
        centroidLongitude: -58.5,
        geocodingStatus: "RESOLVED",
        geocodingSource: "AUTO",
        geocodedAt: new Date(),
        geocodingLastError: null,
      },
      {
        expectedNormalizedName: zone.normalizedName,
        expectedNormalizedLocality: zone.normalizedLocality,
        expectedUpdatedAt: zone.updatedAt,
        allowManualOverride: true,
      },
    );
    assert.equal(applied, null);

    const refreshed = await locationZoneRepository.findByIdForCompany(companyId, zone.id);
    assert.ok(refreshed);
    assert.equal(refreshed.normalizedName, renamed.normalizedName);
    assert.equal(refreshed.geocodingStatus, "MANUAL");
    assert.equal(refreshed.centroidLatitude, -34.63);
    assert.equal(refreshed.centroidLongitude, -58.41);
  });

  it("force=true does not overwrite concurrent MANUAL centroid update (same key)", async () => {
    const suffix = uniqueSuffix();
    const ownerEmail = `zone-geo-force-conc-${suffix}@integration.test`;
    createdUserEmails.push(ownerEmail);
    const fixture = await createPlatformCompanyFixture({
      name: `Zone Geo Force Conc ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: ownerEmail },
    });
    const companyId = fixture.data.company.id;
    createdCompanyIds.push(companyId);

    const zone = await locationZoneService.create(companyId, "OWNER", {
      name: `Force Conc Boedo ${suffix}`,
      locality: "CABA",
      centroidLatitude: -34.63,
      centroidLongitude: -58.41,
    });
    assert.equal(zone.geocodingStatus, "MANUAL");
    const snapshotUpdatedAt = zone.updatedAt;

    // Concurrent admin B updates MANUAL coordinates (same name/locality).
    const concurrent = await locationZoneService.update(
      companyId,
      "OWNER",
      zone.id,
      {
        centroidLatitude: -34.7,
        centroidLongitude: -58.5,
      },
      { isPlatformAdmin: true },
    );
    assert.equal(concurrent.geocodingStatus, "MANUAL");
    assert.equal(concurrent.centroidLatitude, -34.7);
    assert.notEqual(concurrent.updatedAt, snapshotUpdatedAt);

    const applied = await locationZoneRepository.applyGeocodeResult(
      zone.id,
      {
        centroidLatitude: -34.5,
        centroidLongitude: -58.5,
        geocodingStatus: "RESOLVED",
        geocodingSource: "AUTO",
        geocodedAt: new Date(),
        geocodingLastError: null,
      },
      {
        expectedNormalizedName: zone.normalizedName,
        expectedNormalizedLocality: zone.normalizedLocality,
        expectedUpdatedAt: snapshotUpdatedAt,
        allowManualOverride: true,
      },
    );
    assert.equal(applied, null);

    const refreshed = await locationZoneRepository.findByIdForCompany(companyId, zone.id);
    assert.ok(refreshed);
    assert.equal(refreshed.geocodingStatus, "MANUAL");
    assert.equal(refreshed.geocodingSource, "MANUAL");
    assert.equal(refreshed.centroidLatitude, -34.7);
    assert.equal(refreshed.centroidLongitude, -58.5);
  });

  it("force success replaces MANUAL; force failure preserves MANUAL centroids", async () => {
    const suffix = uniqueSuffix();
    const ownerEmail = `zone-geo-force-fail-${suffix}@integration.test`;
    createdUserEmails.push(ownerEmail);
    const fixture = await createPlatformCompanyFixture({
      name: `Zone Geo Force Fail ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: ownerEmail },
    });
    const companyId = fixture.data.company.id;
    createdCompanyIds.push(companyId);

    const zone = await locationZoneService.create(companyId, "OWNER", {
      name: `Force Fail Boedo ${suffix}`,
      locality: "CABA",
      centroidLatitude: -34.63,
      centroidLongitude: -58.41,
    });
    assert.equal(zone.geocodingStatus, "MANUAL");

    mock.method(globalThis, "fetch", async () =>
      new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const failed = await locationZoneGeocodingService.geocodeZone(zone, {
      apiKey: "test-key",
      force: true,
    });
    assert.equal(failed.outcome, "FAILED");

    const afterFail = await locationZoneRepository.findByIdForCompany(companyId, zone.id);
    assert.ok(afterFail);
    assert.equal(afterFail.geocodingStatus, "MANUAL");
    assert.equal(afterFail.geocodingSource, "MANUAL");
    assert.equal(afterFail.centroidLatitude, -34.63);
    assert.equal(afterFail.centroidLongitude, -58.41);

    mock.restoreAll();
    mock.method(globalThis, "fetch", async () =>
      new Response(
        JSON.stringify({
          status: "OK",
          results: [
            {
              formatted_address: `Force Fail Boedo ${suffix}, CABA`,
              address_components: [
                { long_name: "Argentina", short_name: "AR", types: ["country"] },
                {
                  long_name: "Ciudad Autónoma de Buenos Aires",
                  short_name: "CABA",
                  types: ["administrative_area_level_1"],
                },
              ],
              geometry: { location: { lat: -34.625, lng: -58.415 } },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    // Reload after the failed attempt so optimistic concurrency uses the DB snapshot
    // (create-time updatedAt can diverge from DATETIME2(7) by sub-ms truncation).
    const resolved = await locationZoneGeocodingService.geocodeZone(afterFail, {
      apiKey: "test-key",
      force: true,
    });
    assert.equal(resolved.outcome, "RESOLVED");

    const afterOk = await locationZoneRepository.findByIdForCompany(companyId, zone.id);
    assert.ok(afterOk);
    assert.equal(afterOk.geocodingStatus, "RESOLVED");
    assert.equal(afterOk.geocodingSource, "AUTO");
    assert.equal(afterOk.centroidLatitude, -34.625);
    assert.equal(afterOk.centroidLongitude, -58.415);

    mock.restoreAll();
  });

  it("rejects RESOLVED without centroid and MANUAL without MANUAL source at SQL", async () => {
    const pool = getPool();
    const suffix = uniqueSuffix();
    const ownerEmail = `zone-geo-inv-${suffix}@integration.test`;
    createdUserEmails.push(ownerEmail);
    const fixture = await createPlatformCompanyFixture({
      name: `Zone Geo Inv ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: ownerEmail },
    });
    const companyId = fixture.data.company.id;
    createdCompanyIds.push(companyId);

    // Ensure additive constraints exist (106 amended and/or 107).
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_location_zones_geocoding_status_requires_centroid'
          AND parent_object_id = OBJECT_ID(N'dbo.location_zones')
      )
      BEGIN
        ALTER TABLE dbo.location_zones
          ADD CONSTRAINT CK_location_zones_geocoding_status_requires_centroid CHECK (
            geocoding_status IS NULL
            OR geocoding_status NOT IN (N'RESOLVED', N'MANUAL')
            OR (centroid_latitude IS NOT NULL AND centroid_longitude IS NOT NULL)
          );
      END;

      IF NOT EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_location_zones_geocoding_status_source_coherence'
          AND parent_object_id = OBJECT_ID(N'dbo.location_zones')
      )
      BEGIN
        ALTER TABLE dbo.location_zones
          ADD CONSTRAINT CK_location_zones_geocoding_status_source_coherence CHECK (
            (
              geocoding_status IS NULL
              OR geocoding_status <> N'MANUAL'
              OR geocoding_source = N'MANUAL'
            )
            AND (
              geocoding_status IS NULL
              OR geocoding_status <> N'RESOLVED'
              OR geocoding_source = N'AUTO'
            )
          );
      END;
    `);

    await assert.rejects(async () => {
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          INSERT INTO location_zones (
name, normalized_name, locality, normalized_locality,
            geocoding_status, geocoding_source, is_active
          ) VALUES (
            N'ResolvedNull', N'resolvednull', N'CABA', N'caba',
            N'RESOLVED', N'AUTO', 1
          )
        `);
    });

    await assert.rejects(async () => {
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          INSERT INTO location_zones (
name, normalized_name, locality, normalized_locality,
            centroid_latitude, centroid_longitude,
            geocoding_status, geocoding_source, is_active
          ) VALUES (
            N'ManualBadSrc', N'manualbadsrc', N'CABA', N'caba',
            -34.6, -58.4, N'MANUAL', N'AUTO', 1
          )
        `);
    });
  });
});
