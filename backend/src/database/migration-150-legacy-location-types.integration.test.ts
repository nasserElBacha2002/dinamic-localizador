import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, it } from "node:test";
import sql from "mssql";
import { env } from "../config/env";
import { applySqlScriptInTransaction } from "./run-migrations";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";

const migrationsDir = join(process.cwd(), "..", "database", "migrations");
const migration150 = readFileSync(
  join(migrationsDir, "150_remove_legacy_global_location_type_seeds.sql"),
  "utf8",
);

const sqlConfig = (database: string): sql.config => ({
  server: env.DB_HOST,
  port: env.DB_PORT,
  database,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  options: {
    encrypt: env.DB_ENCRYPT,
    trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
  },
});

const LEGACY_SEEDS = [
  { code: "Express", name: "Express", sortOrder: 1 },
  { code: "Express Interior MZA", name: "Express Interior MZA", sortOrder: 2 },
  { code: "Express Interior SALTA", name: "Express Interior SALTA", sortOrder: 3 },
  { code: "EXPRESS PLUS INTERIOR", name: "EXPRESS PLUS INTERIOR", sortOrder: 4 },
  { code: "Market Bs As", name: "Market Bs As", sortOrder: 5 },
] as const;

async function bootstrapMigration150Schema(pool: sql.ConnectionPool): Promise<void> {
  await pool.request().query(`
    CREATE TABLE dbo.companies (
      id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_companies_m150 PRIMARY KEY
    );

    CREATE TABLE dbo.company_location_types (
      id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_company_location_types_m150 PRIMARY KEY DEFAULT NEWID(),
      company_id UNIQUEIDENTIFIER NOT NULL,
      client_id UNIQUEIDENTIFIER NULL,
      code NVARCHAR(80) NOT NULL,
      name NVARCHAR(200) NOT NULL,
      is_active BIT NOT NULL CONSTRAINT DF_company_location_types_m150_active DEFAULT (1),
      sort_order INT NOT NULL CONSTRAINT DF_company_location_types_m150_sort DEFAULT (0),
      created_at DATETIME2 NOT NULL CONSTRAINT DF_company_location_types_m150_created DEFAULT SYSUTCDATETIME(),
      updated_at DATETIME2 NOT NULL CONSTRAINT DF_company_location_types_m150_updated DEFAULT SYSUTCDATETIME(),
      CONSTRAINT UQ_company_location_types_m150_company_code UNIQUE (company_id, code)
    );

    CREATE TABLE dbo.operational_locations (
      id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_operational_locations_m150 PRIMARY KEY DEFAULT NEWID(),
      company_id UNIQUEIDENTIFIER NOT NULL,
      name NVARCHAR(200) NOT NULL,
      store_format NVARCHAR(80) NULL,
      updated_at DATETIME2 NOT NULL CONSTRAINT DF_operational_locations_m150_updated DEFAULT SYSUTCDATETIME()
    );
  `);
}

describeDatabaseIntegration("migration 150 legacy location type cleanup", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("removes only demonstrable legacy quintets and clears dependent store_format rows", async () => {
    const dbName = `m150_loc_${Date.now()}`;
    const master = new sql.ConnectionPool(sqlConfig("master"));
    await master.connect();
    let disposable: sql.ConnectionPool | null = null;

    try {
      await master.request().query(`CREATE DATABASE [${dbName}]`);
      disposable = new sql.ConnectionPool(sqlConfig(dbName));
      await disposable.connect();
      await bootstrapMigration150Schema(disposable);

      const contaminatedCompany = "11111111-1111-4111-8111-111111111101";
      const partialCompany = "11111111-1111-4111-8111-111111111102";
      const clientOwnedCompany = "11111111-1111-4111-8111-111111111103";

      await disposable.request().query(`
        INSERT INTO dbo.companies (id) VALUES
          ('${contaminatedCompany}'),
          ('${partialCompany}'),
          ('${clientOwnedCompany}');
      `);

      for (const seed of LEGACY_SEEDS) {
        await disposable.request()
          .input("companyId", sql.UniqueIdentifier, contaminatedCompany)
          .input("code", sql.NVarChar(80), seed.code)
          .input("name", sql.NVarChar(200), seed.name)
          .input("sortOrder", sql.Int, seed.sortOrder)
          .query(`
            INSERT INTO dbo.company_location_types (company_id, code, name, sort_order)
            VALUES (@companyId, @code, @name, @sortOrder);
          `);
      }

      await disposable.request()
        .input("companyId", sql.UniqueIdentifier, partialCompany)
        .input("code", sql.NVarChar(80), "Express")
        .input("name", sql.NVarChar(200), "Express")
        .input("sortOrder", sql.Int, 1)
        .query(`
          INSERT INTO dbo.company_location_types (company_id, code, name, sort_order)
          VALUES (@companyId, @code, @name, @sortOrder);
        `);

      await disposable.request()
        .input("companyId", sql.UniqueIdentifier, partialCompany)
        .input("code", sql.NVarChar(80), "CUSTOM_MANUAL")
        .input("name", sql.NVarChar(200), "Custom manual format")
        .input("sortOrder", sql.Int, 99)
        .query(`
          INSERT INTO dbo.company_location_types (company_id, client_id, code, name, sort_order)
          VALUES (@companyId, NULL, @code, @name, @sortOrder);
        `);

      await disposable.request()
        .input("companyId", sql.UniqueIdentifier, clientOwnedCompany)
        .input("clientId", sql.UniqueIdentifier, "22222222-2222-4222-8222-222222222222")
        .input("code", sql.NVarChar(80), "Express")
        .input("name", sql.NVarChar(200), "Express")
        .input("sortOrder", sql.Int, 1)
        .query(`
          INSERT INTO dbo.company_location_types (company_id, client_id, code, name, sort_order)
          VALUES (@companyId, @clientId, @code, @name, @sortOrder);
        `);

      await disposable.request()
        .input("companyId", sql.UniqueIdentifier, contaminatedCompany)
        .query(`
          INSERT INTO dbo.operational_locations (company_id, name, store_format)
          VALUES (@companyId, N'Legacy express', N'Express');
        `);

      await disposable.request()
        .input("companyId", sql.UniqueIdentifier, contaminatedCompany)
        .query(`
          INSERT INTO dbo.operational_locations (company_id, name, store_format)
          VALUES (@companyId, N'Orphan unrelated', N'ORPHAN_CODE');
        `);

      await applySqlScriptInTransaction(disposable, migration150);

      const remaining = await disposable.request().query(`
        SELECT company_id, code, client_id
        FROM dbo.company_location_types
        ORDER BY company_id, code;
      `);
      const rows = remaining.recordset.map((row: Record<string, unknown>) => ({
        companyId: String(row.company_id),
        code: String(row.code),
        clientId: row.client_id ? String(row.client_id) : null,
      }));

      assert.equal(
        rows.filter((row) => row.companyId === contaminatedCompany).length,
        0,
      );
      assert.ok(rows.some((row) => row.companyId === partialCompany && row.code === "Express"));
      assert.ok(rows.some((row) => row.companyId === partialCompany && row.code === "CUSTOM_MANUAL"));
      assert.ok(
        rows.some(
          (row) =>
            row.companyId === clientOwnedCompany &&
            row.code === "Express" &&
            row.clientId === "22222222-2222-4222-8222-222222222222",
        ),
      );

      const locations = await disposable.request().query(`
        SELECT name, store_format
        FROM dbo.operational_locations
        WHERE company_id = '${contaminatedCompany}'
        ORDER BY name;
      `);
      assert.equal(String(locations.recordset[0]?.store_format ?? ""), "");
      assert.equal(String(locations.recordset[1]?.store_format ?? ""), "ORPHAN_CODE");

      await applySqlScriptInTransaction(disposable, migration150);

      const afterSecond = await disposable.request().query(`
        SELECT COUNT(*) AS total FROM dbo.company_location_types;
      `);
      assert.equal(Number(afterSecond.recordset[0]?.total ?? 0), rows.length);
    } finally {
      if (disposable) {
        await disposable.close();
      }
      try {
        await master.request().query(`
          IF DB_ID(N'${dbName}') IS NOT NULL
          BEGIN
            ALTER DATABASE [${dbName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
            DROP DATABASE [${dbName}];
          END
        `);
      } finally {
        await master.close();
      }
    }
  });
});
