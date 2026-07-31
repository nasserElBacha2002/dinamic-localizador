/**
 * Semantic filter comparison and atomic reset helpers.
 *
 * Policy (documented for all list/filter screens):
 * - "Limpiar filtros" restores declared screen defaults for filter fields + search + page.
 * - Retained by default: pageSize, sortBy, sortOrder (and screen-specific keys like tab).
 * - Pagination page counters reset to defaults (usually 1).
 * - Tabs are retained unless listed as filter keys (statistics keeps `tab`).
 *
 * Equality policy:
 * - `null` and `undefined` are equivalent (absent value).
 * - `""` is NOT equivalent to null/undefined (empty string can be a valid enum/default).
 * - Arrays compare positionally by default.
 * - Multiselect ID lists may use set-like comparison (order-insensitive) via
 *   `areIdSetsEqual` / per-key comparators.
 */

export const DEFAULT_FILTER_RETAIN_KEYS = ["pageSize", "sortBy", "sortOrder"] as const;

/** Keys ignored when deciding whether filters are "active" (enable clear). */
export const DEFAULT_FILTER_ACTIVITY_IGNORE_KEYS = [
  "page",
  "pageSize",
  "sortBy",
  "sortOrder",
] as const;

export type FilterValueComparator = (left: unknown, right: unknown) => boolean;
export type FilterValueNormalizer = (value: unknown) => unknown;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/**
 * Normalize values for structural comparison.
 * Does not coerce `""` to null — empty string remains distinct.
 */
export function normalizeFilterValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
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

/** Order-insensitive equality for multiselect ID arrays. */
export function areIdSetsEqual(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return areFilterValuesEqual(left, right);
  }

  if (left.length !== right.length) {
    return false;
  }

  const normalizedLeft = left.map((item) => String(normalizeFilterValue(item))).sort();
  const normalizedRight = right.map((item) => String(normalizeFilterValue(item))).sort();
  return normalizedLeft.every((item, index) => item === normalizedRight[index]);
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
  /** Per-key equality overrides (e.g. set-like ID lists). */
  comparators?: Partial<Record<keyof T, FilterValueComparator>>;
  /** Per-key normalizers applied before the default or custom comparator. */
  normalizers?: Partial<Record<keyof T, FilterValueNormalizer>>;
}

export function listComparableFilterKeys<T extends Record<string, unknown>>(
  defaults: T,
  ignoreKeys: readonly (keyof T | string)[] = DEFAULT_FILTER_ACTIVITY_IGNORE_KEYS,
): (keyof T)[] {
  const ignored = new Set(ignoreKeys.map(String));
  return (Object.keys(defaults) as (keyof T)[]).filter((key) => !ignored.has(String(key)));
}

function valuesEqualForKey<T extends Record<string, unknown>>(
  key: keyof T,
  left: unknown,
  right: unknown,
  options: FilterActivityOptions<T>,
): boolean {
  const normalize = options.normalizers?.[key];
  const leftValue = normalize ? normalize(left) : left;
  const rightValue = normalize ? normalize(right) : right;
  const compare = options.comparators?.[key] ?? areFilterValuesEqual;
  return compare(leftValue, rightValue);
}

export function hasActiveFilters<T extends Record<string, unknown>>(
  state: T,
  defaults: T,
  options: FilterActivityOptions<T> = {},
): boolean {
  const keys = listComparableFilterKeys(defaults, options.ignoreKeys);
  return keys.some((key) => !valuesEqualForKey(key, state[key], defaults[key], options));
}

export function countActiveFilters<T extends Record<string, unknown>>(
  state: T,
  defaults: T,
  options: FilterActivityOptions<T> = {},
): number {
  const keys = listComparableFilterKeys(defaults, options.ignoreKeys);
  return keys.reduce((count, key) => {
    return valuesEqualForKey(key, state[key], defaults[key], options) ? count : count + 1;
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
