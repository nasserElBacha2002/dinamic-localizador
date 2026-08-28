import sql from "mssql";
import { AppError } from "../errors/app-error";

/**
 * Transaction-owned SQL Server application lock (sp_getapplock).
 * Released automatically on COMMIT/ROLLBACK when LockOwner = Transaction.
 *
 * Return codes (Microsoft docs):
 *   0  = lock granted synchronously
 *   1  = lock granted after waiting
 *  -1  = timeout
 *  -2  = canceled
 *  -3  = deadlock victim
 *  other negatives = error
 */
export const APP_LOCK_SQL = `
      DECLARE @result INT;
      EXEC @result = sp_getapplock
        @Resource = @resource,
        @LockMode = N'Exclusive',
        @LockOwner = N'Transaction',
        @LockTimeout = @lockTimeout;
      SELECT @result AS lockResult;
    `;

export type SqlAppLockRequest = {
  input: (name: string, type: unknown, value: unknown) => SqlAppLockRequest;
  query: (q: string) => Promise<{ recordset: Array<{ lockResult?: number }> }>;
};

/**
 * Maps sp_getapplock return codes to AppError. Success codes (>= 0) are no-ops.
 */
export const interpretAppLockResult = (
  lockResult: number,
  timeoutError?: AppError,
): void => {
  if (lockResult >= 0) {
    return;
  }

  if (lockResult === -1) {
    throw (
      timeoutError ??
      new AppError(
        409,
        "APP_LOCK_TIMEOUT",
        "No se pudo adquirir el bloqueo. Reintentá.",
      )
    );
  }

  if (lockResult === -2) {
    throw new AppError(
      409,
      "APP_LOCK_CANCELLED",
      "El bloqueo de aplicación fue cancelado. Reintentá.",
    );
  }

  if (lockResult === -3) {
    throw new AppError(
      409,
      "APP_LOCK_DEADLOCK",
      "Conflicto de bloqueo (deadlock). Reintentá.",
    );
  }

  throw new AppError(
    500,
    "APP_LOCK_ERROR",
    "Error al adquirir el bloqueo de aplicación.",
  );
};

export const acquireTransactionAppLockWithRequest = async (
  request: SqlAppLockRequest,
  input: {
    resource: string;
    lockTimeoutMs?: number;
    timeoutError?: AppError;
  },
): Promise<void> => {
  const lockTimeoutMs = input.lockTimeoutMs ?? 15000;
  const result = await request
    .input("resource", sql.NVarChar(255), input.resource)
    .input("lockTimeout", sql.Int, lockTimeoutMs)
    .query(APP_LOCK_SQL);

  const lockResult = Number(result.recordset[0]?.lockResult ?? -999);
  interpretAppLockResult(lockResult, input.timeoutError);
};

export const acquireTransactionAppLock = async (
  transaction: sql.Transaction,
  input: {
    resource: string;
    lockTimeoutMs?: number;
    timeoutError?: AppError;
  },
): Promise<void> => {
  await acquireTransactionAppLockWithRequest(new sql.Request(transaction), input);
};

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

/** Session-scoped app lock for long-running batch jobs (must call releaseSessionAppLock). */
export const tryAcquireSessionAppLock = async (
  request: sql.Request,
  input: { resource: string; lockTimeoutMs?: number },
): Promise<boolean> => {
  const lockTimeoutMs = input.lockTimeoutMs ?? 0;
  const result = await request
    .input("resource", sql.NVarChar(255), input.resource)
    .input("lockTimeout", sql.Int, lockTimeoutMs)
    .query(SESSION_LOCK_SQL);

  const lockResult = Number(result.recordset[0]?.lockResult ?? -999);
  return lockResult >= 0;
};

export const releaseSessionAppLock = async (
  request: sql.Request,
  resource: string,
): Promise<void> => {
  await request.input("resource", sql.NVarChar(255), resource).query(SESSION_RELEASE_SQL);
};

export const absenceEmployeeLockResource = (companyId: string, employeeId: string): string =>
  `absence:${companyId}:${employeeId}`.toLowerCase();
