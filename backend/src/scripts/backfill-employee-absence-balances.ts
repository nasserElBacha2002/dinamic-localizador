#!/usr/bin/env node
import { config } from "dotenv";
import { connectDatabase, closeDatabase } from "../database/connection";
import type { EmployeeAbsenceBalanceBackfillSummary } from "../services/employee-absence-balance-backfill.service";
import { employeeAbsenceBalanceBackfillService } from "../services/employee-absence-balance-backfill.service";

config();

const LOG_PREFIX = "[absence-backfill]";

type CliOptions = {
  dryRun: boolean;
  companyId?: string;
  year?: number;
};

const printUsage = (): void => {
  console.log(`Usage:
  npm run backfill:absence-balances
  npm run backfill:absence-balances -- --dry-run
  npm run backfill:absence-balances -- --company-id <uuid>
  npm run backfill:absence-balances -- --year 2026
  npm run backfill:absence-balances -- --company-id <uuid> --year 2026 --dry-run

Options:
  --dry-run           Print planned changes without writing
  --company-id <id>   Process a single active company
  --year <number>     Target balance year (default: current year in company timezone)
`);
};

const readFlag = (argv: string[], name: string): boolean => argv.includes(`--${name}`);

const readOption = (argv: string[], name: string): string | undefined => {
  const prefix = `--${name}=`;
  const inlineArg = argv.find((arg) => arg.startsWith(prefix));
  if (inlineArg) {
    return inlineArg.slice(prefix.length);
  }

  const index = argv.indexOf(`--${name}`);
  if (index >= 0) {
    return argv[index + 1];
  }

  return undefined;
};

const parseYear = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) {
    throw new Error("--year must be an integer between 2000 and 2100");
  }

  return parsed;
};

const parseCliOptions = (argv: string[]): CliOptions => {
  const companyId = readOption(argv, "company-id");
  const year = parseYear(readOption(argv, "year"));

  return {
    dryRun: readFlag(argv, "dry-run"),
    companyId,
    year,
  };
};

const logSummary = (summary: EmployeeAbsenceBalanceBackfillSummary): void => {
  if (summary.dryRun) {
    console.info(`${LOG_PREFIX} DRY RUN: no changes will be written`);
  }

  for (const companyResult of summary.companyResults) {
    console.info(`${LOG_PREFIX} Company ${companyResult.companyName} (${companyResult.companyId})`);
    console.info(`${LOG_PREFIX} Year: ${companyResult.year}`);
    console.info(`${LOG_PREFIX} Employees scanned: ${companyResult.employeesScanned}`);
    console.info(`${LOG_PREFIX} Balances created: ${companyResult.balancesCreated}`);
    console.info(`${LOG_PREFIX} Existing balances skipped: ${companyResult.existingBalancesSkipped}`);
    console.info(
      `${LOG_PREFIX} Inactive/disabled absence types skipped: ${companyResult.ineligibleAbsenceTypesSkipped}`,
    );
  }

  if (summary.companyResults.length > 1) {
    console.info(`${LOG_PREFIX} ---`);
    console.info(`${LOG_PREFIX} Companies processed: ${summary.companiesProcessed}`);
    console.info(`${LOG_PREFIX} Employees scanned: ${summary.employeesScanned}`);
    console.info(`${LOG_PREFIX} Balances created: ${summary.balancesCreated}`);
    console.info(`${LOG_PREFIX} Existing balances skipped: ${summary.existingBalancesSkipped}`);
    console.info(
      `${LOG_PREFIX} Inactive/disabled absence types skipped: ${summary.ineligibleAbsenceTypesSkipped}`,
    );
  }

  for (const error of summary.errors) {
    console.error(
      `${LOG_PREFIX} Company ${error.companyName} (${error.companyId}) failed: ${error.message}`,
    );
  }

  console.info(`${LOG_PREFIX} Done`);
};

const main = async (): Promise<void> => {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  let options: CliOptions;
  try {
    options = parseCliOptions(process.argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    printUsage();
    process.exit(1);
  }

  console.info(`${LOG_PREFIX} Starting employee absence balance backfill`);

  await connectDatabase();

  try {
    const summary = await employeeAbsenceBalanceBackfillService.backfillAllCompanies(options);
    logSummary(summary);

    if (summary.errors.length > 0) {
      process.exit(1);
    }
  } finally {
    await closeDatabase();
  }
};

main().catch((error) => {
  console.error(`${LOG_PREFIX} Fatal error`, error);
  process.exit(1);
});
