/**
 * DIN-462 — verify TEST_SQL_ALLOWED_SERVER_NAME matches @@SERVERNAME on the test SQL endpoint (read-only).
 */
import sql from "mssql";
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
  const identity = await assertTestSqlServerEndpointAllowed(pool, credentials, {
    requireMasterConnection: true,
  });
  await pool.close();
  console.log(
    `[verify-disposable-sql-server-identity] OK serverName=${identity.serverName} allowed=${process.env.TEST_SQL_ALLOWED_SERVER_NAME}`,
  );
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});