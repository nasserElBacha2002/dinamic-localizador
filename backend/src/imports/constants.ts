export const IMPORT_ENTITY_TYPES = ["operations", "services", "employees"] as const;
export type ImportEntityType = (typeof IMPORT_ENTITY_TYPES)[number];

export const DEFAULT_IMPORT_MAX_ROWS = 2000;
export const DEFAULT_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Multi-row INSERT chunk size for create-only entity imports. */
export const IMPORT_PERSIST_CHUNK_SIZE = 50;
/** Preview/execute draft TTL. */
export const IMPORT_JOB_TTL_MINUTES = 30;
/**
 * Max Base64 payload length for a file of DEFAULT_IMPORT_MAX_FILE_BYTES
 * (4/3 expansion + padding slack).
 */
export const DEFAULT_IMPORT_MAX_BASE64_CHARS =
  Math.ceil((DEFAULT_IMPORT_MAX_FILE_BYTES * 4) / 3) + 8;

export const isImportEntityType = (value: string): value is ImportEntityType =>
  (IMPORT_ENTITY_TYPES as readonly string[]).includes(value);
