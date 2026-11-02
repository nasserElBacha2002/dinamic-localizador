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
] as const;

export const LEGACY_IMPORT_TEMPLATE_HEADERS = [
  ...LEGACY_IMPORT_REQUIRED_HEADERS,
  ...LEGACY_IMPORT_OPTIONAL_HEADERS,
];

export const CLIENT_IMPORT_TEMPLATE_HEADERS = ["PUNTO", "Fecha"] as const;

export const CLIENT_IMPORT_RECOMMENDED_TEMPLATE_HEADERS = ["Sucursal", "Fecha"] as const;

export const RECURRING_IMPORT_REQUIRED_HEADERS = ["sucursal", "vigencia_desde"] as const;

export const RECURRING_IMPORT_OPTIONAL_HEADERS = [
  "vigencia_hasta",
  "horario_inicio",
  "horario_fin",
  "origen_horario",
  "tipo_operacion",
  "modo_horario",
  "turno_codigo",
  "turno_nombre",
  "plantilla_turno",
  "tolerancia_temprana",
  "tolerancia_tardia",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
] as const;

export const RECURRING_IMPORT_RECOMMENDED_TEMPLATE_HEADERS = [
  "Sucursal",
  "vigencia_desde",
  "vigencia_hasta",
  "horario_inicio",
  "horario_fin",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
  "origen_horario",
] as const;

/** Official unified operations import template (headers only). */
export const OPERATION_CANONICAL_DOWNLOAD_TEMPLATE_HEADERS = [
  "Sucursal",
  "Tipo",
  "Fecha",
  "Vigencia desde",
  "Vigencia hasta",
  "Horario inicio",
  "Horario fin",
  "Lunes",
  "Martes",
  "Miercoles",
  "Jueves",
  "Viernes",
  "Sabado",
  "Domingo",
  "Turno codigo",
  "Turno nombre",
  "Plantilla turno",
  "Tolerancia temprana",
  "Tolerancia tardia",
] as const;

export const OPERATION_CANONICAL_TEMPLATE_FILE_NAME = "plantilla-importacion-operaciones.csv";

export const OPERATION_IMPORT_TEMPLATE_VARIANTS = [
  "one_time",
  "recurring_single",
  "recurring_multi_shift",
] as const;

export type OperationImportTemplateVariant = (typeof OPERATION_IMPORT_TEMPLATE_VARIANTS)[number];

export const isOperationImportTemplateVariant = (
  value: string,
): value is OperationImportTemplateVariant =>
  (OPERATION_IMPORT_TEMPLATE_VARIANTS as readonly string[]).includes(value);

/** Downloadable ONE_TIME (client format) template headers. */
export const OPERATION_ONE_TIME_DOWNLOAD_TEMPLATE_HEADERS = [
  ...CLIENT_IMPORT_RECOMMENDED_TEMPLATE_HEADERS,
  ...LEGACY_IMPORT_OPTIONAL_HEADERS,
] as const;

/** Downloadable RECURRING SINGLE template headers. */
export const OPERATION_RECURRING_SINGLE_DOWNLOAD_TEMPLATE_HEADERS = [
  ...RECURRING_IMPORT_RECOMMENDED_TEMPLATE_HEADERS,
  ...LEGACY_IMPORT_OPTIONAL_HEADERS,
] as const;

/** Downloadable RECURRING MULTI_SHIFT template headers (origen_horario fijo en EMPRESA). */
export const OPERATION_RECURRING_MULTI_SHIFT_DOWNLOAD_TEMPLATE_HEADERS = [
  "Sucursal",
  "vigencia_desde",
  "vigencia_hasta",
  "horario_inicio",
  "horario_fin",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
  "modo_horario",
  "turno_codigo",
  "turno_nombre",
  "plantilla_turno",
  "tolerancia_temprana",
  "tolerancia_tardia",
] as const;

export const OPERATION_IMPORT_TEMPLATE_FILE_NAMES: Record<
  OperationImportTemplateVariant,
  string
> = {
  one_time: "plantilla-importacion-operaciones-puntual.csv",
  recurring_single: "plantilla-importacion-operaciones-fija.csv",
  recurring_multi_shift: "plantilla-importacion-operaciones-multi-turno.csv",
};

export const OPERATION_IMPORT_COLUMN_ALIASES = {
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
  importRowType: ["Tipo", "tipo"],
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
  validFrom: [
    "vigencia_desde",
    "Vigencia desde",
    "valid_from",
    "validFrom",
    "fecha_inicio_vigencia",
  ],
  validUntil: ["vigencia_hasta", "Vigencia hasta", "valid_until", "validUntil"],
  scheduleStartTime: ["horario_inicio", "Hora inicio", "hora_inicio", "inicio_horario"],
  scheduleEndTime: ["horario_fin", "Hora fin", "hora_fin", "fin_horario"],
  scheduleSource: [
    "origen_horario",
    "Origen horario",
    "schedule_source",
    "scheduleSource",
    "fuente_horario",
  ],
  operationKind: [
    "tipo_operacion",
    "Tipo operación",
    "tipo operacion",
    "operation_kind",
    "operationKind",
  ],
  scheduleMode: [
    "modo_horario",
    "Modo horario",
    "schedule_mode",
    "scheduleMode",
  ],
  shiftCode: ["turno_codigo", "codigo_turno", "shift_code", "shiftCode"],
  shiftName: ["turno_nombre", "nombre_turno", "shift_name", "shiftName"],
  shiftTemplate: [
    "plantilla_turno",
    "plantilla_turno_id",
    "shift_template",
    "shiftTemplateId",
  ],
} as const;

export const IMPORT_RECURRING_MULTI_SHIFT_TEMPLATE_NOT_FOUND_MESSAGE =
  "La plantilla de turno informada no existe para esta empresa.";

export const IMPORT_RECURRING_MULTI_SHIFT_TEMPLATE_INACTIVE_MESSAGE =
  "La plantilla de turno informada está inactiva.";

export const IMPORT_MISSING_RECURRING_VALID_FROM_MESSAGE =
  "La columna vigencia_desde es obligatoria para importar operaciones fijas/recurrentes.";

export const IMPORT_RECURRING_COMPANY_CUSTOM_SCHEDULE_MESSAGE =
  "Con origen_horario EMPRESA/COMPANY no se pueden informar horarios ni días personalizados en la fila.";

export const IMPORT_RECURRING_DUPLICATE_MESSAGE =
  "Ya existe una operación fija activa para ese servicio y vigencia_desde.";

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
