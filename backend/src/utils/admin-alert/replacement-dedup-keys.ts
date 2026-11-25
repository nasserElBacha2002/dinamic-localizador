/** Normalize UUID segment for durable dedup keys (SQL LOWER(CONVERT(...)) match). */
const normalizeId = (id: string): string => id.trim().toLowerCase();

/**
 * Single primary operational notification per vacancy occurrence + request version.
 * Shared by interactive and fallback paths (F02).
 */
export const buildVacancyCoveragePrimaryDedupKey = (
  employeeWorkdayId: string,
  requestVersion: number,
): string => `vacancy-coverage:primary:${normalizeId(employeeWorkdayId)}:v${requestVersion}`;

/** Manual assignment hint linked to the same replacement request event/version. */
export const buildReplacementManualLinkDedupKey = (
  requestId: string,
  requestVersion: number,
): string => `replacement:manual:${normalizeId(requestId)}:v${requestVersion}`;

/** @deprecated Use buildVacancyCoveragePrimaryDedupKey */
export const buildVacancyCoverageFallbackDedupKey = (employeeWorkdayId: string): string =>
  `vacancy-coverage:fallback:${normalizeId(employeeWorkdayId)}`;

/** @deprecated Use buildVacancyCoveragePrimaryDedupKey */
export const buildReplacementInteractiveDedupKey = (
  requestId: string,
  requestVersion: number,
): string => `replacement:interactive:${normalizeId(requestId)}:v${requestVersion}`;