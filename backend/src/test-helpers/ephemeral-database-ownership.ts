import type { ConnectionPool } from "mssql";
import sql from "mssql";
import { assertSafeDropEphemeralDatabase } from "./test-sql-server-guard";

export const EPHEMERAL_DB_OWNER_PROPERTY = "dinamic_test_owner_token";

export const stampEphemeralDatabaseOwnership = async (
  pool: ConnectionPool,
  ownershipToken: string,
): Promise<void> => {
  await pool.request().input("token", sql.NVarChar(64), ownershipToken).query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.extended_properties ep
      INNER JOIN sys.databases d ON d.name = DB_NAME()
      WHERE ep.major_id = 0 AND ep.minor_id = 0 AND ep.name = N'${EPHEMERAL_DB_OWNER_PROPERTY}'
    )
    BEGIN
      EXEC sys.sp_addextendedproperty
        @name = N'${EPHEMERAL_DB_OWNER_PROPERTY}',
        @value = @token;
    END
    ELSE
    BEGIN
      EXEC sys.sp_updateextendedproperty
        @name = N'${EPHEMERAL_DB_OWNER_PROPERTY}',
        @value = @token;
    END
  `);
};

export const readEphemeralDatabaseOwnershipToken = async (
  masterPool: ConnectionPool,
  databaseName: string,
): Promise<string | null> => {
  const result = await masterPool
    .request()
    .input("dbName", sql.NVarChar(128), databaseName)
    .query(`
      DECLARE @sql NVARCHAR(MAX) =
        N'USE ' + QUOTENAME(@dbName) + N';
        SELECT CAST(ep.value AS NVARCHAR(64)) AS owner_token
        FROM sys.extended_properties ep
        WHERE ep.major_id = 0
          AND ep.minor_id = 0
          AND ep.name = N''${EPHEMERAL_DB_OWNER_PROPERTY}'';';
      EXEC sp_executesql @sql;
    `);
  const token = result.recordset[0]?.owner_token;
  return token ? String(token) : null;
};

export const countForeignSessionsOnDatabase = async (
  masterPool: ConnectionPool,
  databaseName: string,
): Promise<number> => {
  const result = await masterPool
    .request()
    .input("dbName", sql.NVarChar(128), databaseName)
    .query(`
      SELECT COUNT(*) AS session_count
      FROM sys.dm_exec_sessions s
      WHERE s.database_id = DB_ID(@dbName)
        AND s.session_id <> @@SPID
        AND s.is_user_process = 1
    `);
  return Number(result.recordset[0]?.session_count ?? 0);
};

export type EphemeralDropAuthorization = {
  ownershipToken: string;
  orchestratorPid?: number;
  allowForeignSessions?: boolean;
};

export const assertEphemeralDatabaseDropAuthorized = async (
  masterPool: ConnectionPool,
  databaseName: string,
  authorization: EphemeralDropAuthorization,
): Promise<void> => {
  assertSafeDropEphemeralDatabase(databaseName);

  const exists = await masterPool
    .request()
    .input("dbName", sql.NVarChar(128), databaseName)
    .query(`SELECT DB_ID(@dbName) AS db_id`);
  if (exists.recordset[0]?.db_id == null) {
    return;
  }

  const tokenOnDb = await readEphemeralDatabaseOwnershipToken(masterPool, databaseName);
  if (!tokenOnDb) {
    throw new Error(
      `Refusing DROP DATABASE ${databaseName}: missing ownership marker ${EPHEMERAL_DB_OWNER_PROPERTY}.`,
    );
  }
  if (tokenOnDb !== authorization.ownershipToken) {
    throw new Error(
      `Refusing DROP DATABASE ${databaseName}: ownership token mismatch (not owned by this test run).`,
    );
  }

  if (
    authorization.orchestratorPid != null &&
    process.env.DINAMIC_INTEGRATION_ORCHESTRATOR_PID &&
    Number(process.env.DINAMIC_INTEGRATION_ORCHESTRATOR_PID) !== authorization.orchestratorPid
  ) {
    throw new Error(
      `Refusing DROP DATABASE ${databaseName}: orchestrator pid ${process.env.DINAMIC_INTEGRATION_ORCHESTRATOR_PID} does not own session ${authorization.orchestratorPid}.`,
    );
  }

  if (!authorization.allowForeignSessions) {
    const foreignSessions = await countForeignSessionsOnDatabase(masterPool, databaseName);
    if (foreignSessions > 0) {
      throw new Error(
        `Refusing DROP DATABASE ${databaseName}: ${foreignSessions} foreign user session(s) still active.`,
      );
    }
  }
};