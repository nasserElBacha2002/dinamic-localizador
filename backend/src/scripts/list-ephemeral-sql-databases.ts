/**
 * DIN-462 — inventory of ephemeral test database names on the configured test SQL endpoint (read-only).
 */
import sql from "mssql";
import {
  EPHEMERAL_BILLING_DB_PREFIX,
  EPHEMERAL_INTEGRATION_DB_PREFIX,
} from "../test-helpers/ephemeral-database-names";
import { assertTestSqlServerEndpointAllowed } from "../test-helpers/test-sql-server-guard";
import { resolveTestSqlProvisionCredentials } from "../test-helpers/test-sql-credentials";

const main = async (): Promise<void> => {
  const credentials = resolveTestSqlProvisionCredentials();
  const pool = new sql.ConnectionPool({
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
  await pool.connect();
  await assertTestSqlServerEndpointAllowed(pool, credentials, { requireMasterConnection: true });

  const result = await pool.request().query(`
    SELECT name
    FROM sys.databases
    WHERE name LIKE '${EPHEMERAL_INTEGRATION_DB_PREFIX}%'
       OR name LIKE '${EPHEMERAL_BILLING_DB_PREFIX}%'
    ORDER BY name
  `);

  for (const row of result.recordset) {
    console.log(String(row.name));
  }
  await pool.close();
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});