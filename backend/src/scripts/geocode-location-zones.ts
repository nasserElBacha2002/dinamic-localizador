#!/usr/bin/env node
/**
 * Idempotent backfill of location_zones centroids via Google Geocoding.
 * Does not overwrite MANUAL overrides. Safe to re-run.
 *
 * Usage:
 *   npm run location-zones:geocode
 *   npm run location-zones:geocode -- --dry-run
 *   npm run location-zones:geocode -- --company-id <uuid>
 *   npm run location-zones:geocode -- --delay-ms 300
 */
import { config } from "dotenv";
import { closeDatabase, connectDatabase } from "../database/connection";
import { locationZoneGeocodingService } from "../services/location-zone-geocoding.service";
import { resolveGoogleMapsApiKey } from "../utils/service-reconciliation/env";

config();

const LOG_PREFIX = "[location-zones:geocode]";

type CliOptions = {
  dryRun: boolean;
  companyId?: string;
  delayMs: number;
  includeFailed: boolean;
};

const printUsage = (): void => {
  console.log(`Usage:
  npm run location-zones:geocode
  npm run location-zones:geocode -- --dry-run
  npm run location-zones:geocode -- --company-id <uuid>
  npm run location-zones:geocode -- --delay-ms 300
  npm run location-zones:geocode -- --skip-failed

Options:
  --dry-run           List eligible zones without calling Google
  --company-id <id>   Limit to one company
  --delay-ms <n>      Delay between Google calls (default 250)
  --skip-failed       Do not retry zones already in FAILED status
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

const parseDelayMs = (value: string | undefined): number => {
  if (!value) {
    return 250;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 60_000) {
    throw new Error("--delay-ms must be an integer between 0 and 60000");
  }
  return parsed;
};

const parseCliOptions = (argv: string[]): CliOptions => ({
  dryRun: readFlag(argv, "dry-run"),
  companyId: readOption(argv, "company-id"),
  delayMs: parseDelayMs(readOption(argv, "delay-ms")),
  includeFailed: !readFlag(argv, "skip-failed"),
});

const main = async (): Promise<void> => {
  const argv = process.argv.slice(2);
  if (readFlag(argv, "help") || readFlag(argv, "h")) {
    printUsage();
    return;
  }

  const options = parseCliOptions(argv);
  const keyInfo = resolveGoogleMapsApiKey();

  console.info(`${LOG_PREFIX} starting`, {
    dryRun: options.dryRun,
    companyId: options.companyId ?? null,
    delayMs: options.delayMs,
    includeFailed: options.includeFailed,
    apiKeySource: keyInfo.source,
  });

  if (!options.dryRun && !keyInfo.key) {
    console.error(
      `${LOG_PREFIX} GOOGLE_MAPS_API_KEY (or VITE_GOOGLE_MAPS_API_KEY) is required unless --dry-run`,
    );
    process.exitCode = 1;
    return;
  }

  await connectDatabase();
  try {
    const summary = await locationZoneGeocodingService.backfill({
      companyId: options.companyId,
      dryRun: options.dryRun,
      delayMs: options.delayMs,
      includeFailed: options.includeFailed,
    });

    console.info(`${LOG_PREFIX} complete`, {
      total: summary.total,
      resolved: summary.resolved,
      failed: summary.failed,
      skipped: summary.skipped,
      manualSkipped: summary.manualSkipped,
      alreadyResolved: summary.alreadyResolved,
      noApiKeySkipped: summary.noApiKeySkipped,
      staleSkipped: summary.staleSkipped,
    });
  } finally {
    await closeDatabase();
  }
};

void main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${LOG_PREFIX} fatal`, { errorMessage: message });
  try {
    await closeDatabase();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
