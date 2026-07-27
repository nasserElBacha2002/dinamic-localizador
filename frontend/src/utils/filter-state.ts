/**
 * Semantic filter comparison and atomic reset helpers.
 *
 * Policy (documented for all list/filter screens):
 * - "Limpiar filtros" restores declared screen defaults for filter fields + search + page.
 * - Retained by default: pageSize, sortBy, sortOrder (and screen-specific keys like tab).
 * - Pagination page counters reset to defaults (usually 1).
 * - Tabs are retained unless listed as filter keys (statistics keeps `tab`).
 */

export const DEFAULT_FILTER_RETAIN_KEYS = ["pageSize", "sortBy", "sortOrder"] as const;

/** Keys ignored when deciding whether filters are "active" (enable clear). */
export const DEFAULT_FILTER_ACTIVITY_IGNORE_KEYS = [
  "page",
  "pageSize",
  "sortBy",
  "sortOrder",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/**
 * Normalize empty-ish values so null/undefined/"" compare equal when appropriate,
 * and arrays/objects/dates compare by value rather than reference.
 */
export function normalizeFilterValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeFilterValue(item));
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    const normalized: Record<string, unknown> = {};
    for (const key of keys) {
      normalized[key] = normalizeFilterValue(value[key]);
    }
    return normalized;
  }

  return value;
}

export function areFilterValuesEqual(left: unknown, right: unknown): boolean {
  const a = normalizeFilterValue(left);
  const b = normalizeFilterValue(right);

  if (a === b) {
    return true;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((item, index) => areFilterValuesEqual(item, b[index]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) {
      return false;
    }
    return aKeys.every((key) => areFilterValuesEqual(a[key], b[key]));
  }

  return false;
}

export interface FilterActivityOptions<T extends Record<string, unknown>> {
  /** Keys excluded from activity detection (pagination, sort, tabs). */
  ignoreKeys?: readonly (keyof T | string)[];
}

export function listComparableFilterKeys<T extends Record<string, unknown>>(
  defaults: T,
  ignoreKeys: readonly (keyof T | string)[] = DEFAULT_FILTER_ACTIVITY_IGNORE_KEYS,
): (keyof T)[] {
  const ignored = new Set(ignoreKeys.map(String));
  return (Object.keys(defaults) as (keyof T)[]).filter((key) => !ignored.has(String(key)));
}

export function hasActiveFilters<T extends Record<string, unknown>>(
  state: T,
  defaults: T,
  options: FilterActivityOptions<T> = {},
): boolean {
  const keys = listComparableFilterKeys(defaults, options.ignoreKeys);
  return keys.some((key) => !areFilterValuesEqual(state[key], defaults[key]));
}

export function countActiveFilters<T extends Record<string, unknown>>(
  state: T,
  defaults: T,
  options: FilterActivityOptions<T> = {},
): number {
  const keys = listComparableFilterKeys(defaults, options.ignoreKeys);
  return keys.reduce((count, key) => {
    return areFilterValuesEqual(state[key], defaults[key]) ? count : count + 1;
  }, 0);
}

export interface FilterResetOptions<T extends Record<string, unknown>> {
  /**
   * Keys kept from the current state when resetting.
   * Defaults: pageSize, sortBy, sortOrder.
   */
  retainKeys?: readonly (keyof T | string)[];
}

/**
 * Build the next table/filter state after "Limpiar filtros".
 * Restores defaults for all keys except retained ones (taken from current).
 */
export function buildFilterResetState<T extends Record<string, unknown>>(
  current: T,
  defaults: T,
  options: FilterResetOptions<T> = {},
): T {
  const retainKeys = options.retainKeys ?? DEFAULT_FILTER_RETAIN_KEYS;
  const next = { ...defaults };

  for (const key of retainKeys) {
    const typedKey = key as keyof T;
    if (typedKey in current) {
      next[typedKey] = current[typedKey];
    }
  }

  return next;
}
