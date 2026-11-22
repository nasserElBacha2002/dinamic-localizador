import type { ConnectionPool } from "mssql";
import {
  assertEphemeralDatabaseNameForDrop,
  assertEphemeralIntegrationDatabaseName,
  isAnyEphemeralTestDatabaseName,
} from "./ephemeral-database-names";
import type { TestSqlCredentials } from "./test-sql-credentials";
import { assertTestSqlDisposableEnvironmentConfigured } from "./test-sql-disposable-env";

export const normalizeServerIdentity = (value: string): string =>
  value.trim().toLowerCase().replace(/\\/g, ",").split(",")[0] ?? "";

const reportedIdentityMatchesAllowed = (
  reportedNames: string[],
  allowedServerName: string,
): boolean => {
  const expected = normalizeServerIdentity(allowedServerName);
  return reportedNames.some((reported) => {
    if (reported === expected) {
      return true;
    }
    if (reported.startsWith(`${expected},`) || expected.startsWith(`${reported},`)) {
      return true;
    }
    return false;
  });
};

const defaultProtectedDatabaseNames = (): string[] => {
  const fromEnv = process.env.TEST_SQL_PROTECTED_DATABASE_NAMES?.trim();
  if (fromEnv) {
    return fromEnv
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  }
  return ["dinamic_attendance", "master", "msdb", "tempdb", "model"];
};

export const isProtectedPersistentDatabaseName = (databaseName: string): boolean => {
  const normalized = databaseName.trim().toLowerCase();
  if (isAnyEphemeralTestDatabaseName(databaseName)) {
    return false;
  }
  return defaultProtectedDatabaseNames().some((protectedName) => protectedName.toLowerCase() === normalized);
};

export const assertIntegrationDatabaseNameIsEphemeral = (databaseName: string): void => {
  if (isProtectedPersistentDatabaseName(databaseName)) {
    throw new Error(
      `Refusing test SQL: database "${databaseName}" is a protected persistent database.`,
    );
  }
  assertEphemeralIntegrationDatabaseName(databaseName);
};

export type SqlServerEndpointIdentity = {
  serverName: string;
  serverFqdn: string | null;
  connectedDatabase: string;
};

export const readSqlServerEndpointIdentity = async (
  pool: ConnectionPool,
): Promise<SqlServerEndpointIdentity> => {
  const endpoint = await pool.request().query(`
    SELECT
      CAST(@@SERVERNAME AS NVARCHAR(256)) AS server_name,
      CAST(SERVERPROPERTY('ServerName') AS NVARCHAR(256)) AS server_fqdn,
      DB_NAME() AS connected_database
  `);
  const row = endpoint.recordset[0] as {
    server_name: string;
    server_fqdn: string | null;
    connected_database: string;
  };
  return {
    serverName: String(row.server_name ?? ""),
    serverFqdn: row.server_fqdn == null ? null : String(row.server_fqdn),
    connectedDatabase: String(row.connected_database ?? ""),
  };
};

/**
 * Fail-closed: disposable ack + explicit allowed @@SERVERNAME only.
 * TEST_DB_HOST is a connection endpoint only; it never authorizes a persistent instance by itself.
 */
export const assertTestSqlServerEndpointAllowed = async (
  pool: ConnectionPool,
  credentials: TestSqlCredentials,
  options?: { requireMasterConnection?: boolean },
): Promise<SqlServerEndpointIdentity> => {
  assertTestSqlDisposableEnvironmentConfigured();

  const identity = await readSqlServerEndpointIdentity(pool);

  if (options?.requireMasterConnection && identity.connectedDatabase.toLowerCase() !== "master") {
    throw new Error(
      `Refusing test SQL DDL: expected master connection, got DB_NAME()=${identity.connectedDatabase}.`,
    );
  }

  const reportedNames = [identity.serverName, identity.serverFqdn ?? ""]
    .map((name) => normalizeServerIdentity(String(name)))
    .filter(Boolean);

  const allowedServer = process.env.TEST_SQL_ALLOWED_SERVER_NAME?.trim() ?? "";
  if (!reportedIdentityMatchesAllowed(reportedNames, allowedServer)) {
    throw new Error(
      `Refusing test SQL: @@SERVERNAME [${reportedNames.join(", ")}] does not match TEST_SQL_ALLOWED_SERVER_NAME=${allowedServer}. TEST_DB_HOST=${credentials.host} does not authorize this server.`,
    );
  }

  return identity;
};

export const assertConnectedDatabaseMatches = (
  expectedDatabaseName: string,
  identity: SqlServerEndpointIdentity,
): void => {
  if (identity.connectedDatabase !== expectedDatabaseName) {
    throw new Error(
      `Refusing test SQL: connected DB_NAME()=${identity.connectedDatabase} but expected ${expectedDatabaseName}.`,
    );
  }
};

export const assertSafeDropEphemeralDatabase = (databaseName: string): void => {
  assertEphemeralDatabaseNameForDrop(databaseName);
  if (isProtectedPersistentDatabaseName(databaseName)) {
    throw new Error(`Refusing DROP DATABASE: protected name "${databaseName}".`);
  }
};