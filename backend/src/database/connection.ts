import sql from "mssql";
import { env } from "../config/env";

const parseBooleanEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
};

const requireRuntimeTestDbEnv = (key: string): string => {
  const value = process.env[key]?.trim() ?? "";
  if (!value) {
    throw new Error(
      `Refusing test SQL connection: missing ${key} in ephemeral runtime (stale env.* fallback blocked).`,
    );
  }
  return value;
};

const resolvePoolConfig = (): sql.config => {
  const useRuntimeEnv =
    process.env.DINAMIC_TEST_SQL_ACTIVE === "true" && process.env.RUN_DB_INTEGRATION_TESTS === "true";

  const server = useRuntimeEnv ? requireRuntimeTestDbEnv("DB_HOST") : env.DB_HOST;
  const port = useRuntimeEnv ? Number(requireRuntimeTestDbEnv("DB_PORT")) : env.DB_PORT;
  const database = useRuntimeEnv ? requireRuntimeTestDbEnv("DB_NAME") : env.DB_NAME;
  const user = useRuntimeEnv ? requireRuntimeTestDbEnv("DB_USER") : env.DB_USER;
  const password = useRuntimeEnv ? requireRuntimeTestDbEnv("DB_PASSWORD") : env.DB_PASSWORD;
  const encrypt = useRuntimeEnv
    ? parseBooleanEnv(process.env.DB_ENCRYPT, env.DB_ENCRYPT)
    : env.DB_ENCRYPT;
  const trustServerCertificate = useRuntimeEnv
    ? parseBooleanEnv(process.env.DB_TRUST_SERVER_CERTIFICATE, env.DB_TRUST_SERVER_CERTIFICATE)
    : env.DB_TRUST_SERVER_CERTIFICATE;

  return {
    server,
    port,
    database,
    user,
    password,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    options: {
      encrypt,
      trustServerCertificate,
    },
  };
};

/** Dedicated single-connection pool for session-scoped sp_getapplock ownership. */
export const createDedicatedDatabaseConnection = async (): Promise<sql.ConnectionPool> => {
  const dedicated = new sql.ConnectionPool({
    ...resolvePoolConfig(),
    pool: { max: 1, min: 1, idleTimeoutMillis: 30000 },
  });
  try {
    await dedicated.connect();
    if (process.env.RUN_DB_INTEGRATION_TESTS === "true") {
      const { assertTestSqlConnectionAllowed } = await import(
        "../test-helpers/integration-test-sql-guard"
      );
      await assertTestSqlConnectionAllowed(dedicated);
    }
    return dedicated;
  } catch (error) {
    await dedicated.close().catch(() => {
      // ignore
    });
    throw error;
  }
};

let pool: sql.ConnectionPool | null = null;
let testPoolOverride: sql.ConnectionPool | null = null;

/** Test-only hook to avoid mocking module bindings in unit tests. */
export const setTestPool = (override: sql.ConnectionPool | null): void => {
  testPoolOverride = override;
};

export const connectDatabase = async (): Promise<sql.ConnectionPool> => {
  if (pool?.connected) {
    return pool;
  }

  const candidate = new sql.ConnectionPool(resolvePoolConfig());
  try {
    await candidate.connect();

    if (process.env.RUN_DB_INTEGRATION_TESTS === "true") {
      const { assertTestSqlConnectionAllowed } = await import(
        "../test-helpers/integration-test-sql-guard"
      );
      await assertTestSqlConnectionAllowed(candidate);
    }

    pool = candidate;
    console.log("Database connection established.");
    return pool;
  } catch (error) {
    await candidate.close().catch(() => {
      // ignore close errors when connect/guard fails
    });
    throw error;
  }
};

export const closeDatabase = async (): Promise<void> => {
  if (pool) {
    await pool.close();
    pool = null;
    console.log("Database connection closed.");
  }
};

export const isDatabasePoolInitialized = (): boolean =>
  Boolean(testPoolOverride || pool?.connected);

export const getPool = (): sql.ConnectionPool => {
  if (testPoolOverride) {
    return testPoolOverride;
  }

  if (!pool?.connected) {
    throw new Error("Database pool is not initialized.");
  }

  return pool;
};
