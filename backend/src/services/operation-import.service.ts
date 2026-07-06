import sql from "mssql";
import {
  IMPORT_EMPTY_LOCATION_VALUE_MESSAGE,
  IMPORT_LOCATION_AMBIGUOUS_MESSAGE,
  IMPORT_LOCATION_NOT_FOUND_MESSAGE,
  IMPORT_UNKNOWN_LOCATION_TYPE_MESSAGE,
  UNSUPPORTED_FILE_TYPE_MESSAGE,
} from "../constants/operation-import";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { operationRepository } from "../repositories/operation.repository";
import { serviceRepository } from "../repositories/service.repository";
import type { CreateOperationInput } from "../schemas/operation.schema";
import type { Service } from "../types/domain";
import type {
  OperationImportConfirmRow,
  OperationImportFormat,
  OperationImportPreviewResult,
  OperationImportPreviewRow,
} from "../types/operation-import";
import { mapImportHeaders } from "../utils/operation-import-headers";
import { createOperationImportDateTimeUtils } from "../utils/operation-import-datetime";
import { isOperationStartInPast } from "../utils/operation-lifecycle";
import {
  detectSpreadsheetFileType,
  isLikelyBinaryUpload,
  parseSpreadsheetBuffer,
  type SpreadsheetFileType,
} from "../utils/spreadsheet-parse";
import {
  companyOperationalDefaultsResolver,
  type ImportOperationalDefaults,
} from "./company-operational-defaults.resolver";
import { companyLocationTypesService } from "./company-location-types.service";

const normalizeServiceKey = (value: string): string => {
  const trimmed = value.trim();
  if (/^\d+(\.0+)?$/.test(trimmed)) {
    return String(Math.trunc(Number(trimmed)));
  }

  return trimmed.toLowerCase();
};

type ImportNormalizationContext = {
  importDefaults: ImportOperationalDefaults;
  dateTimeUtils: ReturnType<typeof createOperationImportDateTimeUtils>;
  activeLocationTypes: Set<string>;
};

const validateOptionalLocationType = (
  rawValue: string,
  activeLocationTypes: Set<string>,
): string[] => {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return [];
  }

  if (!activeLocationTypes.has(trimmed.toLowerCase())) {
    return [IMPORT_UNKNOWN_LOCATION_TYPE_MESSAGE];
  }

  return [];
};

const buildServiceLookup = (services: Service[]): Map<string, Service[]> => {
  const lookup = new Map<string, Service[]>();

  for (const service of services) {
    const key = normalizeServiceKey(service.name);
    const current = lookup.get(key) ?? [];
    current.push(service);
    lookup.set(key, current);
  }

  return lookup;
};

const parseTolerance = (
  raw: string,
  label: string,
  defaultValue: number,
): {
  value: number;
  display: string;
  errors: string[];
} => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      value: defaultValue,
      display: `${defaultValue} min (default)`,
      errors: [],
    };
  }

  if (!/^\d+$/.test(trimmed)) {
    return {
      value: defaultValue,
      display: trimmed,
      errors: [`${label} debe ser un entero mayor o igual a 0`],
    };
  }

  const parsed = Number(trimmed);
  if (parsed < 0) {
    return {
      value: defaultValue,
      display: trimmed,
      errors: [`${label} no puede ser negativa`],
    };
  }

  return {
    value: parsed,
    display: `${parsed} min`,
    errors: [],
  };
};

const getCell = (row: string[], headers: string[], key: string): string => {
  const index = headers.indexOf(key);
  if (index === -1) {
    return "";
  }

  return row[index] ?? "";
};

const buildOperationDuplicateKey = (serviceId: string, scheduledStart: string): string =>
  `${serviceId}|${new Date(scheduledStart).toISOString()}`;

const markExistingOperationConflicts = (
  rows: OperationImportPreviewRow[],
  existingKeys: Set<string>,
): void => {
  for (const row of rows) {
    if (!row.serviceId || !row.scheduledStart || row.errors.length > 0) {
      continue;
    }

    if (existingKeys.has(buildOperationDuplicateKey(row.serviceId, row.scheduledStart))) {
      row.errors.push("Ya existe una operación programada para esa ubicación y fecha de inicio");
      row.status = "invalid";
      row.earlyToleranceMinutes = null;
      row.lateToleranceMinutes = null;
    }
  }
};

const resolveService = (
  lookupKey: string,
  serviceLookup: Map<string, Service[]>,
  emptyError: string,
  notFoundError: string,
  ambiguousError: string,
): { serviceId: string | null; serviceName: string | null; errors: string[] } => {
  if (!lookupKey) {
    return { serviceId: null, serviceName: null, errors: [emptyError] };
  }

  const matches = serviceLookup.get(normalizeServiceKey(lookupKey)) ?? [];
  if (matches.length === 0) {
    return { serviceId: null, serviceName: null, errors: [notFoundError] };
  }

  if (matches.length > 1) {
    return { serviceId: null, serviceName: null, errors: [ambiguousError] };
  }

  return { serviceId: matches[0].id, serviceName: matches[0].name, errors: [] };
};

const validateClientRow = (
  rowNumber: number,
  row: string[],
  headers: string[],
  serviceLookup: Map<string, Service[]>,
  seenKeys: Set<string>,
  normalization: ImportNormalizationContext,
): OperationImportPreviewRow => {
  const locationValue = getCell(row, headers, "location").trim();
  const rawFecha = getCell(row, headers, "fecha").trim();
  const toleranciaTempranaRaw = getCell(row, headers, "tolerancia_temprana");
  const toleranciaTardiaRaw = getCell(row, headers, "tolerancia_tardia");
  const notas = getCell(row, headers, "notas").trim();
  const locationTypeRaw = getCell(row, headers, "location_type");

  const errors: string[] = [];
  errors.push(...validateOptionalLocationType(locationTypeRaw, normalization.activeLocationTypes));

  const serviceResolution = resolveService(
    locationValue,
    serviceLookup,
    IMPORT_EMPTY_LOCATION_VALUE_MESSAGE,
    IMPORT_LOCATION_NOT_FOUND_MESSAGE,
    IMPORT_LOCATION_AMBIGUOUS_MESSAGE,
  );
  errors.push(...serviceResolution.errors);

  if (!rawFecha) {
    errors.push("La columna Fecha es obligatoria");
  }

  const earlyTolerance = parseTolerance(
    toleranciaTempranaRaw,
    "Tolerancia temprana",
    normalization.importDefaults.earlyToleranceMinutes,
  );
  const lateTolerance = parseTolerance(
    toleranciaTardiaRaw,
    "Tolerancia tardía",
    normalization.importDefaults.lateToleranceMinutes,
  );
  errors.push(...earlyTolerance.errors, ...lateTolerance.errors);

  let scheduledStart: string | null = null;
  let scheduledEnd: string | null = null;
  let parsedOperationDate: string | null = null;
  let scheduledStartDisplay = "";
  let scheduledEndDisplay = "";

  if (rawFecha) {
    const schedule = normalization.dateTimeUtils.buildClientOperationSchedule(rawFecha);
    if ("error" in schedule) {
      errors.push(schedule.error);
    } else {
      scheduledStart = schedule.scheduledStart;
      scheduledEnd = schedule.scheduledEnd;
      parsedOperationDate = schedule.parsedOperationDate;
      scheduledStartDisplay = schedule.scheduledStartDisplay;
      scheduledEndDisplay = schedule.scheduledEndDisplay;

      if (isOperationStartInPast(scheduledStart)) {
        errors.push("La fecha de inicio no puede estar en el pasado");
      }
    }
  }

  if (serviceResolution.serviceId && scheduledStart) {
    const duplicateKey = buildOperationDuplicateKey(serviceResolution.serviceId, scheduledStart);
    if (seenKeys.has(duplicateKey)) {
      errors.push("Fila duplicada en el archivo para la misma ubicación y fecha de inicio");
    } else {
      seenKeys.add(duplicateKey);
    }
  }

  const isValid =
    errors.length === 0 && serviceResolution.serviceId && scheduledStart && scheduledEnd;

  return {
    rowNumber,
    format: "client",
    punto: locationValue,
    legacyLocation: locationValue,
    serviceId: serviceResolution.serviceId,
    serviceName: serviceResolution.serviceName,
    rawFecha,
    parsedOperationDate,
    fechaInicio: rawFecha,
    fechaFin: "",
    scheduledStart,
    scheduledEnd,
    scheduledStartDisplay,
    scheduledEndDisplay,
    toleranciaTemprana: toleranciaTempranaRaw,
    toleranciaTardia: toleranciaTardiaRaw,
    earlyToleranceMinutes: isValid ? earlyTolerance.value : null,
    lateToleranceMinutes: isValid ? lateTolerance.value : null,
    earlyToleranceDisplay: earlyTolerance.display,
    lateToleranceDisplay: lateTolerance.display,
    notas,
    status: isValid ? "valid" : "invalid",
    errors,
  };
};

const validateLegacyRow = (
  rowNumber: number,
  row: string[],
  headers: string[],
  serviceLookup: Map<string, Service[]>,
  seenKeys: Set<string>,
  normalization: ImportNormalizationContext,
): OperationImportPreviewRow => {
  const locationValue = getCell(row, headers, "location").trim();
  const fechaInicio = getCell(row, headers, "fecha_inicio").trim();
  const fechaFin = getCell(row, headers, "fecha_fin").trim();
  const toleranciaTempranaRaw = getCell(row, headers, "tolerancia_temprana");
  const toleranciaTardiaRaw = getCell(row, headers, "tolerancia_tardia");
  const notas = getCell(row, headers, "notas").trim();
  const locationTypeRaw = getCell(row, headers, "location_type");

  const errors: string[] = [];
  errors.push(...validateOptionalLocationType(locationTypeRaw, normalization.activeLocationTypes));

  const serviceResolution = resolveService(
    locationValue,
    serviceLookup,
    IMPORT_EMPTY_LOCATION_VALUE_MESSAGE,
    IMPORT_LOCATION_NOT_FOUND_MESSAGE,
    IMPORT_LOCATION_AMBIGUOUS_MESSAGE,
  );
  errors.push(...serviceResolution.errors);

  if (!fechaInicio) {
    errors.push("La fecha de inicio es obligatoria");
  }
  if (!fechaFin) {
    errors.push("La fecha de fin es obligatoria");
  }

  const earlyTolerance = parseTolerance(
    toleranciaTempranaRaw,
    "Tolerancia temprana",
    normalization.importDefaults.earlyToleranceMinutes,
  );
  const lateTolerance = parseTolerance(
    toleranciaTardiaRaw,
    "Tolerancia tardía",
    normalization.importDefaults.lateToleranceMinutes,
  );
  errors.push(...earlyTolerance.errors, ...lateTolerance.errors);

  let scheduledStart: string | null = null;
  let scheduledEnd: string | null = null;

  if (fechaInicio) {
    const parsedStart = normalization.dateTimeUtils.parseOperationImportDateTime(fechaInicio);
    if ("error" in parsedStart) {
      errors.push(`Fecha de inicio: ${parsedStart.error}`);
    } else {
      scheduledStart = parsedStart.iso;
      if (isOperationStartInPast(parsedStart.iso)) {
        errors.push("La fecha de inicio no puede estar en el pasado");
      }
    }
  }

  if (fechaFin) {
    const parsedEnd = normalization.dateTimeUtils.parseOperationImportDateTime(fechaFin);
    if ("error" in parsedEnd) {
      errors.push(`Fecha de fin: ${parsedEnd.error}`);
    } else {
      scheduledEnd = parsedEnd.iso;
    }
  }

  if (scheduledStart && scheduledEnd && new Date(scheduledEnd) <= new Date(scheduledStart)) {
    errors.push("La fecha de fin debe ser posterior a la fecha de inicio");
  }

  if (serviceResolution.serviceId && scheduledStart) {
    const duplicateKey = buildOperationDuplicateKey(serviceResolution.serviceId, scheduledStart);
    if (seenKeys.has(duplicateKey)) {
      errors.push("Fila duplicada en el archivo para la misma ubicación y fecha de inicio");
    } else {
      seenKeys.add(duplicateKey);
    }
  }

  const isValid =
    errors.length === 0 && serviceResolution.serviceId && scheduledStart && scheduledEnd;

  return {
    rowNumber,
    format: "legacy",
    punto: "",
    legacyLocation: locationValue,
    serviceId: serviceResolution.serviceId,
    serviceName: serviceResolution.serviceName,
    rawFecha: fechaInicio,
    parsedOperationDate: null,
    fechaInicio,
    fechaFin,
    scheduledStart,
    scheduledEnd,
    scheduledStartDisplay: scheduledStart ? fechaInicio : "",
    scheduledEndDisplay: scheduledEnd ? fechaFin : "",
    toleranciaTemprana: toleranciaTempranaRaw,
    toleranciaTardia: toleranciaTardiaRaw,
    earlyToleranceMinutes: isValid ? earlyTolerance.value : null,
    lateToleranceMinutes: isValid ? lateTolerance.value : null,
    earlyToleranceDisplay: earlyTolerance.display,
    lateToleranceDisplay: lateTolerance.display,
    notas,
    status: isValid ? "valid" : "invalid",
    errors,
  };
};

const toCreateInput = (row: OperationImportConfirmRow): CreateOperationInput => ({
  serviceId: row.serviceId,
  scheduledStart: row.scheduledStart,
  scheduledEnd: row.scheduledEnd,
  earlyToleranceMinutes: row.earlyToleranceMinutes,
  lateToleranceMinutes: row.lateToleranceMinutes,
  notes: row.notes,
});

const emptyPreview = (
  fileErrors: string[],
  fileType: SpreadsheetFileType | null = null,
): OperationImportPreviewResult => ({
  format: null,
  fileType,
  fileErrors,
  summary: { totalRows: 0, validRows: 0, invalidRows: 0, canConfirm: false },
  rows: [],
});

export const operationImportService = {
  async previewFile(
    companyId: string,
    buffer: Buffer,
    fileName: string,
  ): Promise<OperationImportPreviewResult> {
    const fileType = detectSpreadsheetFileType(fileName);
    if (!fileType) {
      return emptyPreview([UNSUPPORTED_FILE_TYPE_MESSAGE]);
    }

    if (buffer.length === 0) {
      return emptyPreview(["El archivo está vacío"], fileType);
    }

    if (fileType === "csv" && isLikelyBinaryUpload(buffer)) {
      return emptyPreview([UNSUPPORTED_FILE_TYPE_MESSAGE], fileType);
    }

    const importDefaults = await companyOperationalDefaultsResolver.getImportDefaults(companyId);
    const activeLocationTypes = companyLocationTypesService.buildActiveTypeLookup(
      await companyLocationTypesService.listLocationTypes(companyId, true),
    );
    const normalization: ImportNormalizationContext = {
      importDefaults,
      dateTimeUtils: createOperationImportDateTimeUtils({
        operationTimezone: importDefaults.operationTimezone,
        defaultOperationStartTime: importDefaults.defaultOperationStartTime,
        defaultOperationEndTime: importDefaults.defaultOperationEndTime,
      }),
      activeLocationTypes,
    };

    const parsed = parseSpreadsheetBuffer(buffer, fileType, importDefaults.operationTimezone);
    if (parsed.headers.length === 0) {
      return emptyPreview(["El archivo está vacío o no contiene encabezados"], fileType);
    }

    const { mapped, format, fileErrors: headerErrors } = mapImportHeaders(parsed.headers);
    if (!format) {
      return emptyPreview(headerErrors, fileType);
    }

    if (parsed.rows.length === 0) {
      return emptyPreview(["El archivo no contiene filas de datos"], fileType);
    }

    const services = await serviceRepository.listAllActive(companyId);
    const serviceLookup = buildServiceLookup(services);
    const seenKeys = new Set<string>();

    const rows: OperationImportPreviewRow[] = [];
    for (let index = 0; index < parsed.rows.length; index += 1) {
      const row = parsed.rows[index];
      const isEmptyRow = row.every((cell) => !cell.trim());
      if (isEmptyRow) {
        continue;
      }

      const previewRow =
        format === "client"
          ? validateClientRow(index + 2, row, mapped, serviceLookup, seenKeys, normalization)
          : validateLegacyRow(index + 2, row, mapped, serviceLookup, seenKeys, normalization);
      rows.push(previewRow);
    }

    const pairsToCheck = rows
      .filter((row) => row.serviceId && row.scheduledStart && row.errors.length === 0)
      .map((row) => ({
        serviceId: row.serviceId as string,
        scheduledStart: row.scheduledStart as string,
      }));
    const existingKeys = await operationRepository.findExistingActiveKeys(companyId, pairsToCheck);
    markExistingOperationConflicts(rows, existingKeys);

    const fileErrors: string[] = [];
    if (rows.length === 0) {
      fileErrors.push("No se encontraron filas válidas para importar");
    }

    const validRows = rows.filter((row) => row.status === "valid").length;
    const invalidRows = rows.length - validRows;

    return {
      format,
      fileType,
      fileErrors,
      rows,
      summary: {
        totalRows: rows.length,
        validRows,
        invalidRows,
        canConfirm: rows.length > 0 && invalidRows === 0,
      },
    };
  },

  async preview(companyId: string, csvContent: string): Promise<OperationImportPreviewResult> {
    return this.previewFile(companyId, Buffer.from(csvContent, "utf8"), "upload.csv");
  },

  async confirm(companyId: string, rows: OperationImportConfirmRow[]) {
    const services = await serviceRepository.listAllActive(companyId);
    const serviceById = new Map(services.map((service) => [service.id, service]));
    const seenKeys = new Set<string>();

    for (const row of rows) {
      const service = serviceById.get(row.serviceId);
      if (!service) {
        throw new AppError(
          400,
          "OPERATION_IMPORT_INVALID",
          "La importación contiene filas inválidas. Revisá el archivo y volvé a intentar.",
        );
      }

      if (!service.active) {
        throw new AppError(409, "SERVICE_INACTIVE", "No se puede crear operación para un servicio inactivo");
      }

      if (isOperationStartInPast(row.scheduledStart)) {
        throw new AppError(
          400,
          "OPERATION_START_IN_PAST",
          "No se puede programar una operación con fecha de inicio en el pasado",
        );
      }

      if (new Date(row.scheduledEnd) <= new Date(row.scheduledStart)) {
        throw new AppError(
          400,
          "INVALID_OPERATION_DATE_RANGE",
          "scheduledEnd debe ser posterior a scheduledStart",
        );
      }

      const duplicateKey = buildOperationDuplicateKey(row.serviceId, row.scheduledStart);
      if (seenKeys.has(duplicateKey)) {
        throw new AppError(
          400,
          "OPERATION_IMPORT_INVALID",
          "La importación contiene filas duplicadas para el mismo servicio y fecha de inicio",
        );
      }
      seenKeys.add(duplicateKey);
    }

    const existingKeys = await operationRepository.findExistingActiveKeys(
      companyId,
      rows.map((row) => ({
        serviceId: row.serviceId,
        scheduledStart: row.scheduledStart,
      })),
    );
    if (existingKeys.size > 0) {
      throw new AppError(
        409,
        "OPERATION_DUPLICATE",
        "Ya existe una operación para ese servicio y fecha de inicio",
      );
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const created = await operationRepository.createManyInTransaction(
        companyId,
        transaction,
        rows.map(toCreateInput),
      );

      await transaction.commit();
      return { data: created, count: created.length };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
