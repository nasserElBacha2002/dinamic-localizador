import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sql from "mssql";
import { env } from "../config/env";

const migrationDir =
  process.env.MIGRATIONS_DIR?.trim() || join(process.cwd(), "..", "database", "migrations");

const splitBatches = (script: string): string[] =>
  script
    .split(/\r?\nGO\r?\n/gi)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

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

const registerMigration = async (pool: sql.ConnectionPool, migrationName: string): Promise<void> => {
  await pool
    .request()
    .input("migrationName", sql.NVarChar(255), migrationName)
    .query(`
      INSERT INTO system_migrations (migration_name)
      VALUES (@migrationName)
    `);
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
      const batches = splitBatches(script);

      for (const batch of batches) {
        await pool.request().query(batch);
      }

      await registerMigration(pool, file);
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

const task = isStatusMode ? printMigrationStatus() : runMigrations();

void task.catch((error: unknown) => {
  console.error(isStatusMode ? "Migration status failed:" : "Migration failed:", error);
  process.exit(1);
});
