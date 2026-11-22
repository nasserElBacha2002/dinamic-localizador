/**
 * Seeds a read-only "control persistent" database on disposable SQL (not dev/prod).
 */
import sql from "mssql";
import { resolveTestSqlProvisionCredentials } from "../src/test-helpers/test-sql-credentials";

const CONTROL_DB = process.env.DIN462_CONTROL_PERSISTENT_DB_NAME?.trim() || "din462_control_persistent";

const main = async (): Promise<void> => {
  const credentials = resolveTestSqlProvisionCredentials();
  const master = new sql.ConnectionPool({
    server: credentials.host,
    port: credentials.port,
    database: "master",
    user: credentials.user,
    password: credentials.password,
    options: {
      encrypt: credentials.encrypt,
      trustServerCertificate: credentials.trustServerCertificate,
    },
  });
  await master.connect();
  await master.request().query(`
    IF DB_ID(N'${CONTROL_DB}') IS NULL
      CREATE DATABASE [${CONTROL_DB}];
  `);
  await master.close();

  const pool = new sql.ConnectionPool({
    server: credentials.host,
    port: credentials.port,
    database: CONTROL_DB,
    user: credentials.user,
    password: credentials.password,
    options: {
      encrypt: credentials.encrypt,
      trustServerCertificate: credentials.trustServerCertificate,
    },
  });
  await pool.connect();
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.din462_control_marker', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.din462_control_marker (
        id INT NOT NULL PRIMARY KEY,
        label NVARCHAR(200) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      );
      INSERT INTO dbo.din462_control_marker (id, label) VALUES (1, N'DIN-462 control persistent baseline');
    END
  `);
  await pool.close();
  console.log(`[din-462-control-db] ready database=${CONTROL_DB}`);
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});