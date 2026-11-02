import {
  CLIENT_IMPORT_IGNORED_HEADERS,
  IMPORT_MISSING_DATE_MESSAGE,
  IMPORT_MISSING_LEGACY_END_DATE_MESSAGE,
  IMPORT_MISSING_LOCATION_MESSAGE,
  IMPORT_MISSING_RECURRING_VALID_FROM_MESSAGE,
  OPERATION_IMPORT_COLUMN_ALIASES,
} from "../../constants/operation-import";
import type { OperationImportFormat } from "../../types/operation-import";
import { normalizeCsvHeader } from "../csv-parse";
import { RECURRING_IMPORT_WEEKDAY_HEADER_KEYS } from "./operation-import-recurring";

export const normalizeImportColumnName = normalizeCsvHeader;

const LOCATION_ALIASES = new Set(
  OPERATION_IMPORT_COLUMN_ALIASES.location.map((header) => normalizeImportColumnName(header)),
);

const CLIENT_DATE_ALIASES = new Set(
  OPERATION_IMPORT_COLUMN_ALIASES.startDate.map((header) => normalizeImportColumnName(header)),
);

const EXTENDED_START_DATE_ALIASES = new Set(
  OPERATION_IMPORT_COLUMN_ALIASES.startDateExtended.map((header) =>
    normalizeImportColumnName(header),
  ),
);

const EXTENDED_END_DATE_ALIASES = new Set(
  OPERATION_IMPORT_COLUMN_ALIASES.endDate.map((header) => normalizeImportColumnName(header)),
);

const LOCATION_TYPE_ALIASES = new Set(
  OPERATION_IMPORT_COLUMN_ALIASES.locationType.map((header) => normalizeImportColumnName(header)),
);

const VALID_FROM_ALIASES = new Set(
  OPERATION_IMPORT_COLUMN_ALIASES.validFrom.map((header) => normalizeImportColumnName(header)),
);

const VALID_UNTIL_ALIASES = new Set(
  OPERATION_IMPORT_COLUMN_ALIASES.validUntil.map((header) => normalizeImportColumnName(header)),
);

const SCHEDULE_START_TIME_ALIASES = new Set(
  OPERATION_IMPORT_COLUMN_ALIASES.scheduleStartTime.map((header) =>
    normalizeImportColumnName(header),
  ),
);

const SCHEDULE_END_TIME_ALIASES = new Set(
  OPERATION_IMPORT_COLUMN_ALIASES.scheduleEndTime.map((header) =>
    normalizeImportColumnName(header),
  ),
);

const SCHEDULE_SOURCE_ALIASES = new Set(
  OPERATION_IMPORT_COLUMN_ALIASES.scheduleSource.map((header) =>
    normalizeImportColumnName(header),
  ),
);

const OPERATION_KIND_ALIASES = new Set(
  OPERATION_IMPORT_COLUMN_ALIASES.operationKind.map((header) => normalizeImportColumnName(header)),
);

const SCHEDULE_MODE_ALIASES = new Set(
  OPERATION_IMPORT_COLUMN_ALIASES.scheduleMode.map((header) => normalizeImportColumnName(header)),
);

const SHIFT_CODE_ALIASES = new Set(
  OPERATION_IMPORT_COLUMN_ALIASES.shiftCode.map((header) => normalizeImportColumnName(header)),
);

const SHIFT_NAME_ALIASES = new Set(
  OPERATION_IMPORT_COLUMN_ALIASES.shiftName.map((header) => normalizeImportColumnName(header)),
);

const SHIFT_TEMPLATE_ALIASES = new Set(
  OPERATION_IMPORT_COLUMN_ALIASES.shiftTemplate.map((header) => normalizeImportColumnName(header)),
);

const OPTIONAL_HEADER_ALIASES = new Set([
  "tolerancia_temprana",
  "tolerancia_tardia",
  ...CLIENT_IMPORT_IGNORED_HEADERS,
  ...RECURRING_IMPORT_WEEKDAY_HEADER_KEYS,
]);

export const resolveImportHeaderColumn = (header: string): string => {
  const normalized = normalizeImportColumnName(header);

  if (EXTENDED_END_DATE_ALIASES.has(normalized)) {
    return "fecha_fin";
  }

  if (EXTENDED_START_DATE_ALIASES.has(normalized)) {
    return "fecha_inicio";
  }

  if (CLIENT_DATE_ALIASES.has(normalized)) {
    return "fecha";
  }

  if (LOCATION_ALIASES.has(normalized)) {
    return "location";
  }

  if (LOCATION_TYPE_ALIASES.has(normalized)) {
    return "location_type";
  }

  if (VALID_FROM_ALIASES.has(normalized)) {
    return "vigencia_desde";
  }

  if (VALID_UNTIL_ALIASES.has(normalized)) {
    return "vigencia_hasta";
  }

  if (SCHEDULE_START_TIME_ALIASES.has(normalized)) {
    return "horario_inicio";
  }

  if (SCHEDULE_END_TIME_ALIASES.has(normalized)) {
    return "horario_fin";
  }

  if (SCHEDULE_SOURCE_ALIASES.has(normalized)) {
    return "origen_horario";
  }

  if (OPERATION_KIND_ALIASES.has(normalized)) {
    return "tipo_operacion";
  }

  if (SCHEDULE_MODE_ALIASES.has(normalized)) {
    return "modo_horario";
  }

  if (SHIFT_CODE_ALIASES.has(normalized)) {
    return "turno_codigo";
  }

  if (SHIFT_NAME_ALIASES.has(normalized)) {
    return "turno_nombre";
  }

  if (SHIFT_TEMPLATE_ALIASES.has(normalized)) {
    return "plantilla_turno";
  }

  if (OPTIONAL_HEADER_ALIASES.has(normalized)) {
    return normalized;
  }

  return normalized;
};

export interface MappedImportHeaders {
  mapped: string[];
  format: OperationImportFormat | null;
  fileErrors: string[];
}

export const mapImportHeaders = (headers: string[]): MappedImportHeaders => {
  const mapped = headers.map((header) => resolveImportHeaderColumn(header));
  const mappedSet = new Set(mapped);

  const hasLocation = mappedSet.has("location");
  const hasClientDate = mappedSet.has("fecha");
  const hasLegacyStart = mappedSet.has("fecha_inicio");
  const hasLegacyEnd = mappedSet.has("fecha_fin");
  const hasRecurringValidFrom = mappedSet.has("vigencia_desde");

  if (hasLegacyStart && hasLegacyEnd) {
    if (!hasLocation) {
      return { mapped, format: null, fileErrors: [IMPORT_MISSING_LOCATION_MESSAGE] };
    }

    return { mapped, format: "legacy", fileErrors: [] };
  }

  if (hasRecurringValidFrom) {
    const fileErrors: string[] = [];
    if (!hasLocation) {
      fileErrors.push(IMPORT_MISSING_LOCATION_MESSAGE);
    }

    return {
      mapped,
      format: fileErrors.length === 0 ? "recurring" : null,
      fileErrors,
    };
  }

  if (hasClientDate) {
    const fileErrors: string[] = [];
    if (!hasLocation) {
      fileErrors.push(IMPORT_MISSING_LOCATION_MESSAGE);
    }

    return {
      mapped,
      format: fileErrors.length === 0 ? "client" : null,
      fileErrors,
    };
  }

  const fileErrors: string[] = [];
  if (!hasLocation) {
    fileErrors.push(IMPORT_MISSING_LOCATION_MESSAGE);
  }
  if (!hasClientDate && !hasLegacyStart) {
    fileErrors.push(IMPORT_MISSING_DATE_MESSAGE);
  }
  if (hasLegacyStart && !hasLegacyEnd) {
    fileErrors.push(IMPORT_MISSING_LEGACY_END_DATE_MESSAGE);
  }

  return { mapped, format: null, fileErrors };
};
