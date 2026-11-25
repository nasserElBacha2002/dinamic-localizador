import type { ConnectionPool } from "mssql";
import {
  assertIntegrationDatabaseNameIsEphemeral,
  assertTestSqlServerEndpointAllowed,
  readSqlServerEndpointIdentity,
} from "./test-sql-server-guard";
import { isEphemeralBillingDatabaseName } from "./ephemeral-database-names";
import { resolveTestSqlRuntimeCredentials } from "./test-sql-credentials";

export const assertTestSqlConnectionAllowed = async (pool: ConnectionPool): Promise<void> => {
  if (process.env.RUN_DB_INTEGRATION_TESTS !== "true") {
    throw new Error("Refusing SQL connection in test: RUN_DB_INTEGRATION_TESTS is not true.");
  }
  if (process.env.DINAMIC_TEST_SQL_ACTIVE !== "true") {
    throw new Error(
      "Refusing SQL connection in test: DINAMIC_TEST_SQL_ACTIVE is not true (ephemeral session not provisioned).",
    );
  }

  const credentials = resolveTestSqlRuntimeCredentials();
  const identity = await assertTestSqlServerEndpointAllowed(pool, credentials);

  if (isEphemeralBillingDatabaseName(identity.connectedDatabase)) {
  return;
  }

  const dbName =
    process.env.DINAMIC_INTEGRATION_DATABASE_NAME?.trim() || process.env.DB_NAME?.trim() || "";
  assertIntegrationDatabaseNameIsEphemeral(dbName);

  if (identity.connectedDatabase !== dbName) {
    throw new Error(
      `Refusing SQL connection: DB_NAME()=${identity.connectedDatabase} does not match configured ${dbName}.`,
    );
  }

  const migrationTable = await pool.request().query(`
    SELECT 1 AS found
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'system_migrations'
  `);
  if (!migrationTable.recordset[0]) {
    throw new Error(
      "Refusing SQL connection: system_migrations is missing (ephemeral database is not migrated).",
    );
  }
};

export const assertIntegrationDdlAllowed = (): void => {
  if (process.env.RUN_DB_INTEGRATION_TESTS !== "true") {
    throw new Error("Refusing integration SQL DDL: RUN_DB_INTEGRATION_TESTS is not true.");
  }
  if (process.env.INTEGRATION_SQL_DDL_ALLOWED !== "true") {
    throw new Error(
      "Refusing integration SQL DDL: INTEGRATION_SQL_DDL_ALLOWED is not true (explicit ephemeral authorization required).",
    );
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing integration SQL DDL when NODE_ENV=production.");
  }
  if (process.env.DINAMIC_TEST_SQL_ACTIVE !== "true") {
    throw new Error("Refusing integration SQL DDL: ephemeral test session is not active.");
  }

  const dbName =
    process.env.DINAMIC_INTEGRATION_DATABASE_NAME?.trim() || process.env.DB_NAME?.trim() || "";
  if (!isEphemeralBillingDatabaseName(dbName)) {
    assertIntegrationDatabaseNameIsEphemeral(dbName);
  }
};

export const assertSafeIntegrationDatabaseConnectedTarget = async (
  pool: ConnectionPool,
): Promise<void> => {
  assertIntegrationDdlAllowed();
  const dbName =
    process.env.DINAMIC_INTEGRATION_DATABASE_NAME?.trim() || process.env.DB_NAME?.trim() || "";
  const identity = await readSqlServerEndpointIdentity(pool);
  if (identity.connectedDatabase !== dbName) {
    throw new Error(
      `Refusing integration SQL DDL: connected DB_NAME()=${identity.connectedDatabase} but expected ${dbName}.`,
    );
  }
  const credentials = resolveTestSqlRuntimeCredentials();
  await assertTestSqlServerEndpointAllowed(pool, credentials);
};