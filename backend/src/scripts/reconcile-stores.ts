#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { config } from "dotenv";
import {
  buildReconciliationCsv,
  DUPLICATE_HEADERS,
  loadDatabaseStores,
  loadOfficialStores,
  reconciliationRowToCsv,
  SUMMARY_HEADERS,
} from "../utils/store-reconciliation/csv-io";
import { loadGeocodeCache } from "../utils/store-reconciliation/geocoding";
import { getIgnoredDatabaseStoreNames, reconcileStores } from "../utils/store-reconciliation/reconcile";
import type { ReconcileOptions } from "../utils/store-reconciliation/types";

config();

interface CliOptions {
  officialPath: string;
  databasePath: string;
  outDir: string;
  cachePath: string;
  likelyMatchThreshold: number;
  coordinateOkMeters: number;
  coordinateReviewMeters: number;
  geocodeDelayMs: number;
}

const printUsage = (): void => {
  console.log(`Usage:
  npm run reconcile:stores -- \\
    --official ./data/carrefour_official_stores.csv \\
    --database ./data/database_stores.csv \\
    --out ./reports

Options:
  --official <path>   Carrefour official stores CSV (source of truth)
  --database <path>   Current database stores CSV export
  --out <path>        Output directory for report CSV files (default: ./reports)
  --cache <path>      Geocoding cache file (default: ./.cache/geocoded-stores.json)
  --likely-threshold  Address similarity threshold for likely_match (default: 0.85)
  --ok-meters         Coordinate distance threshold for ok (default: 100)
  --review-meters     Coordinate distance threshold for review (default: 300)
  --geocode-delay-ms  Delay between uncached geocode requests (default: 120)
`);
};

const parsePositiveNumber = (value: string, label: string): number => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number`);
  }

  return parsed;
};

const parseThreshold = (value: string): number => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    throw new Error("likely-threshold must be between 0 and 1");
  }

  return parsed;
};

const parseCliOptions = (argv: string[]): CliOptions => {
  const options: Partial<CliOptions> = {
    outDir: "./reports",
    cachePath: "./.cache/geocoded-stores.json",
    likelyMatchThreshold: 0.85,
    coordinateOkMeters: 100,
    coordinateReviewMeters: 300,
    geocodeDelayMs: 120,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case "--official":
        if (!next) throw new Error("Missing value for --official");
        options.officialPath = next;
        index += 1;
        break;
      case "--database":
        if (!next) throw new Error("Missing value for --database");
        options.databasePath = next;
        index += 1;
        break;
      case "--out":
        if (!next) throw new Error("Missing value for --out");
        options.outDir = next;
        index += 1;
        break;
      case "--cache":
        if (!next) throw new Error("Missing value for --cache");
        options.cachePath = next;
        index += 1;
        break;
      case "--likely-threshold":
        if (!next) throw new Error("Missing value for --likely-threshold");
        options.likelyMatchThreshold = parseThreshold(next);
        index += 1;
        break;
      case "--ok-meters":
        if (!next) throw new Error("Missing value for --ok-meters");
        options.coordinateOkMeters = parsePositiveNumber(next, "ok-meters");
        index += 1;
        break;
      case "--review-meters":
        if (!next) throw new Error("Missing value for --review-meters");
        options.coordinateReviewMeters = parsePositiveNumber(next, "review-meters");
        index += 1;
        break;
      case "--geocode-delay-ms":
        if (!next) throw new Error("Missing value for --geocode-delay-ms");
        options.geocodeDelayMs = parsePositiveNumber(next, "geocode-delay-ms");
        index += 1;
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

  if (!options.officialPath || !options.databasePath) {
    printUsage();
    throw new Error("Both --official and --database are required");
  }

  return options as CliOptions;
};

const writeReport = (outDir: string, fileName: string, headers: readonly string[], rows: string[][]): void => {
  const filePath = join(outDir, fileName);
  writeFileSync(filePath, buildReconciliationCsv(headers, rows), "utf8");
  console.log(`Wrote ${filePath}`);
};

const main = async (): Promise<void> => {
  const cli = parseCliOptions(process.argv);
  const officialPath = resolve(cli.officialPath);
  const databasePath = resolve(cli.databasePath);
  const outDir = resolve(cli.outDir);
  const cachePath = resolve(cli.cachePath);
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim() || null;

  const reconcileOptions: ReconcileOptions = {
    likelyMatchThreshold: cli.likelyMatchThreshold,
    coordinateOkMeters: cli.coordinateOkMeters,
    coordinateReviewMeters: cli.coordinateReviewMeters,
    geocodingEnabled: Boolean(googleMapsApiKey),
    geocodeDelayMs: cli.geocodeDelayMs,
  };

  console.log("Loading CSV files...");
  const officialStores = loadOfficialStores(officialPath);
  const databaseStores = loadDatabaseStores(databasePath);
  const ignoredNames = getIgnoredDatabaseStoreNames(databaseStores);

  if (!googleMapsApiKey) {
    console.warn(
      "GOOGLE_MAPS_API_KEY is not set. Coordinate validation will be skipped (coordinate_status = geocoding_skipped).",
    );
  } else {
    console.log("Geocoding enabled via GOOGLE_MAPS_API_KEY.");
  }

  const geocodeCache = loadGeocodeCache(cachePath);
  const result = await reconcileStores(
    officialStores,
    databaseStores,
    reconcileOptions,
    geocodeCache,
    cachePath,
    googleMapsApiKey,
  );

  mkdirSync(outDir, { recursive: true });

  const summaryRows = result.summary.map(reconciliationRowToCsv);
  writeReport(outDir, "store_reconciliation_summary.csv", SUMMARY_HEADERS, summaryRows);
  writeReport(
    outDir,
    "missing_in_database.csv",
    SUMMARY_HEADERS,
    result.missingInDatabase.map(reconciliationRowToCsv),
  );
  writeReport(
    outDir,
    "extra_in_database.csv",
    SUMMARY_HEADERS,
    result.extraInDatabase.map(reconciliationRowToCsv),
  );
  writeReport(
    outDir,
    "duplicate_store_numbers.csv",
    DUPLICATE_HEADERS,
    result.duplicates.map((duplicate) => [
      duplicate.source,
      duplicate.storeNumber,
      String(duplicate.duplicateCount),
      duplicate.details,
    ]),
  );
  writeReport(
    outDir,
    "address_mismatches.csv",
    SUMMARY_HEADERS,
    result.addressMismatches.map(reconciliationRowToCsv),
  );
  writeReport(
    outDir,
    "coordinate_mismatches.csv",
    SUMMARY_HEADERS,
    result.coordinateMismatches.map(reconciliationRowToCsv),
  );

  console.log("");
  console.log("Reconciliation summary");
  console.log(`- Total official stores: ${result.stats.totalOfficialStores}`);
  console.log(`- Total database stores: ${result.stats.totalDatabaseStores}`);
  console.log(`- Numeric database stores considered: ${result.stats.numericDatabaseStores}`);
  console.log(`- Ignored non-numeric DB rows: ${result.stats.ignoredNonNumericDatabaseRows}`);
  if (ignoredNames.length > 0) {
    console.log(`  Ignored names: ${ignoredNames.join(", ")}`);
  }
  console.log(`- Missing in database: ${result.stats.missingInDatabase}`);
  console.log(`- Extra in database: ${result.stats.extraInDatabase}`);
  console.log(`- Address mismatches / likely matches: ${result.stats.addressMismatches}`);
  console.log(`- Coordinate issues: ${result.stats.coordinateMismatches}`);
  console.log(`- Duplicate store numbers: ${result.stats.duplicateCount}`);
};

void main().catch((error) => {
  console.error("Store reconciliation failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
