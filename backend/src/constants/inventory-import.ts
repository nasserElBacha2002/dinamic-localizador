export const LEGACY_IMPORT_REQUIRED_HEADERS = [
  "tienda",
  "fecha_inicio",
  "fecha_fin",
] as const;

export const CLIENT_IMPORT_REQUIRED_HEADERS = ["punto", "fecha"] as const;

export const CLIENT_IMPORT_IGNORED_HEADERS = ["local", "proveedor"] as const;

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

export const CLIENT_IMPORT_RECOMMENDED_TEMPLATE_HEADERS = ["Sucursal", "Fecha"] as const;

export const INVENTORY_IMPORT_COLUMN_ALIASES = {
  location: [
    "PUNTO",
    "punto",
    "Punto",
    "Sucursal",
    "sucursal",
    "Ubicación",
    "ubicación",
    "Ubicacion",
    "ubicacion",
    "Tienda",
    "tienda",
  ],
  startDate: ["Fecha", "fecha"],
  startDateExtended: [
    "fecha_inicio",
    "Fecha Inicio",
    "Fecha de inicio",
    "fecha de inicio",
    "fecha_de_inicio",
  ],
  endDate: ["fecha_fin", "Fecha Fin", "Fecha de fin", "fecha de fin", "fecha_de_fin"],
  locationType: [
    "Formato",
    "formato",
    "Tipo",
    "tipo",
    "Tipo de ubicación",
    "tipo de ubicacion",
    "Tipo de ubicacion",
    "tipo de ubicación",
  ],
} as const;

export const IMPORT_UNKNOWN_LOCATION_TYPE_MESSAGE =
  "El tipo de ubicación/servicio informado no es válido para esta empresa.";

export const IMPORT_LOCATION_COLUMN_ACCEPTED_LABELS =
  "PUNTO, Sucursal, Ubicación o tienda";

export const IMPORT_MISSING_LOCATION_MESSAGE = `La columna de sucursal/ubicación es obligatoria. Se acepta: ${IMPORT_LOCATION_COLUMN_ACCEPTED_LABELS}.`;

export const IMPORT_MISSING_DATE_MESSAGE =
  "La columna Fecha es obligatoria. También se acepta fecha_inicio en el formato extendido.";

export const IMPORT_MISSING_LEGACY_END_DATE_MESSAGE =
  "La columna fecha_fin es obligatoria en el formato extendido.";

export const IMPORT_EMPTY_LOCATION_VALUE_MESSAGE =
  "La columna de sucursal/ubicación es obligatoria. Se acepta: PUNTO, Sucursal, Ubicación o tienda.";

export const IMPORT_LOCATION_NOT_FOUND_MESSAGE =
  "No se encontró una ubicación existente para el valor informado.";

export const IMPORT_LOCATION_AMBIGUOUS_MESSAGE =
  "El valor de sucursal/ubicación corresponde a más de una ubicación existente.";

export const UNSUPPORTED_FILE_TYPE_MESSAGE =
  "Formato de archivo no soportado. Subí un archivo CSV o XLSX.";
