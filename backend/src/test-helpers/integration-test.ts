import { describe } from "node:test";
import { config } from "dotenv";

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

export const requireDinamicCompanyId = async (): Promise<string> => {
  const { companyRepository } = await import("../repositories/company.repository");
  const company = await companyRepository.findByName("Dinamic Systems");
  if (!company) {
    throw new Error("Migration 015 required: Dinamic Systems company is missing");
  }
  return company.id;
};

export const resolveCompanyTodayIso = async (companyId: string): Promise<string> => {
  const { companySettingsRepository } = await import("../repositories/company-settings.repository");
  const { getDateIsoInTimezone } = await import("../utils/absence-date");
  const { resolveOperationTimezone } = await import("../utils/operation-timezone");
  const settings = await companySettingsRepository.findByCompanyId(companyId);
  const timezone = resolveOperationTimezone(settings?.operationTimezone);
  return getDateIsoInTimezone(new Date(), timezone);
};
