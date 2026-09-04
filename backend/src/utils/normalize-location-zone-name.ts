/**
 * Canonical geographic-zone identity normalization.
 *
 * Formal algorithm (must match SQL `dbo.fn_normalize_location_zone_text`):
 * 1. null/undefined → "" (locality only)
 * 2. trim
 * 3. collapse internal whitespace to a single space
 * 4. fold Latin diacritics (NFD + strip combining marks)
 * 5. lowercase
 *
 * Do not diverge from the SQL function without updating migrations/seeds.
 */
export function normalizeLocationZoneName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function canonicalizeLocationZoneDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeLocationZoneLocality(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  return normalizeLocationZoneName(value);
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

/** Cases that Node and SQL must agree on (used by unit + migration tests). */
export const LOCATION_ZONE_NORMALIZATION_GOLDEN_CASES: ReadonlyArray<{
  input: string;
  expected: string;
}> = [
  { input: "Caballito", expected: "caballito" },
  { input: " CABALLITO ", expected: "caballito" },
  { input: "Núñez", expected: "nunez" },
  { input: "Nunez", expected: "nunez" },
  { input: " NÚÑEZ ", expected: "nunez" },
  { input: "Constitución", expected: "constitucion" },
  { input: "Constitucion", expected: "constitucion" },
  { input: "Morón", expected: "moron" },
  { input: "Moron", expected: "moron" },
  { input: "Lanús", expected: "lanus" },
  { input: "Lanus", expected: "lanus" },
  { input: "José C. Paz", expected: "jose c. paz" },
  { input: "Jose C. Paz", expected: "jose c. paz" },
  { input: "San  Martín", expected: "san martin" },
];
