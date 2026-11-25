import sql from "mssql";
import { closeDatabase, setTestPool } from "../database/connection";
import { runMigrationsOnPool } from "../database/run-migrations";
import {
  assertEphemeralIntegrationDatabaseName,
  generateEphemeralIntegrationDatabaseName,
} from "./ephemeral-database-names";
import {
  assertConnectedDatabaseMatches,
  assertSafeDropEphemeralDatabase,
  assertTestSqlServerEndpointAllowed,
  readSqlServerEndpointIdentity,
} from "./test-sql-server-guard";
import {
  installRuntimeDbEnvFromTestCredentials,
  resolveTestSqlRuntimeCredentials,
  type TestSqlCredentials,
} from "./test-sql-credentials";
import {
  assertEphemeralDatabaseDropAuthorized,
  stampEphemeralDatabaseOwnership,
  type EphemeralDropAuthorization,
} from "./ephemeral-database-ownership";
import { destroyProvisionedEphemeralDatabaseWithoutOwnershipStamp } from "./ephemeral-provision-cleanup";
import { randomUUID } from "node:crypto";

const sqlConfig = (credentials: TestSqlCredentials, database: string): sql.config => ({
  server: credentials.host,
  port: credentials.port,
  database,
  user: credentials.user,
  password: credentials.password,
  options: {
    encrypt: credentials.encrypt,
    trustServerCertificate: credentials.trustServerCertificate,
  },
});

const closePoolQuietly = async (pool: sql.ConnectionPool | null | undefined): Promise<void> => {
  if (!pool) {
    return;
  }
  try {
    await pool.close();
  } catch {
    // ignore
  }
};

export type EphemeralIntegrationDatabaseEvidence = {
  databaseName: string;
  runId: string;
  ownershipToken: string;
  orchestratorPid: number;
  createdAtIso: string;
  destroyedAtIso?: string;
  destroyed: boolean;
  serverNames: string[];
  allowedServerName: string;
};

export type EphemeralIntegrationDatabaseHandle = {
  pool: sql.ConnectionPool;
  masterPool: sql.ConnectionPool;
  credentials: TestSqlCredentials;
  evidence: EphemeralIntegrationDatabaseEvidence;
};

export const destroyVerifiedEphemeralDatabase = async (
  masterPool: sql.ConnectionPool,
  databaseName: string,
  credentials: TestSqlCredentials,
  authorization: EphemeralDropAuthorization,
): Promise<void> => {
  assertSafeDropEphemeralDatabase(databaseName);
  await assertTestSqlServerEndpointAllowed(masterPool, credentials, { requireMasterConnection: true });
  await assertEphemeralDatabaseDropAuthorized(masterPool, databaseName, authorization);

  await masterPool.request().query(`
    IF DB_ID(N'${databaseName}') IS NOT NULL
    BEGIN
      ALTER DATABASE [${databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
      DROP DATABASE [${databaseName}];
    END;
  `);

  const check = await masterPool
    .request()
    .input("dbName", sql.NVarChar(128), databaseName)
    .query(`SELECT DB_ID(@dbName) AS db_id`);
  if (check.recordset[0]?.db_id != null) {
    throw new Error(`Ephemeral database still exists after DROP: ${databaseName}`);
  }
};

export const createEphemeralIntegrationDatabase = async (
  credentials: TestSqlCredentials,
  options?: {
    databaseName?: string;
    runId?: string;
    ownershipToken?: string;
    orchestratorPid?: number;
    injectCreateFailure?: boolean;
    injectStampOwnershipFailure?: boolean;
  },
): Promise<EphemeralIntegrationDatabaseHandle> => {
  const databaseName = options?.databaseName ?? generateEphemeralIntegrationDatabaseName();
  const runId = options?.runId ?? databaseName.replace(/^din_test_/, "");
  const ownershipToken = options?.ownershipToken ?? randomUUID();
  const orchestratorPid =
    options?.orchestratorPid ??
    Number(process.env.DINAMIC_INTEGRATION_ORCHESTRATOR_PID ?? process.pid);
  const allowedServerName = process.env.TEST_SQL_ALLOWED_SERVER_NAME?.trim() ?? "";
  assertEphemeralIntegrationDatabaseName(databaseName);

  let masterPool: sql.ConnectionPool | null = null;
  let pool: sql.ConnectionPool | null = null;
  let databaseCreated = false;
  let ownershipStamped = false;

  const evidence: EphemeralIntegrationDatabaseEvidence = {
    databaseName,
    runId,
    ownershipToken,
    orchestratorPid,
    allowedServerName,
    createdAtIso: new Date().toISOString(),
    destroyed: false,
    serverNames: [],
  };

  try {
    masterPool = new sql.ConnectionPool(sqlConfig(credentials, "master"));
    await masterPool.connect();
    const masterIdentity = await assertTestSqlServerEndpointAllowed(masterPool, credentials, {
      requireMasterConnection: true,
    });
    evidence.serverNames = [masterIdentity.serverName, masterIdentity.serverFqdn ?? ""].filter(Boolean);

    await masterPool.request().query(`CREATE DATABASE [${databaseName}]`);
    databaseCreated = true;
    evidence.createdAtIso = new Date().toISOString();

    pool = new sql.ConnectionPool(sqlConfig(credentials, databaseName));
    await pool.connect();

    const connectedIdentity = await readSqlServerEndpointIdentity(pool);
    assertConnectedDatabaseMatches(databaseName, connectedIdentity);

    if (options?.injectStampOwnershipFailure) {
      throw new Error("EPHEMERAL_INTEGRATION_INJECTED_STAMP_OWNERSHIP_FAILURE");
    }
    await stampEphemeralDatabaseOwnership(pool, ownershipToken);
    ownershipStamped = true;

    if (options?.injectCreateFailure) {
      throw new Error("EPHEMERAL_INTEGRATION_INJECTED_CREATE_FAILURE");
    }

    const runtimeCredentials = resolveTestSqlRuntimeCredentials();
    installRuntimeDbEnvFromTestCredentials(runtimeCredentials, databaseName);
    process.env.DINAMIC_INTEGRATION_DATABASE_NAME = databaseName;
    process.env.DINAMIC_TEST_SQL_ACTIVE = "true";

    console.log(
      `[ephemeral-integration] created database=${databaseName} runId=${runId} at=${evidence.createdAtIso}`,
    );

    return { pool, masterPool, credentials, evidence };
  } catch (error) {
    if (databaseCreated && masterPool) {
      await closePoolQuietly(pool);
      pool = null;
      try {
        if (ownershipStamped) {
          await destroyVerifiedEphemeralDatabase(masterPool, databaseName, credentials, {
            ownershipToken,
            orchestratorPid,
            allowForeignSessions: true,
          });
        } else {
          await destroyProvisionedEphemeralDatabaseWithoutOwnershipStamp(
            masterPool,
            databaseName,
            credentials,
            {
              databaseName,
              orchestratorPid,
              createdAtIso: evidence.createdAtIso,
            },
          );
        }
      } catch (cleanupError) {
        const originalMessage = error instanceof Error ? error.message : String(error);
        const cleanupMessage =
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        throw new Error(
          `Ephemeral integration DB failed (${originalMessage}); compensatory cleanup failed (${cleanupMessage}).`,
          { cause: error },
        );
      }
    }
    await closePoolQuietly(pool);
    await closePoolQuietly(masterPool);
    throw error;
  }
};

export const bootstrapEphemeralIntegrationDatabase = async (
  handle: EphemeralIntegrationDatabaseHandle,
): Promise<void> => {
  await runMigrationsOnPool(handle.pool);
  setTestPool(handle.pool);
  await closeDatabase().catch(() => {
    // no-op if global pool was not opened yet
  });
};

export const activateEphemeralIntegrationDatabase = async (
  handle: EphemeralIntegrationDatabaseHandle,
): Promise<void> => {
  installRuntimeDbEnvFromTestCredentials(handle.credentials, handle.evidence.databaseName);
  process.env.DINAMIC_INTEGRATION_DATABASE_NAME = handle.evidence.databaseName;
  process.env.DINAMIC_TEST_SQL_ACTIVE = "true";
  setTestPool(handle.pool);
};

export const destroyEphemeralIntegrationDatabaseByName = async (
  credentials: TestSqlCredentials,
  databaseName: string,
  authorization: EphemeralDropAuthorization,
): Promise<void> => {
  assertEphemeralIntegrationDatabaseName(databaseName);
  const masterPool = new sql.ConnectionPool(sqlConfig(credentials, "master"));
  await masterPool.connect();
  try {
    await destroyVerifiedEphemeralDatabase(masterPool, databaseName, credentials, authorization);
    console.log(`[ephemeral-integration] destroyed database=${databaseName}`);
  } finally {
    await closePoolQuietly(masterPool);
    delete process.env.DINAMIC_INTEGRATION_DATABASE_NAME;
    delete process.env.DINAMIC_TEST_SQL_ACTIVE;
  }
};

export const destroyEphemeralIntegrationDatabase = async (
  handle: EphemeralIntegrationDatabaseHandle,
): Promise<void> => {
  const { databaseName } = handle.evidence;
  assertEphemeralIntegrationDatabaseName(databaseName);

  setTestPool(null);
  await closeDatabase().catch(() => {
    // ignore
  });
  await closePoolQuietly(handle.pool);

  try {
    await destroyVerifiedEphemeralDatabase(handle.masterPool, databaseName, handle.credentials, {
      ownershipToken: handle.evidence.ownershipToken,
      orchestratorPid: handle.evidence.orchestratorPid,
    });
    handle.evidence.destroyed = true;
    handle.evidence.destroyedAtIso = new Date().toISOString();
    console.log(
      `[ephemeral-integration] destroyed database=${databaseName} at=${handle.evidence.destroyedAtIso}`,
    );
  } finally {
    await closePoolQuietly(handle.masterPool);
    delete process.env.DINAMIC_INTEGRATION_DATABASE_NAME;
    delete process.env.DINAMIC_TEST_SQL_ACTIVE;
  }
};