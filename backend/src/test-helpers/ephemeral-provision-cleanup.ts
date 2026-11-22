import sql, { type ConnectionPool } from "mssql";
import {
  assertEphemeralDatabaseNameForDrop,
  assertEphemeralIntegrationDatabaseName,
} from "./ephemeral-database-names";
import {
  assertSafeDropEphemeralDatabase,
  assertTestSqlServerEndpointAllowed,
} from "./test-sql-server-guard";
import type { TestSqlCredentials } from "./test-sql-credentials";
import {
  countForeignSessionsOnDatabase,
  readEphemeralDatabaseOwnershipToken,
} from "./ephemeral-database-ownership";

const MAX_UNSTAMPED_CLEANUP_AGE_MS = 15 * 60_000;

export type UnstampedProvisionCleanupAuthorization = {
  databaseName: string;
  orchestratorPid: number;
  createdAtIso: string;
};

/**
 * Compensatory DROP when CREATE succeeded but ownership stamp never completed in the same provision call.
 * Fail-closed: no foreign-run databases, no stamped DBs, no stale create_date.
 */
export const destroyProvisionedEphemeralDatabaseWithoutOwnershipStamp = async (
  masterPool: ConnectionPool,
  databaseName: string,
  credentials: TestSqlCredentials,
  authorization: UnstampedProvisionCleanupAuthorization,
): Promise<void> => {
  if (authorization.databaseName !== databaseName) {
    throw new Error("Refusing unstamped cleanup: database name does not match provision authorization.");
  }

  const orchestratorFromEnv = Number(process.env.DINAMIC_INTEGRATION_ORCHESTRATOR_PID ?? process.pid);
  if (authorization.orchestratorPid !== orchestratorFromEnv) {
    throw new Error(
      "Refusing unstamped cleanup: orchestrator PID does not match this provision run.",
    );
  }

  const createdAt = Date.parse(authorization.createdAtIso);
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > MAX_UNSTAMPED_CLEANUP_AGE_MS) {
    throw new Error("Refusing unstamped cleanup: provision create window expired.");
  }

  assertEphemeralDatabaseNameForDrop(databaseName);
  assertSafeDropEphemeralDatabase(databaseName);
  await assertTestSqlServerEndpointAllowed(masterPool, credentials, { requireMasterConnection: true });

  const existingToken = await readEphemeralDatabaseOwnershipToken(masterPool, databaseName);
  if (existingToken) {
    throw new Error(
      `Refusing unstamped cleanup: ${databaseName} already has ownership property (possible foreign run).`,
    );
  }

  const foreignSessions = await countForeignSessionsOnDatabase(masterPool, databaseName);
  if (foreignSessions > 0) {
    throw new Error(
      `Refusing unstamped cleanup: ${databaseName} has ${foreignSessions} foreign user session(s).`,
    );
  }

  const createDateRow = await masterPool
    .request()
    .input("dbName", sql.NVarChar(128), databaseName)
    .query(`SELECT create_date FROM sys.databases WHERE name = @dbName`);
  const serverCreated = createDateRow.recordset[0]?.create_date
    ? new Date(createDateRow.recordset[0].create_date as Date).getTime()
    : NaN;
  if (!Number.isFinite(serverCreated) || Math.abs(serverCreated - createdAt) > 5 * 60_000) {
    throw new Error(
      "Refusing unstamped cleanup: server create_date does not match this provision attempt.",
    );
  }

  await masterPool.request().query(`
    IF DB_ID(N'${databaseName}') IS NOT NULL
    BEGIN
      ALTER DATABASE [${databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
      DROP DATABASE [${databaseName}];
    END;
  `);
};