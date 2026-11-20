import { describe } from "node:test";
import { config } from "dotenv";
import type { ConnectionPool } from "mssql";

config();

const REQUIRED_INTEGRATION_ENV = [
  "FRONTEND_URL",
  "TZ",
  "DB_HOST",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "JWT_SECRET",
] as const;

/** CI and local Docker SQL use this database name (see quality-gate.yml). */
export const INTEGRATION_DATABASE_NAME = "dinamic_attendance";

/**
 * Guards test-only DDL/repair helpers. Test opt-in (RUN_DB_INTEGRATION_TESTS) is separate from
 * explicit schema DDL authorization (INTEGRATION_SQL_DDL_ALLOWED). CI sets the latter on disposable SQL.
 */
export const assertSafeIntegrationDatabaseTarget = (): void => {
  if (process.env.RUN_DB_INTEGRATION_TESTS !== "true") {
    throw new Error("Refusing integration SQL DDL: RUN_DB_INTEGRATION_TESTS is not true.");
  }
  if (process.env.INTEGRATION_SQL_DDL_ALLOWED !== "true") {
    throw new Error(
      "Refusing integration SQL DDL: INTEGRATION_SQL_DDL_ALLOWED is not true (explicit disposable-target authorization required).",
    );
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing integration SQL DDL when NODE_ENV=production.");
  }

  const dbName = process.env.DB_NAME?.trim() ?? "";
  if (dbName !== INTEGRATION_DATABASE_NAME) {
    throw new Error(
      `Refusing integration SQL DDL on DB_NAME=${dbName || "(empty)"}; expected ${INTEGRATION_DATABASE_NAME}.`,
    );
  }
};

/**
 * Confirms the live SQL connection matches the configured disposable integration target.
 * Call after connectDatabase() and before applying test-only DDL.
 */
export const assertSafeIntegrationDatabaseConnectedTarget = async (
  pool: ConnectionPool,
): Promise<void> => {
  assertSafeIntegrationDatabaseTarget();

  const result = await pool.request().query(`
    SELECT DB_NAME() AS connected_db_name
  `);

  const connectedDbName = String(result.recordset[0]?.connected_db_name ?? "");
  const expectedDbName = process.env.DB_NAME?.trim() ?? "";
  if (connectedDbName !== expectedDbName) {
    throw new Error(
      `Refusing integration SQL DDL: connected DB_NAME()=${connectedDbName} but DB_NAME env=${expectedDbName}.`,
    );
  }

  const migrationTable = await pool.request().query(`
    SELECT 1 AS found
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'system_migrations'
  `);
  if (!migrationTable.recordset[0]) {
    throw new Error(
      "Refusing integration SQL DDL: system_migrations is missing (target is not a migrated integration database).",
    );
  }
};

/** Requires explicit opt-in so CI/unit runs do not attempt localhost SQL connections. */
export const isDatabaseIntegrationEnabled = (): boolean =>
  process.env.RUN_DB_INTEGRATION_TESTS === "true" &&
  REQUIRED_INTEGRATION_ENV.every((key) => Boolean(process.env[key]));

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
