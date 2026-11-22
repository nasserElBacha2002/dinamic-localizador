import { describe } from "node:test";
import type { ConnectionPool } from "mssql";
import { isEphemeralIntegrationDatabaseName } from "./ephemeral-database-names";
import {
  assertIntegrationDdlAllowed,
  assertSafeIntegrationDatabaseConnectedTarget,
  assertTestSqlConnectionAllowed,
} from "./integration-test-sql-guard";
import { assertIntegrationDatabaseNameIsEphemeral } from "./test-sql-server-guard";

const REQUIRED_INTEGRATION_ENV = [
  "FRONTEND_URL",
  "TZ",
  "TEST_DB_HOST",
  "TEST_DB_PORT",
  "TEST_DB_USER",
  "TEST_DB_PASSWORD",
  "JWT_SECRET",
  "DINAMIC_INTEGRATION_DATABASE_NAME",
  "DINAMIC_TEST_SQL_ACTIVE",
] as const;

/** @deprecated Persistent shared integration DB — use ephemeral `din_test_<uuid>` only. */
export const INTEGRATION_DATABASE_NAME = "dinamic_attendance";

export const assertSafeIntegrationDatabaseTarget = (): void => {
  assertIntegrationDdlAllowed();
  const dbName =
    process.env.DINAMIC_INTEGRATION_DATABASE_NAME?.trim() || process.env.DB_NAME?.trim() || "";
  assertIntegrationDatabaseNameIsEphemeral(dbName);
};

export { assertSafeIntegrationDatabaseConnectedTarget };

/** Requires explicit opt-in and a provisioned ephemeral session. */
export const isDatabaseIntegrationEnabled = (): boolean => {
  if (process.env.RUN_DB_INTEGRATION_TESTS !== "true") {
    return false;
  }
  if (process.env.DINAMIC_TEST_SQL_ACTIVE !== "true") {
    return false;
  }
  if (!REQUIRED_INTEGRATION_ENV.every((key) => Boolean(process.env[key]))) {
    return false;
  }
  const dbName = process.env.DINAMIC_INTEGRATION_DATABASE_NAME?.trim() ?? "";
  return isEphemeralIntegrationDatabaseName(dbName);
};

/** Use instead of `describe` for suites that require a live SQL Server database. */
export const describeDatabaseIntegration = isDatabaseIntegrationEnabled()
  ? describe
  : describe.skip;

export const setupDatabaseIntegration = async () => {
  const { connectDatabase } = await import("../database/connection");
  await connectDatabase();
};

export const teardownDatabaseIntegration = async () => {
  const { closeDatabase } = await import("../database/connection");
  await closeDatabase();
};

export const assertLiveIntegrationPoolTarget = async (pool: ConnectionPool): Promise<void> => {
  await assertTestSqlConnectionAllowed(pool);
};

/**
 * Prefer `createIntegrationFixtureTracker` from `./integration-cleanup` for suites that
 * insert employees/operations into a shared company (e.g. Dinamic Systems). Track every
 * created ID and call `fixtures.cleanup()` in `after()` before teardown.
 */
export { createIntegrationFixtureTracker } from "./integration-cleanup";

export const requireDinamicCompanyId = async (): Promise<string> => {
  const { companyRepository } = await import("../repositories/companies/company.repository");
  const company = await companyRepository.findByName("Dinamic Systems");
  if (!company) {
    throw new Error("Migration 015 required: Dinamic Systems company is missing");
  }
  return company.id;
};

export const resolveCompanyTodayIso = async (companyId: string): Promise<string> => {
  const { companySettingsRepository } = await import("../repositories/companies/company-settings.repository");
  const { getDateIsoInTimezone } = await import("../utils/absence-date");
  const { resolveOperationTimezone } = await import("../utils/operations/operation-timezone");
  const settings = await companySettingsRepository.findByCompanyId(companyId);
  const timezone = resolveOperationTimezone(settings?.operationTimezone);
  return getDateIsoInTimezone(new Date(), timezone);
};

/** Normalizes SQL DATE values returned by mssql/tedious for stable ISO comparisons. */
export const normalizeSqlDateIso = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return text.slice(0, 10);
};