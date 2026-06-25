#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildReconciliationCsv,
  DUPLICATE_HEADERS,
  loadDatabaseStores,
  loadOfficialStores,
  reconciliationRowToCsv,
  SUMMARY_HEADERS,
} from "../utils/store-reconciliation/csv-io";
import { resolveGoogleMapsApiKey } from "../utils/store-reconciliation/env";
import {
  loadGeocodeCache,
  runGeocodingDiagnostic,
  toGeocodingDiagnostics,
} from "../utils/store-reconciliation/geocoding";
import {
  countMatchedGeocodingAttempts,
  countMatchedGeocodingFailures,
  getIgnoredDatabaseStoreNames,
  reconcileStores,
} from "../utils/store-reconciliation/reconcile";
import type { ReconcileOptions } from "../utils/store-reconciliation/types";

interface CliOptions {
  officialPath?: string;
  databasePath?: string;
  outDir: string;
  cachePath: string;
  likelyMatchThreshold: number;
  coordinateOkMeters: number;
  coordinateReviewMeters: number;
  geocodeDelayMs: number;
  testGeocoding: boolean;
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
  --test-geocoding    Run a single geocoding diagnostic request and exit
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
    testGeocoding: false,
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
      case "--test-geocoding":
        options.testGeocoding = true;
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

  if (!options.testGeocoding && (!options.officialPath || !options.databasePath)) {
    printUsage();
    throw new Error("Both --official and --database are required unless --test-geocoding is used");
  }

  return options as CliOptions;
};

const writeReport = (outDir: string, fileName: string, headers: readonly string[], rows: string[][]): void => {
  const filePath = join(outDir, fileName);
  writeFileSync(filePath, buildReconciliationCsv(headers, rows), "utf8");
  console.log(`Wrote ${filePath}`);
};

const runTestGeocoding = async (): Promise<void> => {
  const { key: googleMapsApiKey, source: googleMapsApiKeySource } = resolveGoogleMapsApiKey();

  if (!googleMapsApiKey) {
    console.error(
      "No Google Maps API key found. Configure GOOGLE_MAPS_API_KEY or VITE_GOOGLE_MAPS_API_KEY.",
    );
    process.exit(1);
  }

  console.log(`Running geocoding diagnostic using ${googleMapsApiKeySource}...`);
  const result = await runGeocodingDiagnostic(googleMapsApiKey);
  const diagnostics = toGeocodingDiagnostics(result);

  console.log(`Query: ${diagnostics.query}`);
  console.log(`Status: ${diagnostics.status}`);
  if (diagnostics.errorMessage) {
    console.log(`Error message: ${diagnostics.errorMessage}`);
  }
  if (diagnostics.latitude !== null && diagnostics.longitude !== null) {
    console.log(`Latitude: ${diagnostics.latitude}`);
    console.log(`Longitude: ${diagnostics.longitude}`);
  }
};

const main = async (): Promise<void> => {
  const cli = parseCliOptions(process.argv);

  if (cli.testGeocoding) {
    await runTestGeocoding();
    if (!cli.officialPath || !cli.databasePath) {
      return;
    }
  }

  const officialPath = resolve(cli.officialPath!);
  const databasePath = resolve(cli.databasePath!);
  const outDir = resolve(cli.outDir);
  const cachePath = resolve(cli.cachePath);
  const { key: googleMapsApiKey, source: googleMapsApiKeySource } = resolveGoogleMapsApiKey();

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
      "No Google Maps API key found (GOOGLE_MAPS_API_KEY or VITE_GOOGLE_MAPS_API_KEY). Coordinate validation will be skipped (coordinate_status = geocoding_skipped).",
    );
  } else {
    console.log(`Geocoding enabled via ${googleMapsApiKeySource}.`);
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

  writeReport(
    outDir,
    "store_reconciliation_summary.csv",
    SUMMARY_HEADERS,
    result.summary.map(reconciliationRowToCsv),
  );
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
      duplicate.dbId,
      duplicate.dbAddress,
      duplicate.googlePlaceId,
      duplicate.latitude,
      duplicate.longitude,
      duplicate.createdAt,
      duplicate.updatedAt,
      duplicate.active,
      duplicate.addressMatchesOfficial,
      duplicate.coordinateStatus,
      duplicate.officialAddress,
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

  const geocodingAttempts = countMatchedGeocodingAttempts(result.summary);
  const geocodingFailures = countMatchedGeocodingFailures(result.summary);
  if (geocodingAttempts > 0 && geocodingFailures === geocodingAttempts) {
    console.warn(
      "All geocoding requests failed. Check GOOGLE_MAPS_API_KEY, Geocoding API enablement, billing, domain/IP restrictions, and Google Maps API permissions.",
    );
  }

  console.log("");
  console.log("Reconciliation summary");
  console.log(`- Total official rows: ${result.stats.totalOfficialRows}`);
  console.log(`- Total unique official store numbers: ${result.stats.totalUniqueOfficialStoreNumbers}`);
  console.log(`- Total DB rows: ${result.stats.totalDatabaseRows}`);
  console.log(`- Numeric DB stores considered: ${result.stats.numericDatabaseStores}`);
  console.log(`- Ignored non-numeric DB rows: ${result.stats.ignoredNonNumericDatabaseRows}`);
  if (ignoredNames.length > 0) {
    console.log(`  Ignored names: ${ignoredNames.join(", ")}`);
  }
  console.log(`- Matched stores: ${result.stats.matchedStores}`);
  console.log(`- Missing in DB: ${result.stats.missingInDatabase}`);
  console.log(`- Extra in DB: ${result.stats.extraInDatabase}`);
  console.log(`- Duplicate store number groups: ${result.stats.duplicateStoreNumberGroups}`);
  console.log(`- Address exact matches: ${result.stats.addressExactMatches}`);
  console.log(`- Address likely matches: ${result.stats.addressLikelyMatches}`);
  console.log(`- Address mismatches: ${result.stats.addressMismatches}`);
  console.log(`- Geocoding OK: ${result.stats.geocodingOkCount}`);
  console.log(`- Geocoding skipped: ${result.stats.geocodingSkippedCount}`);
  console.log(`- Geocoding failed: ${result.stats.geocodingFailedCount}`);
  console.log(`- Coordinate OK: ${result.stats.coordinateOkCount}`);
  console.log(`- Coordinate review: ${result.stats.coordinateReviewCount}`);
  console.log(`- Coordinate mismatch: ${result.stats.coordinateMismatchCount}`);
  console.log(`- Missing coordinates: ${result.stats.missingCoordinatesCount}`);
};

void main().catch((error) => {
  console.error("Store reconciliation failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
