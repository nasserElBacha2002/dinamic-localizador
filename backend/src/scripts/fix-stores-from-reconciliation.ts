#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { resolve } from "node:path";
import { config } from "dotenv";
import { env } from "../config/env";
import { applyFixes, verifyAppliedFixes } from "../utils/store-fix/apply";
import { buildCurrentDbState } from "../utils/store-fix/current-db";
import {
  buildEnvironmentSnapshot,
  loadCurrentStoresFromDatabase,
  printStartupSummary,
} from "../utils/store-fix/db-stores";
import {
  loadDuplicateRows,
  loadOfficialSourceRows,
  loadReconciliationRows,
} from "../utils/store-fix/csv";
import { writeFixPlanOutputs } from "../utils/store-fix/output";
import { buildFixPlan, selectFixesToApply } from "../utils/store-fix/plan";
import type { FixPlanOptions } from "../utils/store-fix/types";

config();

interface CliOptions {
  summaryPath: string;
  missingPath: string;
  duplicatesPath: string;
  addressMismatchesPath: string;
  coordinateMismatchesPath: string;
  officialPath?: string;
  outDir: string;
  generateSql: boolean;
  apply: boolean;
  yes: boolean;
  confirmProduction: boolean;
  verifyAfterApply: boolean;
  includeReviewCoordinates: boolean;
  fixAddresses: boolean;
  insertMissing: boolean;
  deactivateDuplicates: boolean;
  deactivateExtra: boolean;
  fixNonnumericNames: boolean;
}

const printUsage = (): void => {
  console.log(`Usage:
  npm run fix:stores -- \\
    --summary ./reports/store_reconciliation_summary.csv \\
    --missing ./reports/missing_in_database.csv \\
    --duplicates ./reports/duplicate_store_numbers.csv \\
    --address-mismatches ./reports/address_mismatches.csv \\
    --coordinate-mismatches ./reports/coordinate_mismatches.csv \\
    --out ./reports/store-fixes

Options:
  --official <path>              Carrefour official CSV (optional, for missing inserts)
  --generate-sql                 Generate proposed_store_updates.sql (default in dry-run)
  --apply                        Apply selected fixes to the database
  --yes                          Skip interactive confirmation in apply mode
  --confirm-production           Required with --apply when NODE_ENV=production
  --verify-after-apply           Re-read affected rows after apply
  --include-review-coordinates   Include coordinate fixes with distance > 100m and <= 300m
  --fix-addresses                Include address updates in apply mode
  --insert-missing               Include missing store inserts in apply mode
  --deactivate-duplicates        Deactivate high-confidence duplicate rows
  --fix-nonnumeric-names         Rename non-numeric store names when address matches missing official row
  --deactivate-extra             Deactivate extra numeric stores (review only by default)

The script always connects to the current environment database before planning fixes.
Default behavior is DRY RUN. Only coordinate fixes with recomputed distance > 300m are apply_by_default=true.
`);
};

const parseCliOptions = (argv: string[]): CliOptions => {
  const options: Partial<CliOptions> = {
    outDir: "./reports/store-fixes",
    generateSql: true,
    apply: false,
    yes: false,
    confirmProduction: false,
    verifyAfterApply: false,
    includeReviewCoordinates: false,
    fixAddresses: false,
    insertMissing: false,
    deactivateDuplicates: false,
    deactivateExtra: false,
    fixNonnumericNames: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--summary":
        options.summaryPath = next;
        index += 1;
        break;
      case "--missing":
        options.missingPath = next;
        index += 1;
        break;
      case "--duplicates":
        options.duplicatesPath = next;
        index += 1;
        break;
      case "--address-mismatches":
        options.addressMismatchesPath = next;
        index += 1;
        break;
      case "--coordinate-mismatches":
        options.coordinateMismatchesPath = next;
        index += 1;
        break;
      case "--official":
        options.officialPath = next;
        index += 1;
        break;
      case "--out":
        options.outDir = next;
        index += 1;
        break;
      case "--generate-sql":
        options.generateSql = true;
        break;
      case "--apply":
        options.apply = true;
        break;
      case "--yes":
        options.yes = true;
        break;
      case "--confirm-production":
        options.confirmProduction = true;
        break;
      case "--verify-after-apply":
        options.verifyAfterApply = true;
        break;
      case "--include-review-coordinates":
        options.includeReviewCoordinates = true;
        break;
      case "--fix-addresses":
        options.fixAddresses = true;
        break;
      case "--insert-missing":
        options.insertMissing = true;
        break;
      case "--deactivate-duplicates":
        options.deactivateDuplicates = true;
        break;
      case "--fix-nonnumeric-names":
        options.fixNonnumericNames = true;
        break;
      case "--deactivate-extra":
        options.deactivateExtra = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (
    !options.summaryPath ||
    !options.missingPath ||
    !options.duplicatesPath ||
    !options.addressMismatchesPath ||
    !options.coordinateMismatchesPath
  ) {
    printUsage();
    throw new Error("Missing required report paths");
  }

  return options as CliOptions;
};

const printPlanSummary = (plan: ReturnType<typeof buildFixPlan>, selectedCount: number): void => {
  console.log("");
  console.log("Fix plan summary");
  console.log(`- Coordinate updates proposed: ${plan.summary.totalCoordinateUpdatesProposed}`);
  console.log(`- Address updates proposed: ${plan.summary.totalAddressUpdatesProposed}`);
  console.log(`- Missing insert candidates: ${plan.summary.totalMissingInsertCandidates}`);
  console.log(`- Duplicate groups: ${plan.summary.totalDuplicateGroups}`);
  console.log(`- Duplicate deactivation candidates: ${plan.summary.totalDuplicateDeactivationCandidates}`);
  console.log(`- Skipped: ${plan.summary.totalSkipped}`);
  console.log(`- Apply by default: ${plan.summary.totalApplyDefault}`);
  console.log(`- Selected for apply: ${selectedCount}`);
};

const confirmApply = async (count: number): Promise<boolean> => {
  const rl = createInterface({ input, output });
  const answer = await rl.question(
    `Apply ${count} change(s) to the database? Type 'yes' to continue: `,
  );
  rl.close();
  return answer.trim().toLowerCase() === "yes";
};

const assertProductionApplyAllowed = (cli: CliOptions): void => {
  if (env.NODE_ENV !== "production" || !cli.apply) {
    return;
  }

  if (!cli.confirmProduction || !cli.yes) {
    throw new Error(
      "production_confirmation_missing: apply in production requires --confirm-production and --yes",
    );
  }

  console.log("");
  console.log("=".repeat(72));
  console.log("WARNING: APPLYING STORE FIXES TO PRODUCTION DATABASE");
  console.log(`Target: ${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`);
  console.log("=".repeat(72));
  console.log("");
};

const main = async (): Promise<void> => {
  const cli = parseCliOptions(process.argv);
  assertProductionApplyAllowed(cli);

  const planOptions: FixPlanOptions = {
    includeReviewCoordinates: cli.includeReviewCoordinates,
    fixAddresses: cli.fixAddresses,
    insertMissing: cli.insertMissing,
    deactivateDuplicates: cli.deactivateDuplicates,
    deactivateExtra: cli.deactivateExtra,
    fixNonnumericNames: cli.fixNonnumericNames,
  };

  const { stores } = await loadCurrentStoresFromDatabase();
  const currentDb = buildCurrentDbState(stores);
  const environmentSnapshot = buildEnvironmentSnapshot(
    stores,
    currentDb.duplicateNumericGroups.size,
  );

  printStartupSummary({
    mode: cli.apply ? "apply" : "dry-run",
    snapshot: environmentSnapshot,
  });

  const summaryRows = loadReconciliationRows(resolve(cli.summaryPath));
  const missingRows = loadReconciliationRows(resolve(cli.missingPath));
  const duplicateRows = loadDuplicateRows(resolve(cli.duplicatesPath));
  const addressMismatchRows = loadReconciliationRows(resolve(cli.addressMismatchesPath));
  const coordinateMismatchRows = loadReconciliationRows(resolve(cli.coordinateMismatchesPath));
  const officialRows = loadOfficialSourceRows(cli.officialPath ? resolve(cli.officialPath) : undefined);

  const plan = buildFixPlan(
    summaryRows,
    missingRows,
    duplicateRows,
    addressMismatchRows,
    coordinateMismatchRows,
    officialRows,
    currentDb,
    environmentSnapshot,
    planOptions,
  );

  const selectedFixes = selectFixesToApply(plan, planOptions);

  const outDir = resolve(cli.outDir);
  writeFixPlanOutputs(outDir, plan, plan.proposed);
  printPlanSummary(plan, selectedFixes.length);

  if (!cli.apply) {
    console.log("");
    console.log("DRY RUN complete. No database changes were made.");
    console.log("Review proposed_store_updates.sql and proposed_store_fixes.csv before applying.");
    return;
  }

  if (selectedFixes.length === 0) {
    console.log("No fixes selected for apply.");
    return;
  }

  if (!cli.yes) {
    const confirmed = await confirmApply(selectedFixes.length);
    if (!confirmed) {
      console.log("Apply cancelled.");
      return;
    }
  }

  const missingMeta = new Map(
    plan.missingInserts.map((row) => [
      row.storeNumber,
      { neighborhood: row.neighborhood, locality: row.locality },
    ]),
  );

  const result = await applyFixes(selectedFixes, missingMeta);
  console.log("");
  console.log(`Applied ${result.applied} change(s).`);
  for (const detail of result.details) {
    console.log(`- ${detail}`);
  }

  if (cli.verifyAfterApply) {
    const verification = await verifyAppliedFixes(selectedFixes);
    const failed = verification.filter((row) => !row.verified);
    console.log("");
    console.log(`Verification: ${verification.length - failed.length}/${verification.length} passed`);
    for (const row of failed) {
      console.log(`- FAILED ${row.dbId}: ${row.details}`);
    }
  }
};

void main().catch((error) => {
  console.error("Service fix script failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
