import type { HistoricalSeedCliOptions } from "./types";

const readFlagValue = (argv: string[], name: string): string | null => {
  const index = argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return argv[index + 1] ?? null;
};

const readInt = (argv: string[], name: string, fallback: number): number => {
  const raw = readFlagValue(argv, name);
  if (raw === null) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer for ${name}: ${raw}`);
  }
  return parsed;
};

export const parseHistoricalSeedCliArgs = (
  argv: string[] = process.argv.slice(2),
): HistoricalSeedCliOptions => {
  const cleanup = readFlagValue(argv, "--cleanup");
  return {
    companyId: readFlagValue(argv, "--company-id"),
    operations: readInt(argv, "--operations", 100),
    monthsBack: readInt(argv, "--months-back", 12),
    seed: readInt(argv, "--seed", 20_260_814),
    batchId: readFlagValue(argv, "--batch-id"),
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
