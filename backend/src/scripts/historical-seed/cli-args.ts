import type { HistoricalSeedCliOptions } from "./types";
import { assertValidBatchId } from "./markers";

const readFlagValue = (argv: string[], name: string): string | null => {
  const index = argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return argv[index + 1] ?? null;
};

/** Strict integer parse: rejects "100foo", empty, floats, and non-decimal. */
export const parseStrictInt = (raw: string, flagName: string): number => {
  if (!/^-?\d+$/.test(raw.trim())) {
    throw new Error(`Invalid integer for ${flagName}: ${raw}`);
  }
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Invalid integer for ${flagName}: ${raw}`);
  }
  return parsed;
};

const readStrictInt = (argv: string[], name: string, fallback: number): number => {
  const raw = readFlagValue(argv, name);
  if (raw === null) {
    return fallback;
  }
  return parseStrictInt(raw, name);
};

export const parseHistoricalSeedCliArgs = (
  argv: string[] = process.argv.slice(2),
): HistoricalSeedCliOptions => {
  const cleanupRaw = readFlagValue(argv, "--cleanup");
  const cleanup = cleanupRaw === null ? null : assertValidBatchId(cleanupRaw);
  const batchIdRaw = readFlagValue(argv, "--batch-id");
  const batchId = batchIdRaw === null ? null : assertValidBatchId(batchIdRaw);

  const operations = readStrictInt(argv, "--operations", 100);
  const monthsBack = readStrictInt(argv, "--months-back", 12);
  const seed = readStrictInt(argv, "--seed", 20_260_814);

  if (operations < 1 || operations > 500) {
    throw new Error("--operations must be between 1 and 500.");
  }
  if (monthsBack < 1 || monthsBack > 36) {
    throw new Error("--months-back must be between 1 and 36.");
  }

  return {
    companyId: readFlagValue(argv, "--company-id"),
    operations,
    monthsBack,
    seed,
    batchId,
    dryRun: argv.includes("--dry-run"),
    cleanup,
    apply: argv.includes("--apply") || (!argv.includes("--dry-run") && !cleanup),
  };
};

export const assertSeedEnvironmentSafe = (env: NodeJS.ProcessEnv = process.env): void => {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to run historical seed in production (NODE_ENV=production).",
    );
  }
  if (env.ALLOW_SYNTHETIC_OPERATION_SEED !== "true") {
    throw new Error(
      "Refusing to run: set ALLOW_SYNTHETIC_OPERATION_SEED=true for controlled non-production use.",
    );
  }
};
