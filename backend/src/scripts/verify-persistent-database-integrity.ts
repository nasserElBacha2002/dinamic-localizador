/**
 * DIN-462 — read-only deterministic fingerprint of all user dbo tables.
 *
 * Env (read-only login only):
 *   PERSISTENT_DB_VERIFY_HOST, PERSISTENT_DB_VERIFY_PORT,
 *   PERSISTENT_DB_VERIFY_USER, PERSISTENT_DB_VERIFY_PASSWORD, PERSISTENT_DB_VERIFY_NAME
 *   PERSISTENT_DB_INTEGRITY_SNAPSHOT_PATH
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sql from "mssql";

const mode = process.argv[2] ?? "capture";
const snapshotPath = process.env.PERSISTENT_DB_INTEGRITY_SNAPSHOT_PATH?.trim();
if (!snapshotPath) {
  console.error("PERSISTENT_DB_INTEGRITY_SNAPSHOT_PATH is required");
  process.exit(1);
}

const requireEnv = (key: string): string => {
  const v = process.env[key]?.trim() ?? "";
  if (!v) {
    throw new Error(`Missing ${key}`);
  }
  return v;
};

const connectReadOnly = async (): Promise<sql.ConnectionPool> => {
  const pool = new sql.ConnectionPool({
    server: requireEnv("PERSISTENT_DB_VERIFY_HOST"),
    port: Number(requireEnv("PERSISTENT_DB_VERIFY_PORT")),
    database: requireEnv("PERSISTENT_DB_VERIFY_NAME"),
    user: requireEnv("PERSISTENT_DB_VERIFY_USER"),
    password: requireEnv("PERSISTENT_DB_VERIFY_PASSWORD"),
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  });
  await pool.connect();
  return pool;
};

const stableRowJson = (row: Record<string, unknown>): string => {
  const keys = Object.keys(row).sort();
  const sorted: Record<string, unknown> = {};
  for (const key of keys) {
    sorted[key] = row[key];
  }
  return JSON.stringify(sorted);
};

const listUserTables = async (transaction: sql.Transaction): Promise<string[]> => {
  const request = new sql.Request(transaction);
  const result = await request.query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = N'BASE TABLE'
      AND TABLE_SCHEMA = N'dbo'
    ORDER BY TABLE_NAME
  `);
  return result.recordset.map((row) => String(row.TABLE_NAME));
};

const listOrderByColumns = async (transaction: sql.Transaction, tableName: string): Promise<string[]> => {
  const request = new sql.Request(transaction);
  const result = await request
    .input("tableName", sql.NVarChar(128), tableName)
    .query(`
      SELECT c.name
      FROM sys.indexes i
      INNER JOIN sys.index_columns ic
        ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      INNER JOIN sys.columns c
        ON c.object_id = ic.object_id AND c.column_id = ic.column_id
      WHERE i.is_primary_key = 1
        AND i.object_id = OBJECT_ID(N'dbo.' + @tableName)
      ORDER BY ic.key_ordinal
    `);

  const pkColumns = result.recordset.map((row) => `[${String(row.name)}]`);
  if (pkColumns.length > 0) {
    return pkColumns;
  }

  const fallback = await request.input("tableName2", sql.NVarChar(128), tableName).query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = N'dbo' AND TABLE_NAME = @tableName2
      ORDER BY ORDINAL_POSITION
    `);
  return fallback.recordset.map((row) => `[${String(row.COLUMN_NAME)}]`);
};

const escapeTableName = (tableName: string): string => tableName.replace(/\]/g, "]]");

type TableFingerprint = {
  fingerprint: string;
  rowCount: number;
};

const fingerprintTable = async (transaction: sql.Transaction, tableName: string): Promise<TableFingerprint> => {
  const orderColumns = await listOrderByColumns(transaction, tableName);
  const orderClause =
    orderColumns.length > 0 ? `ORDER BY ${orderColumns.join(", ")}` : "";
  const request = new sql.Request(transaction);
  const result = await request.query(
    `SELECT * FROM [dbo].[${escapeTableName(tableName)}] ${orderClause}`,
  );
  const hasher = createHash("sha256");
  let rowCount = 0;
  for (const row of result.recordset) {
    hasher.update(`${stableRowJson(row as Record<string, unknown>)}\n`, "utf8");
    rowCount += 1;
  }
  return { fingerprint: hasher.digest("hex"), rowCount };
};

const main = async (): Promise<void> => {
  const pool = await connectReadOnly();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.REPEATABLE_READ);
  try {
    const tables = await listUserTables(transaction);
    const fingerprints: Record<string, string> = {};
    const rowCounts: Record<string, number> = {};
    for (const table of tables) {
      const { fingerprint, rowCount } = await fingerprintTable(transaction, table);
      const key = `dbo.${table}`;
      fingerprints[key] = fingerprint;
      rowCounts[key] = rowCount;
      console.log(`[persistent-db-integrity] ${key} rowCount=${rowCount}`);
    }

    if (mode === "capture") {
      writeFileSync(
        snapshotPath,
        JSON.stringify(
          {
            capturedAt: new Date().toISOString(),
            database: requireEnv("PERSISTENT_DB_VERIFY_NAME"),
            tableCount: tables.length,
            isolationLevel: "REPEATABLE_READ",
            fingerprints,
            rowCounts,
          },
          null,
          2,
        ),
      );
      console.log(
        `[persistent-db-integrity] snapshot written (${tables.length} tables) -> ${snapshotPath}`,
      );
      await transaction.commit();
      return;
    }

    if (!existsSync(snapshotPath)) {
      throw new Error(`Snapshot not found: ${snapshotPath}`);
    }
    const baseline = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
      fingerprints: Record<string, string>;
      rowCounts?: Record<string, number>;
    };

    const mismatches: string[] = [];
    const baselineTables = new Set(Object.keys(baseline.fingerprints));
    const currentTables = new Set(Object.keys(fingerprints));
    for (const table of baselineTables) {
      if (!currentTables.has(table)) {
        mismatches.push(`${table} (missing)`);
      } else if (baseline.fingerprints[table] !== fingerprints[table]) {
        mismatches.push(`${table} (content)`);
      } else if (
        baseline.rowCounts &&
        baseline.rowCounts[table] !== undefined &&
        baseline.rowCounts[table] !== rowCounts[table]
      ) {
        mismatches.push(`${table} (rowCount)`);
      }
    }
    for (const table of currentTables) {
      if (!baselineTables.has(table)) {
        mismatches.push(`${table} (added)`);
      }
    }

    if (mismatches.length > 0) {
      throw new Error(
        `Persistent database content changed: ${mismatches.slice(0, 20).join(", ")}${
          mismatches.length > 20 ? ` (+${mismatches.length - 20} more)` : ""
        }`,
      );
    }
    console.log(`[persistent-db-integrity] compare OK (${tables.length} dbo tables unchanged)`);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => {
      // ignore
    });
    throw error;
  } finally {
    await pool.close();
  }
};

void main().catch((error: unknown) => {
  console.error("verify-persistent-database-integrity failed:", error);
  process.exit(1);
});