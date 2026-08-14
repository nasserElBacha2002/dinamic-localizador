/** Synthetic historical seed markers for selective cleanup. */

export const AI_HISTORY_SEED_TAG = "AI_HISTORY_SEED";

/** Safe charset for batch ids (no LIKE metacharacters). */
export const BATCH_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const assertValidBatchId = (batchId: string): string => {
  const trimmed = batchId.trim();
  if (!trimmed) {
    throw new Error("Invalid batchId: empty.");
  }
  if (trimmed !== batchId) {
    throw new Error("Invalid batchId: leading/trailing whitespace not allowed.");
  }
  if (!BATCH_ID_PATTERN.test(trimmed)) {
    throw new Error(
      "Invalid batchId: use only A-Z, a-z, 0-9, hyphen, underscore (max 64 chars). No %, [, ], or whitespace.",
    );
  }
  return trimmed;
};

/** Exact marker string stored in notes/description (no LIKE wildcards). */
export const buildBatchMarker = (batchId: string): string => {
  const safe = assertValidBatchId(batchId);
  return `[${AI_HISTORY_SEED_TAG}:${safe}]`;
};

export const buildOperationNotes = (batchId: string, label: string): string =>
  `${buildBatchMarker(batchId)} ${label}`.slice(0, 1000);

export const buildWorkTeamDescription = (batchId: string, label: string): string =>
  `${buildBatchMarker(batchId)} ${label}`.slice(0, 500);

export const buildWorkTeamName = (batchId: string, index: number): string => {
  const safe = assertValidBatchId(batchId);
  return `[${AI_HISTORY_SEED_TAG}] ${safe} Team ${String(index + 1).padStart(3, "0")}`.slice(0, 150);
};

export const isCycleIntegrationName = (name: string): boolean =>
  name.toLowerCase().includes("cycle integration");

export const generateBatchId = (seed: number, now = new Date()): string => {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const hex = (seed >>> 0).toString(16).padStart(8, "0");
  return assertValidBatchId(`ai-history-${y}${m}${d}-${hex}`);
};
