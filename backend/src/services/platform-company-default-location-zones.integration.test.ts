import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import {
  DEFAULT_GENERIC_LOCATION_ZONE_SEEDS,
  resolveDefaultGenericLocationZoneNormalizedKeys,
} from "../constants/default-location-zones";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { companyRepository } from "../repositories/company.repository";
import { userRepository } from "../repositories/user.repository";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { createPlatformCompanyFixture } from "../test-helpers/platform-company-fixture";
import { createIntegrationFixtureTracker } from "../test-helpers/integration-cleanup";
import { companyLocationZoneDefaultsService } from "./company-location-zone-defaults.service";
import { locationZoneRepository } from "../repositories/location-zone.repository";
import { platformCompanyService } from "./platform-company.service";
import {
  normalizeLocationZoneLocality,
  normalizeLocationZoneName,
} from "../utils/normalize-location-zone-name";
import { withDedicatedSessionAppLock } from "../utils/whatsapp-retention-lock";

const INTEGRATION_GLOBAL_LOCATION_ZONES_CATALOG_LOCK =
  "integration:global-location-zones-catalog";

const uniqueSuffix = (): string => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const expectedDefaultZoneCount = (): number => DEFAULT_GENERIC_LOCATION_ZONE_SEEDS.length;

const assertCompanyLocationZonesCompanyZoneUniqueKey = async (): Promise<void> => {
  const pool = getPool();
  const result = await pool.request().query(`
    SELECT c.name AS column_name, ic.key_ordinal
    FROM sys.key_constraints kc
    INNER JOIN sys.index_columns ic
      ON kc.parent_object_id = ic.object_id AND kc.unique_index_id = ic.index_id
    INNER JOIN sys.columns c
      ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE kc.parent_object_id = OBJECT_ID(N'dbo.company_location_zones')
      AND kc.type = N'UQ'
      AND kc.name = N'UQ_company_location_zones_company_zone'
    ORDER BY ic.key_ordinal
  `);
  const columns = (result.recordset as Array<{ column_name: string }>).map(
    (row) => row.column_name,
  );
  assert.deepEqual(columns, ["company_id", "location_zone_id"]);
};

const withGlobalLocationZonesCatalogMutationLock = async <T>(
  fn: () => Promise<T>,
): Promise<T> => {
  const locked = await withDedicatedSessionAppLock(
    INTEGRATION_GLOBAL_LOCATION_ZONES_CATALOG_LOCK,
    fn,
    { lockTimeoutMs: 60_000 },
  );
  assert.equal(locked.outcome, "locked", "global location_zones catalog lock not acquired");
  return (locked as { outcome: "locked"; value: T }).value;
};

describeDatabaseIntegration("platform company default location zones", () => {
  const fixtures = createIntegrationFixtureTracker();
  const createdCompanyIds: string[] = [];

  before(async () => {
    await setupDatabaseIntegration();
    await assertCompanyLocationZonesCompanyZoneUniqueKey();
  });

  after(async () => {
    await fixtures.cleanup();
    const pool = getPool();
    for (const companyId of createdCompanyIds) {
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`DELETE FROM company_location_zones WHERE company_id = @companyId`);
    }
    await teardownDatabaseIntegration();
  });

  it("creates exactly all default generic zone associations when a company is created", async () => {
    const suffix = uniqueSuffix();
    const result = await createPlatformCompanyFixture({
      name: `Default LZ Co ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `default-lz-${suffix}@integration.test` },
    });
    createdCompanyIds.push(result.data.company.id);

    const zones = await locationZoneRepository.listForCompany(result.data.company.id, {
      includeInactive: false,
    });
    assert.equal(zones.length, expectedDefaultZoneCount());

    const caballito = zones.find(
      (z) =>
        z.normalizedName === normalizeLocationZoneName("Caballito") &&
        z.normalizedLocality === normalizeLocationZoneLocality("CABA"),
    );
    assert.ok(caballito);
    assert.equal(caballito.associationActive, true);
  });

  it("keeps tenant-scoped associations isolated across companies", async () => {
    const suffix = uniqueSuffix();
    const fixtureA = await createPlatformCompanyFixture({
      name: `LZ Tenant A ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner A", email: `lz-tenant-a-${suffix}@integration.test` },
    });
    const fixtureB = await createPlatformCompanyFixture({
      name: `LZ Tenant B ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner B", email: `lz-tenant-b-${suffix}@integration.test` },
    });
    createdCompanyIds.push(fixtureA.data.company.id, fixtureB.data.company.id);

    const zonesA = await locationZoneRepository.listForCompany(fixtureA.data.company.id, {
      includeInactive: false,
    });
    const zonesB = await locationZoneRepository.listForCompany(fixtureB.data.company.id, {
      includeInactive: false,
    });
    assert.equal(zonesA.length, expectedDefaultZoneCount());
    assert.equal(zonesB.length, expectedDefaultZoneCount());

    const pool = getPool();
    const caballitoKeyName = normalizeLocationZoneName("Caballito");
    const caballitoKeyLocality = normalizeLocationZoneLocality("CABA");

    const globalZone = await pool
      .request()
      .input("normalizedName", sql.NVarChar(120), caballitoKeyName)
      .input("normalizedLocality", sql.NVarChar(120), caballitoKeyLocality)
      .query(`
        SELECT TOP 1 id FROM location_zones
        WHERE normalized_name = @normalizedName AND normalized_locality = @normalizedLocality
      `);
    const zoneId = String(globalZone.recordset[0]?.id ?? "");
    assert.ok(zoneId);

    const assocResult = await pool
      .request()
      .input("zoneId", sql.UniqueIdentifier, zoneId)
      .input("companyA", sql.UniqueIdentifier, fixtureA.data.company.id)
      .input("companyB", sql.UniqueIdentifier, fixtureB.data.company.id)
      .query(`
        SELECT company_id
        FROM company_location_zones
        WHERE location_zone_id = @zoneId
          AND company_id IN (@companyA, @companyB)
      `);

    assert.equal(assocResult.recordset.length, 2);
    const companyIds = assocResult.recordset.map((row) => String(row.company_id)).sort();
    assert.deepEqual(
      companyIds,
      [fixtureA.data.company.id, fixtureB.data.company.id].sort(),
    );
  });

  it("ensureDefaultGenericZonesForCompany is idempotent", async () => {
    const suffix = uniqueSuffix();
    const result = await createPlatformCompanyFixture({
      name: `LZ Idempotent ${suffix}`,
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: { name: "Owner", email: `lz-idem-${suffix}@integration.test` },
    });
    createdCompanyIds.push(result.data.company.id);
    const companyId = result.data.company.id;

    const before = await locationZoneRepository.listForCompany(companyId, {
      includeInactive: false,
    });
    assert.equal(before.length, expectedDefaultZoneCount());

    await companyLocationZoneDefaultsService.ensureDefaultGenericZonesForCompany(companyId);
    await companyLocationZoneDefaultsService.ensureDefaultGenericZonesForCompany(companyId);

    const after = await locationZoneRepository.listForCompany(companyId, {
      includeInactive: false,
    });

    assert.equal(after.length, expectedDefaultZoneCount());
    const pool = getPool();
    const dupes = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT location_zone_id, COUNT(*) AS c
        FROM company_location_zones
        WHERE company_id = @companyId
        GROUP BY location_zone_id
        HAVING COUNT(*) > 1
      `);
    assert.equal(dupes.recordset.length, 0);
  });

  it("fails company creation when the global catalog is incomplete", async () => {
    await withGlobalLocationZonesCatalogMutationLock(async () => {
      const suffix = uniqueSuffix();
      const companyName = `LZ Incomplete Catalog ${suffix}`;
      const caballito = resolveDefaultGenericLocationZoneNormalizedKeys().find(
        (key) => key.name === "Caballito",
      );
      assert.ok(caballito);

      const pool = getPool();
      const priorResult = await pool
        .request()
        .input("normalizedName", sql.NVarChar(120), caballito.normalizedName)
        .input("normalizedLocality", sql.NVarChar(120), caballito.normalizedLocality)
        .query(`
          SELECT is_active
          FROM location_zones
          WHERE normalized_name = @normalizedName
            AND normalized_locality = @normalizedLocality
        `);
      assert.equal(priorResult.recordset.length, 1);
      const priorIsActive = Boolean(priorResult.recordset[0].is_active);

      await pool
        .request()
        .input("normalizedName", sql.NVarChar(120), caballito.normalizedName)
        .input("normalizedLocality", sql.NVarChar(120), caballito.normalizedLocality)
        .query(`
          UPDATE location_zones
          SET is_active = 0, updated_at = SYSUTCDATETIME()
          WHERE normalized_name = @normalizedName
            AND normalized_locality = @normalizedLocality
        `);

      const admin = await userRepository.findByEmail("admin@dinamicsystems.com");
      assert.ok(admin?.isPlatformAdmin);

      try {
        await assert.rejects(
          () =>
            platformCompanyService.createCompany(
              {
                name: companyName,
                defaultTimezone: "America/Argentina/Buenos_Aires",
                owner: {
                  name: "Owner",
                  email: `lz-incomplete-${suffix}@integration.test`,
                },
              },
              admin.id,
            ),
          (error: unknown) =>
            error instanceof AppError &&
            error.code === "DEFAULT_GENERIC_LOCATION_ZONES_CATALOG_INCOMPLETE",
        );

        const created = await companyRepository.findByName(companyName);
        assert.equal(created, null);
      } finally {
        await pool
          .request()
          .input("normalizedName", sql.NVarChar(120), caballito.normalizedName)
          .input("normalizedLocality", sql.NVarChar(120), caballito.normalizedLocality)
          .input("isActive", sql.Bit, priorIsActive ? 1 : 0)
          .query(`
            UPDATE location_zones
            SET is_active = @isActive, updated_at = SYSUTCDATETIME()
            WHERE normalized_name = @normalizedName
              AND normalized_locality = @normalizedLocality
          `);
      }
    });
  });
});
