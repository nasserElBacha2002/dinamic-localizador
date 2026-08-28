import sql from "mssql";
import { createDedicatedDatabaseConnection } from "../database/connection";

const SESSION_LOCK_SQL = `
      DECLARE @result INT;
      EXEC @result = sp_getapplock
        @Resource = @resource,
        @LockMode = N'Exclusive',
        @LockOwner = N'Session',
        @LockTimeout = @lockTimeout;
      SELECT @result AS lockResult;
    `;

const SESSION_RELEASE_SQL = `
      EXEC sp_releaseapplock
        @Resource = @resource,
        @LockOwner = N'Session';
    `;

const tryAcquireSessionAppLockOnConnection = async (
  connection: sql.ConnectionPool,
  input: { resource: string; lockTimeoutMs?: number },
): Promise<boolean> => {
  const lockTimeoutMs = input.lockTimeoutMs ?? 0;
  const result = await connection
    .request()
    .input("resource", sql.NVarChar(255), input.resource)
    .input("lockTimeout", sql.Int, lockTimeoutMs)
    .query(SESSION_LOCK_SQL);

  const lockResult = Number(result.recordset[0]?.lockResult ?? -999);
  return lockResult >= 0;
};

const releaseSessionAppLockOnConnection = async (
  connection: sql.ConnectionPool,
  resource: string,
): Promise<void> => {
  await connection.request().input("resource", sql.NVarChar(255), resource).query(SESSION_RELEASE_SQL);
};

export type DedicatedSessionAppLockResult<T> =
  | { outcome: "locked"; value: T }
  | { outcome: "skipped" };

/**
 * Runs fn while holding a session app lock on a dedicated SQL connection.
 * Acquire and release always use the same physical session.
 */
export const withDedicatedSessionAppLock = async <T>(
  resource: string,
  fn: () => Promise<T>,
  input?: { lockTimeoutMs?: number },
): Promise<DedicatedSessionAppLockResult<T>> => {
  const connection = await createDedicatedDatabaseConnection();
  try {
    const acquired = await tryAcquireSessionAppLockOnConnection(connection, {
      resource,
      lockTimeoutMs: input?.lockTimeoutMs ?? 0,
    });
    if (!acquired) {
      return { outcome: "skipped" };
    }

    try {
      const value = await fn();
      return { outcome: "locked", value };
    } finally {
      await releaseSessionAppLockOnConnection(connection, resource);
    }
  } finally {
    await connection.close();
  }
};

/** Test helper: hold lock until release() is called. */
export const acquireDedicatedSessionAppLockForTests = async (resource: string): Promise<{
  connection: sql.ConnectionPool;
  release: () => Promise<void>;
}> => {
  const connection = await createDedicatedDatabaseConnection();
  const acquired = await tryAcquireSessionAppLockOnConnection(connection, {
    resource,
    lockTimeoutMs: 0,
  });
  if (!acquired) {
    await connection.close();
    throw new Error("TEST_LOCK_NOT_ACQUIRED");
  }

  return {
    connection,
    release: async () => {
      try {
        await releaseSessionAppLockOnConnection(connection, resource);
      } finally {
        await connection.close();
      }
    },
  };
};
