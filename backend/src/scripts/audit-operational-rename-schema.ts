/**
 * Live DB validation for Phase 2.7 operational table rename.
 * Used by scripts/audit/audit_db_operational_rename.py --live
 */
import { config } from "dotenv";
import sql from "mssql";
import { migrationEnv as env } from "../config/env-migrations";

config();

const checks: Array<{ label: string; sql: string; expectView?: boolean }> = [
  { label: "operational_locations table", sql: "SELECT OBJECT_ID('dbo.operational_locations', 'U') AS objectId" },
  { label: "scheduled_operations table", sql: "SELECT OBJECT_ID('dbo.scheduled_operations', 'U') AS objectId" },
  { label: "operation_assignments table", sql: "SELECT OBJECT_ID('dbo.operation_assignments', 'U') AS objectId" },
  { label: "stores view", sql: "SELECT OBJECT_ID('dbo.stores', 'V') AS objectId", expectView: true },
  { label: "inventories view", sql: "SELECT OBJECT_ID('dbo.inventories', 'V') AS objectId", expectView: true },
  {
    label: "inventory_employees view",
    sql: "SELECT OBJECT_ID('dbo.inventory_employees', 'V') AS objectId",
    expectView: true,
  },
  { label: "employees table", sql: "SELECT OBJECT_ID('dbo.employees', 'U') AS objectId" },
  { label: "attendance_records table", sql: "SELECT OBJECT_ID('dbo.attendance_records', 'U') AS objectId" },
];

const run = async (): Promise<number> => {
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

  const failures: string[] = [];

  try {
    for (const check of checks) {
      const result = await pool.request().query(check.sql);
      const objectId = result.recordset[0]?.objectId;
      if (objectId === null || objectId === undefined) {
        failures.push(`missing ${check.label}`);
      }
    }

    await pool.request().query("SELECT TOP 1 * FROM dbo.stores");
    await pool.request().query("SELECT TOP 1 * FROM dbo.inventories");
    await pool.request().query("SELECT TOP 1 * FROM dbo.inventory_employees");
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    await pool.close();
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure}`);
    }
    return 1;
  }

  console.log("Live DB validation: passed.");
  return 0;
};

void run().then((code) => {
  process.exit(code);
});
