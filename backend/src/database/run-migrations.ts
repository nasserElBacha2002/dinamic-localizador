import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sql from "mssql";
import { migrationEnv as env } from "../config/env-migrations";

const migrationDir =
  process.env.MIGRATIONS_DIR?.trim() || join(process.cwd(), "..", "database", "migrations");

export const splitBatches = (script: string): string[] =>
  script
    .split(/\r?\nGO\r?\n/gi)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

/** Migrations may contain legacy `USE <database>` statements; the pool already targets env.DB_NAME. */
export const stripLegacyDatabaseUse = (batch: string): string =>
  batch
    .split(/\r?\n/)
    .filter((line) => !/^\s*USE\s+[A-Za-z0-9_[\]]+\s*;?\s*$/i.test(line.trim()))
    .join("\n")
    .trim();

const listMigrationFiles = (): string[] =>
  readdirSync(migrationDir)
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

const connectPool = async (): Promise<sql.ConnectionPool> =>
  sql.connect({
    server: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    options: {
      encrypt: env.DB_ENCRYPT,
      trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
    },
  });

const getAppliedMigrations = async (pool: sql.ConnectionPool): Promise<Set<string>> => {
  const tableExists = await pool.request().query(`
    SELECT 1 AS found
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME = 'system_migrations'
  `);

  if (!tableExists.recordset[0]) {
    return new Set();
  }

  const result = await pool.request().query(`
    SELECT migration_name
    FROM system_migrations
    ORDER BY migration_name ASC
  `);

  return new Set(result.recordset.map((row) => String(row.migration_name)));
};

/**
 * Applies all GO batches of a migration script inside a single SQL Server transaction.
 * On any batch failure the whole migration rolls back (no partial schema from this script).
 *
 * Uses the mssql TDS Transaction API (not T-SQL BEGIN TRAN in a separate batch):
 * issuing BEGIN TRANSACTION via Request.query() trips error 266 with this driver
 * ("Transaction count after EXECUTE indicates a mismatching number of BEGIN and COMMIT").
 *
 * Evidence: previously each GO batch used pool.request() (autocommit). That left
 * intermediate DDL committed when a later batch failed while system_migrations was
 * not yet registered.
 */
export const applySqlScriptInTransaction = async (
  pool: sql.ConnectionPool,
  script: string,
  options?: { registerMigrationName?: string },
): Promise<void> => {
  const batches = splitBatches(script);
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    await new sql.Request(transaction).query(`SET XACT_ABORT ON;`);

    for (const batch of batches) {
      const normalizedBatch = stripLegacyDatabaseUse(batch);
      if (!normalizedBatch) {
        continue;
      }
      await new sql.Request(transaction).query(normalizedBatch);
    }

    if (options?.registerMigrationName) {
      await new sql.Request(transaction)
        .input("migrationName", sql.NVarChar(255), options.registerMigrationName)
        .query(`
          INSERT INTO system_migrations (migration_name)
          VALUES (@migrationName)
        `);
    }

    await transaction.commit();
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // XACT_ABORT may already have aborted the transaction server-side.
    }
    throw error;
  }
};

export const runMigrations = async (): Promise<void> => {
  const pool = await connectPool();

  try {
    const files = listMigrationFiles();
    const applied = await getAppliedMigrations(pool);

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`Migration skipped (already applied): ${file}`);
        continue;
      }

      const script = readFileSync(join(migrationDir, file), "utf8");
      await applySqlScriptInTransaction(pool, script, { registerMigrationName: file });
      console.log(`Migration applied: ${file}`);
    }

    console.log("Migrations completed.");
  } finally {
    await pool.close();
  }
};

export const printMigrationStatus = async (): Promise<void> => {
  const pool = await connectPool();

  try {
    const files = listMigrationFiles();
    const applied = await getAppliedMigrations(pool);

    console.log(`Migrations directory: ${migrationDir}`);
    console.log("Status:");

    for (const file of files) {
      const status = applied.has(file) ? "applied" : "pending";
      console.log(`- ${file}: ${status}`);
    }
  } finally {
    await pool.close();
  }
};

const isStatusMode = process.argv.includes("--status");

const isMainModule = (() => {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  // Match when executed as `tsx src/database/run-migrations.ts` (not when imported by tests).
  return /run-migrations\.(ts|js|mjs|cjs)$/.test(entry.replace(/\\/g, "/"));
})();

if (isMainModule) {
  const task = isStatusMode ? printMigrationStatus() : runMigrations();

  void task.catch((error: unknown) => {
    console.error(isStatusMode ? "Migration status failed:" : "Migration failed:", error);
    process.exit(1);
  });
}
