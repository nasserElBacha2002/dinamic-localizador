export const DEFAULT_EARLY_TOLERANCE_MINUTES = 60;
export const DEFAULT_LATE_TOLERANCE_MINUTES = 90;

export const CLIENT_DEFAULT_START_HOUR = 20;
export const CLIENT_DEFAULT_START_MINUTE = 30;
export const CLIENT_DEFAULT_END_HOUR = 3;
export const CLIENT_DEFAULT_END_MINUTE = 0;

export const LEGACY_IMPORT_REQUIRED_HEADERS = [
  "tienda",
  "fecha_inicio",
  "fecha_fin",
] as const;

export const CLIENT_IMPORT_REQUIRED_HEADERS = ["punto", "fecha"] as const;

export const CLIENT_IMPORT_IGNORED_HEADERS = ["local", "formato", "proveedor"] as const;

export const LEGACY_IMPORT_OPTIONAL_HEADERS = [
  "tolerancia_temprana",
  "tolerancia_tardia",
  "notas",
] as const;

export const LEGACY_IMPORT_TEMPLATE_HEADERS = [
  ...LEGACY_IMPORT_REQUIRED_HEADERS,
  ...LEGACY_IMPORT_OPTIONAL_HEADERS,
];

export const CLIENT_IMPORT_TEMPLATE_HEADERS = ["PUNTO", "Fecha"] as const;

export const UNSUPPORTED_FILE_TYPE_MESSAGE =
  "Formato de archivo no soportado. Subí un archivo CSV o XLSX.";
