/**
 * DIN-462 — dedicated SQL credentials for integration tests.
 * Application `DB_*` from backend/.env must never be used for test SQL.
 */

export type TestSqlCredentials = {
  host: string;
  port: number;
  user: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
};

const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return defaultValue;
};

const requireNonEmpty = (key: string, value: string | undefined): string => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    throw new Error(
      `Refusing test SQL: ${key} is required (do not use backend/.env DB_* for integration tests).`,
    );
  }
  return trimmed;
};

import { assertTestSqlDisposableEnvironmentConfigured, assertTestSqlLoginAllowed } from "./test-sql-disposable-env";

const buildCredentials = (
  user: string,
  password: string,
): TestSqlCredentials => {
  const host = requireNonEmpty("TEST_DB_HOST", process.env.TEST_DB_HOST);
  const portRaw = requireNonEmpty("TEST_DB_PORT", process.env.TEST_DB_PORT);
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Refusing test SQL: TEST_DB_PORT must be a positive integer, got "${portRaw}".`);
  }
  assertTestSqlLoginAllowed(user);

  return {
    host,
    port,
    user,
    password,
    encrypt: parseBoolean(process.env.TEST_DB_ENCRYPT, false),
    trustServerCertificate: parseBoolean(process.env.TEST_DB_TRUST_SERVER_CERTIFICATE, true),
  };
};

/** Runtime pool identity (DDL normally disallowed except ephemeral factories). */
export const resolveTestSqlRuntimeCredentials = (): TestSqlCredentials => {
  assertTestSqlDisposableEnvironmentConfigured();
  return buildCredentials(
    requireNonEmpty("TEST_DB_USER", process.env.TEST_DB_USER),
    requireNonEmpty("TEST_DB_PASSWORD", process.env.TEST_DB_PASSWORD),
  );
};

/** CREATE/DROP DATABASE and migration bootstrap. */
export const resolveTestSqlProvisionCredentials = (): TestSqlCredentials => {
  assertTestSqlDisposableEnvironmentConfigured();
  const user =
    process.env.TEST_DB_PROVISION_USER?.trim() ||
    requireNonEmpty("TEST_DB_USER", process.env.TEST_DB_USER);
  const password =
    process.env.TEST_DB_PROVISION_PASSWORD?.trim() ||
    requireNonEmpty("TEST_DB_PASSWORD", process.env.TEST_DB_PASSWORD);
  return buildCredentials(user, password);
};

/** @deprecated alias */
export const resolveTestSqlCredentials = resolveTestSqlRuntimeCredentials;

/**
 * Unit tests: unreachable placeholder credentials so accidental `connectDatabase()` fails fast.
 */
export const UNIT_TEST_SQL_PLACEHOLDER = {
  DB_HOST: "127.0.0.1",
  DB_PORT: "1",
  DB_NAME: "__unit_test_no_database__",
  DB_USER: "__unit_test_no_sql_user__",
  DB_PASSWORD: "__unit_test_no_sql_password__",
} as const;

export const installRuntimeDbEnvFromTestCredentials = (
  credentials: TestSqlCredentials,
  databaseName: string,
): void => {
  process.env.DB_HOST = credentials.host;
  process.env.DB_PORT = String(credentials.port);
  process.env.DB_USER = credentials.user;
  process.env.DB_PASSWORD = credentials.password;
  process.env.DB_NAME = databaseName;
  process.env.DB_ENCRYPT = credentials.encrypt ? "true" : "false";
  process.env.DB_TRUST_SERVER_CERTIFICATE = credentials.trustServerCertificate ? "true" : "false";
};

export const stripApplicationDatabaseEnvFromProcess = (): void => {
  for (const key of ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"] as const) {
    delete process.env[key];
  }
};