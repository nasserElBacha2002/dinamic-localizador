/** Normalize zone names for uniqueness (trim + lowercase), matching category style. */
export function normalizeLocationZoneName(value: string): string {
  return value.trim().toLowerCase();
}

export function canonicalizeLocationZoneDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeLocationZoneLocality(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  return value.trim().toLowerCase();
}

export function canonicalizeLocationZoneLocality(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : null;
}
