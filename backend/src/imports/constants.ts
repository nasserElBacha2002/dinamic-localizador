export const IMPORT_ENTITY_TYPES = ["operations", "services", "employees"] as const;
export type ImportEntityType = (typeof IMPORT_ENTITY_TYPES)[number];

export const DEFAULT_IMPORT_MAX_ROWS = 2000;
export const DEFAULT_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const DEFAULT_IMPORT_BATCH_SIZE = 50;

export const isImportEntityType = (value: string): value is ImportEntityType =>
  (IMPORT_ENTITY_TYPES as readonly string[]).includes(value);
