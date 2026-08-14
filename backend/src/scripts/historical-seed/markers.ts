/** Synthetic historical seed markers for selective cleanup. */

export const AI_HISTORY_SEED_TAG = "AI_HISTORY_SEED";

export const buildBatchMarker = (batchId: string): string =>
  `[${AI_HISTORY_SEED_TAG}:${batchId}]`;

export const buildOperationNotes = (batchId: string, label: string): string =>
  `${buildBatchMarker(batchId)} ${label}`.slice(0, 1000);

export const buildWorkTeamDescription = (batchId: string, label: string): string =>
  `${buildBatchMarker(batchId)} ${label}`.slice(0, 500);

export const buildWorkTeamName = (batchId: string, index: number): string =>
  `[${AI_HISTORY_SEED_TAG}] ${batchId.slice(0, 24)} Team ${String(index + 1).padStart(3, "0")}`.slice(
    0,
    150,
  );

/** Match notes/description containing a specific batch id. */
export const batchMarkerSqlLike = (batchId: string): string =>
  `%[${AI_HISTORY_SEED_TAG}:${batchId}]%`;

export const isCycleIntegrationName = (name: string): boolean =>
  name.toLowerCase().includes("cycle integration");

export const generateBatchId = (seed: number, now = new Date()): string => {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const hex = (seed >>> 0).toString(16).padStart(8, "0");
  return `ai-history-${y}${m}${d}-${hex}`;
};
