import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "./connection";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";

const MIGRATION_038_PATH = join(
  process.cwd(),
  "..",
  "database/migrations/038_finalize_company_module_key_migration.sql",
);

const stripLegacyDatabaseUse = (batch: string): string =>
  batch
    .split(/\r?\n/)
    .filter((line) => !/^\s*USE\s+[A-Za-z0-9_\[\]]+\s*;?\s*$/i.test(line.trim()))
    .join("\n")
    .trim();

const runMigration038 = async (): Promise<void> => {
  const pool = getPool();
  const migrationSql = readFileSync(MIGRATION_038_PATH, "utf8");
  const batches = migrationSql
    .split(/^\s*GO\s*$/gim)
    .map((batch) => stripLegacyDatabaseUse(batch.trim()))
    .filter(Boolean);

  for (const batch of batches) {
    await pool.request().query(batch);
  }
};

const countLegacyModuleRows = async (): Promise<number> => {
  const pool = getPool();
  const result = await pool.request().query(`
    SELECT COUNT(*) AS total
    FROM company_modules
    WHERE module_key = N'inventory_operations'
  `);
  return Number(result.recordset[0]?.total ?? 0);
};

describeDatabaseIntegration("company module key migration (038)", () => {
  const companyIds = {
    legacyOnly: "00000000-0000-4000-8a01-000000000001",
    canonicalOnly: "00000000-0000-4000-8a01-000000000002",
    duplicate: "00000000-0000-4000-8a01-000000000003",
  } as const;

  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    const pool = getPool();
    await pool
      .request()
      .input("legacyOnly", sql.UniqueIdentifier, companyIds.legacyOnly)
      .input("canonicalOnly", sql.UniqueIdentifier, companyIds.canonicalOnly)
      .input("duplicate", sql.UniqueIdentifier, companyIds.duplicate)
      .query(`
        DELETE FROM company_modules
        WHERE company_id IN (@legacyOnly, @canonicalOnly, @duplicate);

        DELETE FROM companies
        WHERE id IN (@legacyOnly, @canonicalOnly, @duplicate);
      `);
    await teardownDatabaseIntegration();
  });

  it("has zero inventory_operations rows after migrations", async () => {
    assert.equal(await countLegacyModuleRows(), 0);
  });

  it("merges legacy and canonical module rows deterministically", async () => {
    const pool = getPool();

    for (const [name, id] of Object.entries({
      "Legacy Only Co": companyIds.legacyOnly,
      "Canonical Only Co": companyIds.canonicalOnly,
      "Duplicate Co": companyIds.duplicate,
    })) {
      await pool
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .input("name", sql.NVarChar(150), name)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM companies WHERE id = @id)
          BEGIN
            INSERT INTO companies (id, name, default_timezone, status)
            VALUES (@id, @name, N'America/Argentina/Buenos_Aires', N'ACTIVE');
          END
        `);
    }

    await pool
      .request()
      .input("legacyOnly", sql.UniqueIdentifier, companyIds.legacyOnly)
      .query(`
        INSERT INTO company_modules (company_id, module_key, is_enabled)
        VALUES (@legacyOnly, N'inventory_operations', 1);
      `);

    await pool
      .request()
      .input("canonicalOnly", sql.UniqueIdentifier, companyIds.canonicalOnly)
      .query(`
        INSERT INTO company_modules (company_id, module_key, is_enabled)
        VALUES (@canonicalOnly, N'operations', 1);
      `);

    await pool
      .request()
      .input("duplicate", sql.UniqueIdentifier, companyIds.duplicate)
      .query(`
        INSERT INTO company_modules (company_id, module_key, is_enabled, created_at, updated_at)
        VALUES
          (@duplicate, N'operations', 0, '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'),
          (@duplicate, N'inventory_operations', 1, '2025-12-01T00:00:00.000Z', '2026-01-03T00:00:00.000Z');
      `);

    await runMigration038();

    const modules = await pool.request().query(`
      SELECT company_id, module_key, is_enabled, created_at, updated_at
      FROM company_modules
      WHERE company_id IN (
        '${companyIds.legacyOnly}',
        '${companyIds.canonicalOnly}',
        '${companyIds.duplicate}'
      )
      ORDER BY company_id, module_key
    `);

    const byCompany = new Map<string, Array<Record<string, unknown>>>();
    for (const row of modules.recordset as Array<Record<string, unknown>>) {
      const companyId = String(row.company_id).toLowerCase();
      const rows = byCompany.get(companyId) ?? [];
      rows.push(row);
      byCompany.set(companyId, rows);
    }

    assert.equal(await countLegacyModuleRows(), 0);

    const legacyOnlyRows = byCompany.get(companyIds.legacyOnly.toLowerCase()) ?? [];
    assert.equal(legacyOnlyRows.length, 1);
    assert.equal(legacyOnlyRows[0]?.module_key, "operations");
    assert.equal(Boolean(legacyOnlyRows[0]?.is_enabled), true);

    const canonicalOnlyRows = byCompany.get(companyIds.canonicalOnly.toLowerCase()) ?? [];
    assert.equal(canonicalOnlyRows.length, 1);
    assert.equal(canonicalOnlyRows[0]?.module_key, "operations");
    assert.equal(Boolean(canonicalOnlyRows[0]?.is_enabled), true);

    const duplicateRows = byCompany.get(companyIds.duplicate.toLowerCase()) ?? [];
    assert.equal(duplicateRows.length, 1);
    assert.equal(duplicateRows[0]?.module_key, "operations");
    assert.equal(Boolean(duplicateRows[0]?.is_enabled), true);
    assert.equal(
      new Date(String(duplicateRows[0]?.created_at)).toISOString(),
      new Date("2025-12-01T00:00:00.000Z").toISOString(),
    );
    assert.equal(
      new Date(String(duplicateRows[0]?.updated_at)).toISOString(),
      new Date("2026-01-03T00:00:00.000Z").toISOString(),
    );
  });
});
