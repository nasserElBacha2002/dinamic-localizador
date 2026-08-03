import { readFileSync } from "node:fs";
import { join } from "node:path";
import sql from "mssql";
import { migrationEnv as env } from "../config/env-migrations";

const splitBatches = (script: string): string[] =>
  script
    .split(/\r?\nGO\r?\n/gi)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const stripUse = (batch: string): string =>
  batch
    .split(/\r?\n/)
    .filter((line) => !/^\s*USE\s+/i.test(line.trim()))
    .join("\n")
    .trim();

const runScript = async (pool: sql.ConnectionPool, path: string): Promise<void> => {
  const script = readFileSync(path, "utf8");
  for (const batch of splitBatches(script)) {
    const cleaned = stripUse(batch);
    if (cleaned) {
      await pool.request().batch(cleaned);
    }
  }
};

const assertSchema = async (
  pool: sql.ConnectionPool,
  expectPresent: boolean,
): Promise<void> => {
  const cols = await pool.request().query(`
    SELECT c.name
    FROM sys.columns c
    JOIN sys.tables t ON t.object_id = c.object_id
    WHERE t.name = 'whatsapp_attendance_notifications'
      AND c.name IN (
        'provider_status',
        'provider_error_code',
        'provider_error_message',
        'provider_updated_at'
      )
  `);
  const fks = await pool.request().query(`
    SELECT name
    FROM sys.foreign_keys
    WHERE name IN (
      'FK_wan_conversation',
      'FK_wfe_source_message',
      'FK_wfe_notification',
      'FK_wfe_employee'
    )
  `);
  const colCount = cols.recordset.length;
  const fkCount = fks.recordset.length;
  console.log(JSON.stringify({ expectPresent, colCount, fkCount }));
  if (expectPresent) {
    if (colCount !== 4 || fkCount !== 4) {
      throw new Error(`expected present cols=4 fks=4 got cols=${colCount} fks=${fkCount}`);
    }
  } else if (colCount !== 0 || fkCount !== 0) {
    throw new Error(`expected absent cols=0 fks=0 got cols=${colCount} fks=${fkCount}`);
  }
};

const main = async (): Promise<void> => {
  const pool = await sql.connect({
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

  const root = join(process.cwd(), "..", "database", "migrations");
  const forward = join(root, "077_whatsapp_observability_corrections.sql");
  const rollback = join(root, "rollback/077_whatsapp_observability_corrections_rollback.sql");

  console.log("ensure applied");
  await runScript(pool, forward);
  await assertSchema(pool, true);

  console.log("rollback 077");
  await runScript(pool, rollback);
  await pool
    .request()
    .query(
      `DELETE FROM system_migrations WHERE migration_name = '077_whatsapp_observability_corrections.sql'`,
    );
  await assertSchema(pool, false);

  console.log("reapply 077");
  await runScript(pool, forward);
  await pool
    .request()
    .query(
      `INSERT INTO system_migrations (migration_name) VALUES ('077_whatsapp_observability_corrections.sql')`,
    );
  await assertSchema(pool, true);
  console.log("077 apply/rollback/reapply OK");
  await pool.close();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
