/**
 * Serialize / parse multi-value ID filters (comma-separated UUIDs).
 * Convention: `employeeIds=id1,id2` (single query key, comma-separated).
 *
 * Singular + plural merge policy (must match backend mergeLegacySingularId):
 * keep plural order, then append singular if not already present.
 */

/** Max IDs after trim + dedupe (aligned with backend MAX_MULTI_FILTER_IDS). */
export const MAX_MULTI_FILTER_IDS = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseIdList(raw: string | string[] | null | undefined): string[] {
  if (raw == null) {
    return [];
  }

  const parts = Array.isArray(raw)
    ? raw.flatMap((value) => value.split(","))
    : raw.split(",");

  const seen = new Set<string>();
  const result: string[] = [];

  for (const part of parts) {
    const id = part.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }

  return result;
}

export function serializeIdList(ids: readonly string[] | null | undefined): string | undefined {
  if (!ids || ids.length === 0) {
    return undefined;
  }

  const unique = parseIdList([...ids]);
  return unique.length > 0 ? unique.join(",") : undefined;
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function filterValidUuids(ids: readonly string[]): string[] {
  return parseIdList([...ids]).filter(isUuid);
}

/**
 * Combine singular legacy id with plural list.
 * Plural order wins; singular is appended if missing.
 */
export function mergeSingularAndList(
  singular: string | null | undefined,
  list: readonly string[] | null | undefined,
): string[] {
  const fromList = parseIdList(list ? [...list] : []);
  if (singular && singular.trim() && !fromList.includes(singular.trim())) {
    fromList.push(singular.trim());
  }
  return fromList;
}

export function assertWithinMultiFilterLimit(ids: string[]): string[] {
  if (ids.length > MAX_MULTI_FILTER_IDS) {
    throw new Error(`Máximo ${MAX_MULTI_FILTER_IDS} identificadores por filtro`);
  }
  return ids;
}
