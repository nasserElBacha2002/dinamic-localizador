/**
 * Post-109/110 schema invariants + consolidation/conflict logic exercised on scratch tables.
 * Full 109 cannot be re-applied on the shared DB once registered; this validates the
 * remapping algorithm and MANUAL conflict guard that migration 109 embeds.
 *
 * Enable: RUN_DB_INTEGRATION_TESTS=true
 */
import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "./connection";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { normalizeLocationZoneName } from "../utils/normalize-location-zone-name";

const SCRATCH = "dbo.__test_mig109_scratch_zones";
const SURVIVORS = "dbo.__test_mig109_survivors";
const REMAP = "dbo.__test_mig109_remap";

describeDatabaseIntegration("global location zones migration 109/110 invariants", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    const pool = getPool();
    await pool.request().query(`
      IF OBJECT_ID(N'${REMAP}', N'U') IS NOT NULL DROP TABLE ${REMAP};
      IF OBJECT_ID(N'${SURVIVORS}', N'U') IS NOT NULL DROP TABLE ${SURVIVORS};
      IF OBJECT_ID(N'${SCRATCH}', N'U') IS NOT NULL DROP TABLE ${SCRATCH};
    `);
    await teardownDatabaseIntegration();
  });

  it("post-migration schema is global catalog + association table", async () => {
    const pool = getPool();
    const schema = await pool.request().query(`
      SELECT
        CASE WHEN COL_LENGTH(N'dbo.location_zones', N'company_id') IS NULL THEN 1 ELSE 0 END AS no_company_id,
        CASE WHEN OBJECT_ID(N'dbo.company_location_zones', N'U') IS NOT NULL THEN 1 ELSE 0 END AS has_assoc,
        CASE WHEN OBJECT_ID(N'dbo.fn_normalize_location_zone_text', N'FN') IS NOT NULL THEN 1 ELSE 0 END AS has_fn,
        CASE WHEN EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE name = N'UQ_location_zones_normalized_name_locality'
            AND object_id = OBJECT_ID(N'dbo.location_zones')
        ) THEN 1 ELSE 0 END AS has_global_uq,
        CASE WHEN EXISTS (
          SELECT 1 FROM sys.indexes
          WHERE name = N'UQ_company_location_zones_company_zone'
            AND object_id = OBJECT_ID(N'dbo.company_location_zones')
        ) THEN 1 ELSE 0 END AS has_assoc_uq
    `);
    const row = schema.recordset[0];
    assert.equal(Number(row.no_company_id), 1);
    assert.equal(Number(row.has_assoc), 1);
    assert.equal(Number(row.has_fn), 1);
    assert.equal(Number(row.has_global_uq), 1);
    assert.equal(Number(row.has_assoc_uq), 1);
  });

  it("seed Núñez / Morón / José C. Paz match Node normalize keys", async () => {
    const pool = getPool();
    const cases = [
      { name: "Núñez", locality: "CABA" },
      { name: "Morón", locality: "GBA" },
      { name: "José C. Paz", locality: "GBA" },
      { name: "Constitución", locality: "CABA" },
      { name: "Lanús", locality: "GBA" },
    ];

    for (const c of cases) {
      const nn = normalizeLocationZoneName(c.name);
      const nl = normalizeLocationZoneName(c.locality);
      const result = await pool
        .request()
        .input("nn", sql.NVarChar(120), nn)
        .input("nl", sql.NVarChar(120), nl)
        .query(`
          SELECT TOP 1 name, normalized_name, locality, normalized_locality
          FROM dbo.location_zones
          WHERE normalized_name = @nn AND normalized_locality = @nl
        `);
      assert.equal(
        result.recordset.length,
        1,
        `expected seed row for ${c.name}/${c.locality} key=${nn}|${nl}`,
      );
      assert.equal(String(result.recordset[0].normalized_name), nn);
      assert.equal(String(result.recordset[0].normalized_locality), nl);
    }
  });

  it("consolidation remaps three company Caballito copies to one survivor", async () => {
    const pool = getPool();
    const idA = "aaaaaaaa-1090-4000-8000-000000000001";
    const idB = "bbbbbbbb-1090-4000-8000-000000000002";
    const idC = "cccccccc-1090-4000-8000-000000000003";
    const empOnB = "eeeeeeee-1090-4000-8000-0000000000eb";
    const olOnC = "dddddddd-1090-4000-8000-00000000000c";

    await pool.request().query(`
      IF OBJECT_ID(N'${REMAP}', N'U') IS NOT NULL DROP TABLE ${REMAP};
      IF OBJECT_ID(N'${SURVIVORS}', N'U') IS NOT NULL DROP TABLE ${SURVIVORS};
      IF OBJECT_ID(N'${SCRATCH}_refs', N'U') IS NOT NULL DROP TABLE ${SCRATCH}_refs;
      IF OBJECT_ID(N'${SCRATCH}', N'U') IS NOT NULL DROP TABLE ${SCRATCH};

      CREATE TABLE ${SCRATCH} (
        id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        name NVARCHAR(120) NOT NULL,
        locality NVARCHAR(120) NULL,
        normalized_name NVARCHAR(120) NOT NULL,
        normalized_locality NVARCHAR(120) NOT NULL,
        geocoding_status NVARCHAR(20) NULL,
        geocoding_source NVARCHAR(20) NULL,
        centroid_latitude DECIMAL(9,6) NULL,
        centroid_longitude DECIMAL(9,6) NULL,
        created_at DATETIME2 NOT NULL
      );

      CREATE TABLE ${SCRATCH}_refs (
        kind NVARCHAR(20) NOT NULL,
        ref_id UNIQUEIDENTIFIER NOT NULL,
        location_zone_id UNIQUEIDENTIFIER NOT NULL
      );
    `);

    await pool
      .request()
      .input("idA", sql.UniqueIdentifier, idA)
      .input("idB", sql.UniqueIdentifier, idB)
      .input("idC", sql.UniqueIdentifier, idC)
      .input("empOnB", sql.UniqueIdentifier, empOnB)
      .input("olOnC", sql.UniqueIdentifier, olOnC)
      .query(`
        INSERT INTO ${SCRATCH} (
          id, name, locality, normalized_name, normalized_locality,
          geocoding_status, geocoding_source, centroid_latitude, centroid_longitude, created_at
        ) VALUES
        (@idA, N'Caballito', N'CABA', dbo.fn_normalize_location_zone_text(N'Caballito'),
         dbo.fn_normalize_location_zone_text(N'CABA'), N'RESOLVED', N'AUTO', -34.620000, -58.440000, '2024-01-01'),
        (@idB, N'CABALLITO', N'caba', dbo.fn_normalize_location_zone_text(N'CABALLITO'),
         dbo.fn_normalize_location_zone_text(N'caba'), N'PENDING', NULL, NULL, NULL, '2024-06-01'),
        (@idC, N'Caballito', N'CABA', dbo.fn_normalize_location_zone_text(N'Caballito'),
         dbo.fn_normalize_location_zone_text(N'CABA'), N'RESOLVED', N'AUTO', -34.620000, -58.440000, '2025-01-01');

        INSERT INTO ${SCRATCH}_refs (kind, ref_id, location_zone_id) VALUES
        (N'employee', @empOnB, @idB),
        (N'operational', @olOnC, @idC);
      `);

    await pool.request().query(`
      ;WITH ranked AS (
        SELECT
          lz.id,
          lz.normalized_name,
          lz.normalized_locality,
          ROW_NUMBER() OVER (
            PARTITION BY lz.normalized_name, lz.normalized_locality
            ORDER BY
              CASE
                WHEN lz.geocoding_status = N'MANUAL' OR lz.geocoding_source = N'MANUAL' THEN 0
                WHEN lz.geocoding_status = N'RESOLVED' THEN 1
                WHEN lz.centroid_latitude IS NOT NULL AND lz.centroid_longitude IS NOT NULL THEN 2
                ELSE 3
              END ASC,
              lz.created_at ASC,
              lz.id ASC
          ) AS rn
        FROM ${SCRATCH} lz
      )
      SELECT r.id AS survivor_id, r.normalized_name, r.normalized_locality
      INTO ${SURVIVORS}
      FROM ranked r
      WHERE r.rn = 1;

      SELECT lz.id AS old_id, s.survivor_id
      INTO ${REMAP}
      FROM ${SCRATCH} lz
      INNER JOIN ${SURVIVORS} s
        ON s.normalized_name = lz.normalized_name
       AND s.normalized_locality = lz.normalized_locality
      WHERE lz.id <> s.survivor_id;

      UPDATE r
      SET location_zone_id = m.survivor_id
      FROM ${SCRATCH}_refs r
      INNER JOIN ${REMAP} m ON m.old_id = r.location_zone_id;

      DELETE lz
      FROM ${SCRATCH} lz
      INNER JOIN ${REMAP} m ON m.old_id = lz.id;
    `);

    const zones = await pool.request().query(`SELECT COUNT(*) AS c FROM ${SCRATCH}`);
    assert.equal(Number(zones.recordset[0].c), 1);

    const survivor = await pool.request().query(`SELECT TOP 1 id FROM ${SCRATCH}`);
    assert.equal(String(survivor.recordset[0].id).toLowerCase(), idA);

    const refs = await pool.request().query(`
      SELECT kind, CAST(location_zone_id AS NVARCHAR(36)) AS zone_id FROM ${SCRATCH}_refs
    `);
    assert.equal(refs.recordset.length, 2);
    for (const row of refs.recordset) {
      assert.equal(String(row.zone_id).toLowerCase(), idA);
    }

    await pool.request().query(`
      IF OBJECT_ID(N'${SCRATCH}_refs', N'U') IS NOT NULL DROP TABLE ${SCRATCH}_refs;
      IF OBJECT_ID(N'${REMAP}', N'U') IS NOT NULL DROP TABLE ${REMAP};
      IF OBJECT_ID(N'${SURVIVORS}', N'U') IS NOT NULL DROP TABLE ${SURVIVORS};
      IF OBJECT_ID(N'${SCRATCH}', N'U') IS NOT NULL DROP TABLE ${SCRATCH};
    `);
  });

  it("aborts when two MANUAL centroids conflict for the same normalized key", async () => {
    const pool = getPool();
    await pool.request().query(`
      IF OBJECT_ID(N'${SCRATCH}', N'U') IS NOT NULL DROP TABLE ${SCRATCH};
      CREATE TABLE ${SCRATCH} (
        id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        normalized_name NVARCHAR(120) NOT NULL,
        normalized_locality NVARCHAR(120) NOT NULL,
        geocoding_status NVARCHAR(20) NULL,
        geocoding_source NVARCHAR(20) NULL,
        centroid_latitude DECIMAL(9,6) NULL,
        centroid_longitude DECIMAL(9,6) NULL
      );
      INSERT INTO ${SCRATCH} (
        id, normalized_name, normalized_locality,
        geocoding_status, geocoding_source, centroid_latitude, centroid_longitude
      ) VALUES
      ('11111111-1090-4000-8000-000000000001', N'nunez', N'caba', N'MANUAL', N'MANUAL', -34.540000, -58.460000),
      ('22222222-1090-4000-8000-000000000002', N'nunez', N'caba', N'MANUAL', N'MANUAL', -34.550000, -58.470000);
    `);

    let threw = false;
    try {
      await pool.request().query(`
        IF EXISTS (
          SELECT 1
          FROM ${SCRATCH} a
          INNER JOIN ${SCRATCH} b
              ON a.normalized_name = b.normalized_name
             AND a.normalized_locality = b.normalized_locality
             AND a.id < b.id
          WHERE (a.geocoding_status = N'MANUAL' OR a.geocoding_source = N'MANUAL')
            AND (b.geocoding_status = N'MANUAL' OR b.geocoding_source = N'MANUAL')
            AND a.centroid_latitude IS NOT NULL
            AND a.centroid_longitude IS NOT NULL
            AND b.centroid_latitude IS NOT NULL
            AND b.centroid_longitude IS NOT NULL
            AND (
                  ABS(CAST(a.centroid_latitude AS FLOAT) - CAST(b.centroid_latitude AS FLOAT)) > 0.00001
               OR ABS(CAST(a.centroid_longitude AS FLOAT) - CAST(b.centroid_longitude AS FLOAT)) > 0.00001
            )
        )
        BEGIN
          THROW 50091, N'MIGRATION_109_MANUAL_CENTROID_CONFLICT: multiple MANUAL centroids for the same normalized location key. Resolve manually before consolidating.', 1;
        END;
      `);
    } catch (error: unknown) {
      threw = true;
      const message = error instanceof Error ? error.message : String(error);
      assert.match(message, /MIGRATION_109_MANUAL_CENTROID_CONFLICT/);
    }
    assert.equal(threw, true);

    const remaining = await pool.request().query(`SELECT COUNT(*) AS c FROM ${SCRATCH}`);
    assert.equal(Number(remaining.recordset[0].c), 2, "conflict must not delete rows");

    await pool.request().query(`
      IF OBJECT_ID(N'${SCRATCH}', N'U') IS NOT NULL DROP TABLE ${SCRATCH};
    `);
  });
});
