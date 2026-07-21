/**
 * Normalize optional free-text fields for operational locations.
 *
 * Rules:
 * - trim leading/trailing whitespace
 * - empty string → null
 * - preserve original casing (SQL Server collation handles equality, typically CI)
 */
export function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const SERVICE_FORMAT_MAX_LENGTH = 80;
