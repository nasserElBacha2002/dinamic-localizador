import sql from "mssql";
import {
  IMPORT_EMPTY_LOCATION_VALUE_MESSAGE,
  IMPORT_LOCATION_AMBIGUOUS_MESSAGE,
  IMPORT_LOCATION_NOT_FOUND_MESSAGE,
  IMPORT_RECURRING_COMPANY_CUSTOM_SCHEDULE_MESSAGE,
  IMPORT_RECURRING_DUPLICATE_MESSAGE,
  IMPORT_RECURRING_MULTI_SHIFT_TEMPLATE_INACTIVE_MESSAGE,
  IMPORT_RECURRING_MULTI_SHIFT_TEMPLATE_NOT_FOUND_MESSAGE,
  IMPORT_UNKNOWN_LOCATION_TYPE_MESSAGE,
  UNSUPPORTED_FILE_TYPE_MESSAGE,
} from "../../constants/operation-import";
import { getPool } from "../../database/connection";
import { AppError } from "../../errors/app-error";
import { companyShiftTemplateRepository } from "../../repositories/companies/company-shift-template.repository";
import { companyWorkScheduleRepository } from "../../repositories/companies/company-work-schedule.repository";
import { operationRepository } from "../../repositories/operations/operation.repository";
import { serviceRepository } from "../../repositories/locations/service.repository";
import type { CreateRecurringOperationInput } from "../../schemas/operation.schema";
import type { Operation, Service } from "../../types/domain";
import type {
  OperationImportConfirmRow,
  OperationImportPreviewResult,
  OperationImportPreviewRow,
  OperationImportRecurringCollapsedConfirmRow,
  OperationImportRecurringConfirmRow,
} from "../../types/operation-import";
import { isMultiShiftCollapsedImportRow, isRecurringImportConfirmRow } from "../../types/operation-import";
import { mapImportHeaders } from "../../utils/operations/operation-import-headers";
import { createOperationImportDateTimeUtils } from "../../utils/operations/operation-import-datetime";
import {
  buildRecurringImportScheduleDays,
  hasAnyRecurringWeekdayColumn,
  hasRecurringImportCustomScheduleColumnValues,
  parseRecurringImportOperationKind,
  parseRecurringImportScheduleSource,
  parseRecurringImportTime,
} from "../../utils/operations/operation-import-recurring";
import {
  buildRecurringImportShiftEnabledDays,
  assertRecurringMultiShiftConfirmGroupsConsistent,
  buildRecurringMultiShiftGroupKey,
  collapseRecurringMultiShiftConfirmRows,
  finalizeRecurringMultiShiftPreviewGroups,
  formatMultiShiftScheduleDisplay,
  IMPORT_RECURRING_MULTI_SHIFT_CUSTOM_SOURCE_MESSAGE,
  IMPORT_RECURRING_MULTI_SHIFT_GROUP_INCONSISTENT_MESSAGE,
  IMPORT_RECURRING_MULTI_SHIFT_MIXED_MODE_MESSAGE,
  IMPORT_RECURRING_MULTI_SHIFT_SHIFT_CODE_DUPLICATE_MESSAGE,
  IMPORT_RECURRING_MULTI_SHIFT_SHIFT_CODE_REQUIRED_MESSAGE,
  IMPORT_RECURRING_MULTI_SHIFT_SHIFT_TIMES_REQUIRED_MESSAGE,
  IMPORT_RECURRING_MULTI_SHIFT_WEEKDAY_REQUIRED_MESSAGE,
  normalizeRecurringImportShiftCode,
  orderRecurringMultiShiftImportSeeds,
  parseRecurringImportScheduleMode,
  parseRecurringImportShiftTimes,
  recurringImportRowHasWeekdayValues,
  toRecurringMultiShiftCreateInput,
  type RecurringImportScheduleMode,
} from "../../utils/operations/operation-import-multi-shift";
import { isOperationStartInPast } from "../../utils/operations/operation-lifecycle";
import { isActiveOperationDuplicateError } from "../../utils/operations/active-operation-duplicate-errors";
import {
  buildScheduleSummaryLabel,
  isOvernightSchedule,
  normalizeWeeklyScheduleDays,
  validateWeeklyScheduleDays,
} from "../../utils/operations/weekly-schedule";
import {
  detectSpreadsheetFileType,
  isLikelyBinaryUpload,
  parseSpreadsheetBuffer,
  type SpreadsheetFileType,
} from "../../utils/spreadsheet-parse";
import {
  companyOperationalDefaultsResolver,
  type ImportOperationalDefaults,
} from "../companies/company-operational-defaults.resolver";
import { companyLocationTypesService } from "../companies/company-location-types.service";
import { operationService } from "./operation.service";

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
  hasCompanyWorkSchedule: boolean;
  shiftTemplateById: Map<string, { id: string; isActive: boolean; sortOrder: number }>;
  shiftTemplateByCode: Map<string, { id: string; isActive: boolean; sortOrder: number }>;
};

const emptyMultiShiftPreviewFields = {
  scheduleMode: "SINGLE" as const,
  multiShiftGroupKey: null,
  shiftCode: null,
  shiftName: null,
  shiftTemplateId: null,
  shiftTemplateSortOrder: null,
  shiftStartTime: null,
  shiftEndTime: null,
  shiftDays: null,
};

const emptyRecurringPreviewFields = {
  validFrom: null,
  validUntil: null,
  scheduleSource: null,
  scheduleTimezone: null,
  scheduleDays: null,
  ...emptyMultiShiftPreviewFields,
} as const;

const buildRecurringDuplicateKey = (serviceId: string, validFrom: string): string =>
  `${serviceId}|${validFrom}`;

const resolveImportTolerances = (
  row: Pick<
    OperationImportConfirmRow,
    "earlyToleranceMinutes" | "lateToleranceMinutes" | "earlyToleranceSource" | "lateToleranceSource"
  >,
  defaults: ImportOperationalDefaults,
) => {
  const earlySource = row.earlyToleranceSource ?? "CUSTOM";
  const lateSource = row.lateToleranceSource ?? "CUSTOM";

  return {
    earlyToleranceMinutes:
      earlySource === "COMPANY_DEFAULT"
        ? defaults.earlyToleranceMinutes
        : row.earlyToleranceMinutes,
    lateToleranceMinutes:
      lateSource === "COMPANY_DEFAULT" ? defaults.lateToleranceMinutes : row.lateToleranceMinutes,
    earlyToleranceSource: earlySource,
    lateToleranceSource: lateSource,
  };
};

const toRecurringCreateInput = (
  row: OperationImportRecurringCollapsedConfirmRow,
): CreateRecurringOperationInput => {
  if (isMultiShiftCollapsedImportRow(row)) {
    return toRecurringMultiShiftCreateInput(row);
  }

  return {
    operationKind: "RECURRING",
    scheduleMode: "SINGLE",
    serviceId: row.serviceId,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    scheduleSource: row.scheduleSource,
    ...(row.scheduleSource === "CUSTOM" ? { scheduleDays: row.scheduleDays } : {}),
    earlyToleranceMinutes: null,
    lateToleranceMinutes: null,
  };
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
  source: "COMPANY_DEFAULT" | "CUSTOM";
  display: string;
  errors: string[];
} => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      value: defaultValue,
      source: "COMPANY_DEFAULT",
      display: `${defaultValue} min (default)`,
      errors: [],
    };
  }

  if (!/^\d+$/.test(trimmed)) {
    return {
      value: defaultValue,
      source: "COMPANY_DEFAULT",
      display: trimmed,
      errors: [`${label} debe ser un entero mayor o igual a 0`],
    };
  }

  const parsed = Number(trimmed);
  if (parsed < 0) {
    return {
      value: defaultValue,
      source: "COMPANY_DEFAULT",
      display: trimmed,
      errors: [`${label} no puede ser negativa`],
    };
  }

  return {
    value: parsed,
    source: "CUSTOM",
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

const markExistingRecurringConflicts = (
  rows: OperationImportPreviewRow[],
  existingKeys: Set<string>,
): void => {
  for (const row of rows) {
    if (!row.serviceId || !row.validFrom || row.errors.length > 0) {
      continue;
    }

    if (existingKeys.has(buildRecurringDuplicateKey(row.serviceId, row.validFrom))) {
      row.errors.push(IMPORT_RECURRING_DUPLICATE_MESSAGE);
      row.status = "invalid";
      row.earlyToleranceMinutes = null;
      row.lateToleranceMinutes = null;
      row.earlyToleranceSource = "COMPANY_DEFAULT";
      row.lateToleranceSource = "COMPANY_DEFAULT";
    }
  }
};

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
      row.earlyToleranceSource = "COMPANY_DEFAULT";
      row.lateToleranceSource = "COMPANY_DEFAULT";
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
    operationKind: "ONE_TIME",
    ...emptyRecurringPreviewFields,
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
    earlyToleranceSource: earlyTolerance.source,
    lateToleranceSource: lateTolerance.source,
    earlyToleranceDisplay: earlyTolerance.display,
    lateToleranceDisplay: lateTolerance.display,
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
    operationKind: "ONE_TIME",
    ...emptyRecurringPreviewFields,
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
    earlyToleranceSource: earlyTolerance.source,
    lateToleranceSource: lateTolerance.source,
    earlyToleranceDisplay: earlyTolerance.display,
    lateToleranceDisplay: lateTolerance.display,
    status: isValid ? "valid" : "invalid",
    errors,
  };
};

const toCreateInput = (
  row: OperationImportConfirmRow,
  defaults: ImportOperationalDefaults,
) => {
  if (isRecurringImportConfirmRow(row)) {
    throw new AppError(
      500,
      "OPERATION_IMPORT_INTERNAL",
      "Fila recurrente enviada al flujo de operación puntual",
    );
  }

  const tolerances = resolveImportTolerances(row, defaults);

  return {
    operationKind: "ONE_TIME" as const,
    serviceId: row.serviceId,
    scheduledStart: row.scheduledStart,
    scheduledEnd: row.scheduledEnd,
    earlyToleranceMinutes: tolerances.earlyToleranceMinutes,
    lateToleranceMinutes: tolerances.lateToleranceMinutes,
    earlyToleranceSource: tolerances.earlyToleranceSource,
    lateToleranceSource: tolerances.lateToleranceSource,
  };
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RecurringImportSeenState = {
  singleOperationKeys: Set<string>;
  operationModes: Map<string, RecurringImportScheduleMode>;
  multiShiftCodes: Set<string>;
};

const resolveShiftTemplateReference = (
  rawTemplate: string,
  normalization: ImportNormalizationContext,
): { templateId: string | null; templateSortOrder: number | null; errors: string[] } => {
  const trimmed = rawTemplate.trim();
  if (!trimmed) {
    return { templateId: null, templateSortOrder: null, errors: [] };
  }

  if (UUID_PATTERN.test(trimmed)) {
    const template = normalization.shiftTemplateById.get(trimmed.toLowerCase());
    if (!template) {
      return {
        templateId: null,
        templateSortOrder: null,
        errors: [IMPORT_RECURRING_MULTI_SHIFT_TEMPLATE_NOT_FOUND_MESSAGE],
      };
    }
    if (!template.isActive) {
      return {
        templateId: null,
        templateSortOrder: null,
        errors: [IMPORT_RECURRING_MULTI_SHIFT_TEMPLATE_INACTIVE_MESSAGE],
      };
    }
    return { templateId: template.id, templateSortOrder: template.sortOrder, errors: [] };
  }

  const template = normalization.shiftTemplateByCode.get(trimmed.toLowerCase());
  if (!template) {
    return {
      templateId: null,
      templateSortOrder: null,
      errors: [IMPORT_RECURRING_MULTI_SHIFT_TEMPLATE_NOT_FOUND_MESSAGE],
    };
  }
  if (!template.isActive) {
    return {
      templateId: null,
      templateSortOrder: null,
      errors: [IMPORT_RECURRING_MULTI_SHIFT_TEMPLATE_INACTIVE_MESSAGE],
    };
  }

  return { templateId: template.id, templateSortOrder: template.sortOrder, errors: [] };
};

const validateRecurringRow = (
  rowNumber: number,
  row: string[],
  headers: string[],
  serviceLookup: Map<string, Service[]>,
  seen: RecurringImportSeenState,
  normalization: ImportNormalizationContext,
): OperationImportPreviewRow => {
  const locationValue = getCell(row, headers, "location").trim();
  const rawValidFrom = getCell(row, headers, "vigencia_desde").trim();
  const rawValidUntil = getCell(row, headers, "vigencia_hasta").trim();
  const rawStartTime = getCell(row, headers, "horario_inicio");
  const rawEndTime = getCell(row, headers, "horario_fin");
  const rawScheduleSource = getCell(row, headers, "origen_horario");
  const rawOperationKind = getCell(row, headers, "tipo_operacion");
  const rawScheduleMode = getCell(row, headers, "modo_horario");
  const rawShiftCode = getCell(row, headers, "turno_codigo");
  const rawShiftName = getCell(row, headers, "turno_nombre");
  const rawShiftTemplate = getCell(row, headers, "plantilla_turno");
  const toleranciaTempranaRaw = getCell(row, headers, "tolerancia_temprana");
  const toleranciaTardiaRaw = getCell(row, headers, "tolerancia_tardia");
  const locationTypeRaw = getCell(row, headers, "location_type");

  const errors: string[] = [];
  errors.push(...validateOptionalLocationType(locationTypeRaw, normalization.activeLocationTypes));

  const operationKindResolution = parseRecurringImportOperationKind(rawOperationKind);
  if (operationKindResolution.error) {
    errors.push(operationKindResolution.error);
  } else if (operationKindResolution.kind === "ONE_TIME") {
    errors.push("tipo_operacion ONE_TIME no es compatible con el formato recurrente de importación");
  }

  const scheduleModeResolution = parseRecurringImportScheduleMode(rawScheduleMode);
  if (scheduleModeResolution.error) {
    errors.push(scheduleModeResolution.error);
  }
  const scheduleMode = scheduleModeResolution.mode;

  const serviceResolution = resolveService(
    locationValue,
    serviceLookup,
    IMPORT_EMPTY_LOCATION_VALUE_MESSAGE,
    IMPORT_LOCATION_NOT_FOUND_MESSAGE,
    IMPORT_LOCATION_AMBIGUOUS_MESSAGE,
  );
  errors.push(...serviceResolution.errors);

  if (!rawValidFrom) {
    errors.push("La columna vigencia_desde es obligatoria");
  }

  const scheduleSourceResolution = parseRecurringImportScheduleSource(rawScheduleSource);
  if (scheduleSourceResolution.error) {
    errors.push(scheduleSourceResolution.error);
  }
  let scheduleSource = scheduleSourceResolution.value ?? "CUSTOM";
  if (scheduleMode === "MULTI_SHIFT") {
    if (scheduleSource === "CUSTOM" && rawScheduleSource.trim()) {
      errors.push(IMPORT_RECURRING_MULTI_SHIFT_CUSTOM_SOURCE_MESSAGE);
    }
    scheduleSource = "COMPANY";
    if (!normalization.hasCompanyWorkSchedule) {
      errors.push("La empresa no tiene un horario laboral semanal configurado");
    }
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

  let validFrom: string | null = null;
  let validUntil: string | null = null;

  if (rawValidFrom) {
    const parsedValidFrom = normalization.dateTimeUtils.parseOperationImportDateOnly(rawValidFrom);
    if ("error" in parsedValidFrom) {
      errors.push(`vigencia_desde: ${parsedValidFrom.error}`);
    } else {
      validFrom = parsedValidFrom.dateOnly;
    }
  }

  if (rawValidUntil) {
    const parsedValidUntil = normalization.dateTimeUtils.parseOperationImportDateOnly(rawValidUntil);
    if ("error" in parsedValidUntil) {
      errors.push(`vigencia_hasta: ${parsedValidUntil.error}`);
    } else {
      validUntil = parsedValidUntil.dateOnly;
    }
  }

  if (validFrom && validUntil && validUntil < validFrom) {
    errors.push("La fecha de finalización no puede ser anterior a la fecha de inicio");
  }

  const defaultStartTime = normalization.importDefaults.defaultOperationStartTime;
  const defaultEndTime = normalization.importDefaults.defaultOperationEndTime;

  let scheduleDays: ReturnType<typeof normalizeWeeklyScheduleDays> | null = null;
  let scheduledStartDisplay = "";
  let scheduledEndDisplay = "";
  let shiftStartTime: string | null = null;
  let shiftEndTime: string | null = null;
  let shiftEnabledDays: { dayOfWeek: number; isEnabled: boolean }[] | null = null;
  let shiftCode: string | null = null;
  let shiftName: string | null = null;
  let shiftTemplateId: string | null = null;
  let shiftTemplateSortOrder: number | null = null;

  if (scheduleMode === "MULTI_SHIFT") {
    if (!rawShiftCode.trim() && !rawShiftName.trim()) {
      errors.push(IMPORT_RECURRING_MULTI_SHIFT_SHIFT_CODE_REQUIRED_MESSAGE);
    } else {
      shiftCode = normalizeRecurringImportShiftCode(rawShiftCode, rawShiftName);
      shiftName = rawShiftName.trim() || rawShiftCode.trim();
    }

    const templateResolution = resolveShiftTemplateReference(rawShiftTemplate, normalization);
    errors.push(...templateResolution.errors);
    shiftTemplateId = templateResolution.templateId;
    shiftTemplateSortOrder = templateResolution.templateSortOrder;

    if (!rawStartTime.trim() || !rawEndTime.trim()) {
      errors.push(IMPORT_RECURRING_MULTI_SHIFT_SHIFT_TIMES_REQUIRED_MESSAGE);
    } else {
      const shiftTimes = parseRecurringImportShiftTimes(rawStartTime, rawEndTime);
      errors.push(...shiftTimes.errors);
      shiftStartTime = shiftTimes.startTime;
      shiftEndTime = shiftTimes.endTime;
    }

    if (!recurringImportRowHasWeekdayValues(headers, row)) {
      errors.push(IMPORT_RECURRING_MULTI_SHIFT_WEEKDAY_REQUIRED_MESSAGE);
    } else {
      shiftEnabledDays = buildRecurringImportShiftEnabledDays(headers, row);
      if (!shiftEnabledDays.some((day) => day.isEnabled)) {
        errors.push(IMPORT_RECURRING_MULTI_SHIFT_WEEKDAY_REQUIRED_MESSAGE);
      }
    }

    if (shiftStartTime && shiftEndTime) {
      scheduledStartDisplay = formatMultiShiftScheduleDisplay(shiftStartTime, shiftEndTime);
      scheduledEndDisplay = shiftName ? `${shiftName} · ${shiftCode ?? ""}`.trim() : (shiftCode ?? "");
    }
  } else {
    const startTimeResolution = parseRecurringImportTime(rawStartTime, "horario_inicio");
    const endTimeResolution = parseRecurringImportTime(rawEndTime, "horario_fin");
    if (startTimeResolution.error) {
      errors.push(startTimeResolution.error);
    }
    if (endTimeResolution.error) {
      errors.push(endTimeResolution.error);
    }

    const startTime = startTimeResolution.value ?? defaultStartTime;
    const endTime = endTimeResolution.value ?? defaultEndTime;

    if (startTime === endTime) {
      errors.push("La hora de inicio y fin no pueden ser iguales");
    }

    if (scheduleSource === "COMPANY") {
      if (!normalization.hasCompanyWorkSchedule) {
        errors.push("La empresa no tiene un horario laboral semanal configurado");
      }
      if (hasRecurringImportCustomScheduleColumnValues(headers, row)) {
        errors.push(IMPORT_RECURRING_COMPANY_CUSTOM_SCHEDULE_MESSAGE);
      }
      scheduledStartDisplay = "Horario de la empresa";
      scheduledEndDisplay = "Horario de la empresa";
    } else {
      const weekdayColumnsPresent = hasAnyRecurringWeekdayColumn(headers);
      if (!weekdayColumnsPresent) {
        errors.push("Configurá al menos un día de trabajo para esta operación");
      } else {
        scheduleDays = normalizeWeeklyScheduleDays(
          buildRecurringImportScheduleDays(headers, row, startTime, endTime),
        );
        const validation = validateWeeklyScheduleDays(scheduleDays);
        if (!validation.valid) {
          errors.push(validation.message);
        } else {
          const summary = buildScheduleSummaryLabel(scheduleDays);
          scheduledStartDisplay = `${startTime}–${endTime}`;
          scheduledEndDisplay = isOvernightSchedule(startTime, endTime)
            ? `${endTime} (día siguiente)`
            : endTime;
          scheduledStartDisplay = `${summary.summaryLabel} · ${scheduledStartDisplay}`;
        }
      }
    }
  }

  if (serviceResolution.serviceId && validFrom) {
    const operationKey = buildRecurringDuplicateKey(serviceResolution.serviceId, validFrom);
    const previousMode = seen.operationModes.get(operationKey);
    if (previousMode && previousMode !== scheduleMode) {
      errors.push(IMPORT_RECURRING_MULTI_SHIFT_MIXED_MODE_MESSAGE);
    } else {
      seen.operationModes.set(operationKey, scheduleMode);
    }

    if (scheduleMode === "SINGLE") {
      if (seen.singleOperationKeys.has(operationKey)) {
        errors.push("Fila duplicada en el archivo para la misma ubicación y vigencia_desde");
      } else {
        seen.singleOperationKeys.add(operationKey);
      }
    } else if (shiftCode) {
      const shiftKey = `${operationKey}|${shiftCode}`;
      if (seen.multiShiftCodes.has(shiftKey)) {
        errors.push(IMPORT_RECURRING_MULTI_SHIFT_SHIFT_CODE_DUPLICATE_MESSAGE);
      } else {
        seen.multiShiftCodes.add(shiftKey);
      }
    }
  }

  const isValid =
    errors.length === 0 &&
    serviceResolution.serviceId &&
    validFrom &&
    (scheduleMode === "MULTI_SHIFT"
      ? Boolean(shiftCode && shiftStartTime && shiftEndTime && shiftEnabledDays?.some((day) => day.isEnabled))
      : scheduleSource === "COMPANY" || scheduleDays);

  const multiShiftGroupKey =
    isValid && scheduleMode === "MULTI_SHIFT" && serviceResolution.serviceId && validFrom
      ? buildRecurringMultiShiftGroupKey(serviceResolution.serviceId, validFrom)
      : null;

  return {
    rowNumber,
    format: "recurring",
    operationKind: "RECURRING",
    scheduleMode,
    multiShiftGroupKey,
    shiftCode,
    shiftName,
    shiftTemplateId,
    shiftTemplateSortOrder,
    punto: locationValue,
    legacyLocation: locationValue,
    serviceId: serviceResolution.serviceId,
    serviceName: serviceResolution.serviceName,
    rawFecha: rawValidFrom,
    parsedOperationDate: null,
    fechaInicio: rawValidFrom,
    fechaFin: rawValidUntil,
    validFrom,
    validUntil,
    scheduleSource,
    scheduleTimezone: normalization.importDefaults.operationTimezone,
    scheduleDays: scheduleDays ?? null,
    scheduledStart: null,
    scheduledEnd: null,
    scheduledStartDisplay,
    scheduledEndDisplay,
    toleranciaTemprana: toleranciaTempranaRaw,
    toleranciaTardia: toleranciaTardiaRaw,
    earlyToleranceMinutes: isValid ? earlyTolerance.value : null,
    lateToleranceMinutes: isValid ? lateTolerance.value : null,
    earlyToleranceSource: earlyTolerance.source,
    lateToleranceSource: lateTolerance.source,
    earlyToleranceDisplay: earlyTolerance.display,
    lateToleranceDisplay: lateTolerance.display,
    status: isValid ? "valid" : "invalid",
    errors,
    shiftStartTime,
    shiftEndTime,
    shiftDays: shiftEnabledDays,
  };
};

export const buildRecurringImportConfirmPayload = (
  row: OperationImportPreviewRow,
): OperationImportRecurringConfirmRow | null => {
  if (
    row.status !== "valid" ||
    !row.serviceId ||
    !row.validFrom ||
    row.earlyToleranceMinutes === null ||
    row.lateToleranceMinutes === null ||
    !row.scheduleSource
  ) {
    return null;
  }

  const tolerancePayload = {
    earlyToleranceMinutes: row.earlyToleranceMinutes,
    lateToleranceMinutes: row.lateToleranceMinutes,
    earlyToleranceSource: row.earlyToleranceSource,
    lateToleranceSource: row.lateToleranceSource,
  };

  if (row.scheduleMode === "MULTI_SHIFT") {
    if (!row.shiftCode || !row.shiftStartTime || !row.shiftEndTime || !row.shiftDays) {
      return null;
    }

    return {
      operationKind: "RECURRING",
      scheduleMode: "MULTI_SHIFT",
      multiShiftGroupKey: row.multiShiftGroupKey ?? undefined,
      serviceId: row.serviceId,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      scheduleSource: "COMPANY",
      shift: {
        code: row.shiftCode,
        name: row.shiftName?.trim() || row.shiftCode,
        templateId: row.shiftTemplateId,
        startTime: row.shiftStartTime,
        endTime: row.shiftEndTime,
        days: row.shiftDays,
      },
      ...tolerancePayload,
    };
  }

  return {
    operationKind: "RECURRING",
    scheduleMode: "SINGLE",
    serviceId: row.serviceId,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    scheduleSource: row.scheduleSource,
    ...(row.scheduleSource === "CUSTOM" && row.scheduleDays ? { scheduleDays: row.scheduleDays } : {}),
    ...tolerancePayload,
  };
};

export type OperationImportConfirmResult = {
  data: Operation[];
  count: number;
  workdaySyncError: AppError | null;
};

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
    const companyWorkSchedule = await companyWorkScheduleRepository.findByCompanyId(companyId);
    const shiftTemplates = await companyShiftTemplateRepository.listByCompanyId(companyId);
    const shiftTemplateById = new Map(
      shiftTemplates.map((template) => [
        template.id.toLowerCase(),
        { id: template.id, isActive: template.isActive, sortOrder: template.sortOrder },
      ]),
    );
    const shiftTemplateByCode = new Map(
      shiftTemplates.map((template) => [
        template.code.toLowerCase(),
        { id: template.id, isActive: template.isActive, sortOrder: template.sortOrder },
      ]),
    );
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
      hasCompanyWorkSchedule: companyWorkSchedule !== null,
      shiftTemplateById,
      shiftTemplateByCode,
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
    const recurringSeen: RecurringImportSeenState = {
      singleOperationKeys: new Set(),
      operationModes: new Map(),
      multiShiftCodes: new Set(),
    };

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
          : format === "legacy"
            ? validateLegacyRow(index + 2, row, mapped, serviceLookup, seenKeys, normalization)
            : validateRecurringRow(index + 2, row, mapped, serviceLookup, recurringSeen, normalization);
      rows.push(previewRow);
    }

    if (format === "recurring") {
      finalizeRecurringMultiShiftPreviewGroups(rows);
    }

    if (format !== "recurring") {
      const pairsToCheck = rows
        .filter((row) => row.serviceId && row.scheduledStart && row.errors.length === 0)
        .map((row) => ({
          serviceId: row.serviceId as string,
          scheduledStart: row.scheduledStart as string,
        }));
      const existingKeys = await operationRepository.findExistingActiveKeys(companyId, pairsToCheck);
      markExistingOperationConflicts(rows, existingKeys);
    } else {
      const recurringPairs = Array.from(
        rows
          .filter((row) => row.serviceId && row.validFrom && row.errors.length === 0)
          .reduce((accumulator, row) => {
            const key = `${row.serviceId}|${row.validFrom}`;
            if (!accumulator.has(key)) {
              accumulator.set(key, {
                serviceId: row.serviceId as string,
                validFrom: row.validFrom as string,
              });
            }
            return accumulator;
          }, new Map<string, { serviceId: string; validFrom: string }>())
          .values(),
      );
      const existingRecurringKeys = await operationRepository.findExistingActiveRecurringKeys(
        companyId,
        recurringPairs,
      );
      markExistingRecurringConflicts(rows, existingRecurringKeys);
    }

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

  async confirm(companyId: string, rows: OperationImportConfirmRow[]): Promise<OperationImportConfirmResult> {
    const importDefaults = await companyOperationalDefaultsResolver.getImportDefaults(companyId);
    const services = await serviceRepository.listAllActive(companyId);
    const serviceById = new Map(services.map((service) => [service.id, service]));

    const recurringRows = rows.filter(isRecurringImportConfirmRow);
    const oneTimeRows = rows.filter((row) => !isRecurringImportConfirmRow(row));

    if (recurringRows.length > 0 && oneTimeRows.length > 0) {
      throw new AppError(
        400,
        "OPERATION_IMPORT_INVALID",
        "No se pueden mezclar filas ONE_TIME y RECURRING en la misma confirmación",
      );
    }

    if (recurringRows.length > 0) {
      return this.confirmRecurring(companyId, recurringRows, importDefaults, serviceById);
    }

    return this.confirmOneTime(companyId, oneTimeRows, importDefaults, serviceById);
  },

  async confirmOneTime(
    companyId: string,
    rows: OperationImportConfirmRow[],
    importDefaults: ImportOperationalDefaults,
    serviceById: Map<string, Service>,
  ): Promise<OperationImportConfirmResult> {
    const seenKeys = new Set<string>();

    for (const row of rows) {
      if (isRecurringImportConfirmRow(row)) {
        continue;
      }

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
      rows
        .filter((row) => !isRecurringImportConfirmRow(row))
        .map((row) => ({
          serviceId: row.serviceId,
          scheduledStart: (row as { scheduledStart: string }).scheduledStart,
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
        rows.filter((row) => !isRecurringImportConfirmRow(row)).map((row) => toCreateInput(row, importDefaults)),
      );

      await transaction.commit();
      return { data: created, count: created.length, workdaySyncError: null };
    } catch (error) {
      await transaction.rollback();
      if (isActiveOperationDuplicateError(error)) {
        throw new AppError(
          409,
          "OPERATION_DUPLICATE",
          "Ya existe una operación para ese servicio y fecha de inicio",
        );
      }
      throw error;
    }
  },

  async confirmRecurring(
    companyId: string,
    rows: OperationImportRecurringConfirmRow[],
    importDefaults: ImportOperationalDefaults,
    serviceById: Map<string, Service>,
  ): Promise<OperationImportConfirmResult> {
    try {
      assertRecurringMultiShiftConfirmGroupsConsistent(rows);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === IMPORT_RECURRING_MULTI_SHIFT_GROUP_INCONSISTENT_MESSAGE
      ) {
        throw new AppError(400, "OPERATION_IMPORT_INVALID", error.message);
      }
      throw error;
    }

    const collapsedRows = collapseRecurringMultiShiftConfirmRows(rows);
    const seenKeys = new Set<string>();

    for (const row of collapsedRows) {
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

      if (row.validUntil && row.validUntil < row.validFrom) {
        throw new AppError(
          400,
          "INVALID_OPERATION_DATE_RANGE",
          "La fecha de finalización no puede ser anterior a la fecha de inicio",
        );
      }

      if (isMultiShiftCollapsedImportRow(row)) {
        if (row.scheduleSource !== "COMPANY" || row.shifts.length < 1) {
          throw new AppError(
            400,
            "OPERATION_IMPORT_INVALID",
            "La importación contiene operaciones multi-turno inválidas. Revisá el archivo y volvé a intentar.",
          );
        }

        const templateSortOrderById = new Map<string, number>();
        const shiftCodes = new Set<string>();
        for (const shift of row.shifts) {
          const normalizedCode = normalizeRecurringImportShiftCode(shift.code, shift.name);
          if (shiftCodes.has(normalizedCode)) {
            throw new AppError(
              400,
              "OPERATION_IMPORT_INVALID",
              IMPORT_RECURRING_MULTI_SHIFT_SHIFT_CODE_DUPLICATE_MESSAGE,
            );
          }
          shiftCodes.add(normalizedCode);

          if (shift.templateId) {
            const template = await companyShiftTemplateRepository.findById(companyId, shift.templateId);
            if (!template) {
              throw new AppError(
                400,
                "OPERATION_IMPORT_INVALID",
                IMPORT_RECURRING_MULTI_SHIFT_TEMPLATE_NOT_FOUND_MESSAGE,
              );
            }
            if (!template.isActive) {
              throw new AppError(
                400,
                "OPERATION_IMPORT_INVALID",
                IMPORT_RECURRING_MULTI_SHIFT_TEMPLATE_INACTIVE_MESSAGE,
              );
            }
            templateSortOrderById.set(shift.templateId, template.sortOrder);
          }
        }

        row.shifts = orderRecurringMultiShiftImportSeeds(row.shifts, templateSortOrderById);
      } else if ((row.scheduleMode ?? "SINGLE") === "MULTI_SHIFT") {
        throw new AppError(
          400,
          "OPERATION_IMPORT_INVALID",
          "La importación contiene operaciones multi-turno inválidas. Revisá el archivo y volvé a intentar.",
        );
      }

      const duplicateKey = buildRecurringDuplicateKey(row.serviceId, row.validFrom);
      if (seenKeys.has(duplicateKey)) {
        throw new AppError(
          400,
          "OPERATION_IMPORT_INVALID",
          "La importación contiene filas duplicadas para el mismo servicio y vigencia_desde",
        );
      }
      seenKeys.add(duplicateKey);
    }

    const existingKeys = await operationRepository.findExistingActiveRecurringKeys(
      companyId,
      collapsedRows.map((row) => ({
        serviceId: row.serviceId,
        validFrom: row.validFrom,
      })),
    );
    if (existingKeys.size > 0) {
      throw new AppError(409, "OPERATION_DUPLICATE", IMPORT_RECURRING_DUPLICATE_MESSAGE);
    }

    for (const row of collapsedRows) {
      await operationService.assertRecurringCreateInput(companyId, toRecurringCreateInput(row));
    }

    const batchRows = collapsedRows.map((row) => ({
      input: toRecurringCreateInput(row),
      tolerances: resolveImportTolerances(row, importDefaults),
    }));

    const batchResult = await operationService.createRecurringImportBatch(companyId, batchRows);
    return {
      data: batchResult.operations,
      count: batchResult.operations.length,
      workdaySyncError: batchResult.workdaySyncError,
    };
  },
};
