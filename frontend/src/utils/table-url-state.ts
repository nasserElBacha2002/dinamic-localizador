export type SortOrder = "asc" | "desc";

export type TableUrlFieldType = "string" | "number" | "boolean" | "enum";

export interface TableUrlFieldDef {
  type: TableUrlFieldType;
  urlKey?: string;
  values?: readonly string[];
  min?: number;
  max?: number;
  /** When true, changing this field resets page to 1. Default: true except page/pageSize. */
  resetPageOnChange?: boolean;
}

export type TableUrlFieldMap<T extends Record<string, unknown>> = Partial<
  Record<keyof T, TableUrlFieldDef>
>;

export interface ParseTableUrlStateOptions<T extends Record<string, unknown>> {
  defaults: T;
  fields?: TableUrlFieldMap<T>;
  searchParams: URLSearchParams;
  shouldOmitFromUrl?: (key: keyof T, value: T[keyof T], defaults: T, state: T) => boolean;
}

export interface SerializeTableUrlStateOptions<T extends Record<string, unknown>> {
  state: T;
  defaults: T;
  fields?: TableUrlFieldMap<T>;
  shouldOmitFromUrl?: (key: keyof T, value: T[keyof T], defaults: T, state: T) => boolean;
}

const PAGE_KEYS = new Set(["page", "pageSize"]);
const SORT_KEYS = new Set(["sortBy", "sortOrder"]);

export function getTableUrlFieldKey<K extends string>(key: K, def?: TableUrlFieldDef): string {
  return def?.urlKey ?? key;
}

function inferFieldDef(value: unknown, explicit?: TableUrlFieldDef): TableUrlFieldDef {
  if (explicit) {
    return explicit;
  }

  if (typeof value === "number") {
    return { type: "number", min: 1 };
  }

  if (typeof value === "boolean") {
    return { type: "boolean" };
  }

  return { type: "string" };
}

function shouldResetPageOnChange(key: string, def: TableUrlFieldDef): boolean {
  if (def.resetPageOnChange !== undefined) {
    return def.resetPageOnChange;
  }

  return !PAGE_KEYS.has(key);
}

export function shouldResetTablePageForChange(
  changedKeys: string[],
  fields?: TableUrlFieldMap<Record<string, unknown>>,
): boolean {
  return changedKeys.some((key) => {
    const def = fields?.[key] ?? inferFieldDef(undefined);
    return shouldResetPageOnChange(key, def);
  });
}

export function parseTableUrlFieldValue(
  raw: string | null,
  def: TableUrlFieldDef,
  defaultValue: unknown,
): unknown {
  if (raw === null || raw === "") {
    return defaultValue;
  }

  switch (def.type) {
    case "string":
      return raw;
    case "number": {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        return defaultValue;
      }
      if (def.min !== undefined && parsed < def.min) {
        return defaultValue;
      }
      if (def.max !== undefined && parsed > def.max) {
        return defaultValue;
      }
      return parsed;
    }
    case "boolean":
      if (raw === "true") {
        return true;
      }
      if (raw === "false") {
        return false;
      }
      return defaultValue;
    case "enum":
      if (raw === "" && def.values?.includes("")) {
        return "";
      }
      return def.values?.includes(raw) ? raw : defaultValue;
    default:
      return defaultValue;
  }
}

export function serializeTableUrlFieldValue(
  value: unknown,
  def: TableUrlFieldDef,
  defaultValue: unknown,
  shouldOmit?: boolean,
): string | null {
  if (shouldOmit) {
    return null;
  }

  if (value === defaultValue) {
    return null;
  }

  if (value === null || value === undefined || value === "") {
    return null;
  }

  switch (def.type) {
    case "string":
      return String(value);
    case "number":
      return String(value);
    case "boolean":
      return value ? "true" : "false";
    case "enum": {
      const serialized = String(value);
      return def.values?.includes(serialized) ? serialized : null;
    }
    default:
      return null;
  }
}

export function parseTableUrlState<T extends Record<string, unknown>>({
  defaults,
  fields,
  searchParams,
}: ParseTableUrlStateOptions<T>): T {
  const parsed = { ...defaults };

  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const def = inferFieldDef(defaults[key], fields?.[key]);
    const urlKey = getTableUrlFieldKey(String(key), def);
    parsed[key] = parseTableUrlFieldValue(
      searchParams.get(urlKey),
      def,
      defaults[key],
    ) as T[keyof T];
  }

  return parsed;
}

export function serializeTableUrlState<T extends Record<string, unknown>>({
  state,
  defaults,
  fields,
  shouldOmitFromUrl,
}: SerializeTableUrlStateOptions<T>): URLSearchParams {
  const params = new URLSearchParams();

  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const def = inferFieldDef(defaults[key], fields?.[key]);
    const urlKey = getTableUrlFieldKey(String(key), def);
    const omit =
      shouldOmitFromUrl?.(key, state[key], defaults, state) ?? state[key] === defaults[key];
    const serialized = serializeTableUrlFieldValue(state[key], def, defaults[key], omit);

    if (serialized !== null) {
      params.set(urlKey, serialized);
    }
  }

  return params;
}

export function mergeTableUrlPatch<T extends Record<string, unknown>>(
  current: T,
  patch: Partial<T>,
  defaults: T,
  fields?: TableUrlFieldMap<T>,
): T {
  const next = { ...current, ...patch };

  if (
    shouldResetTablePageForChange(
      Object.keys(patch),
      fields as TableUrlFieldMap<Record<string, unknown>>,
    )
  ) {
    if ("page" in defaults) {
      (next as Record<string, unknown>).page = 1;
    }
  }

  return next;
}

export function isCoreTableSortKey(key: string): boolean {
  return SORT_KEYS.has(key);
}

export function isCoreTablePageKey(key: string): boolean {
  return PAGE_KEYS.has(key);
}
