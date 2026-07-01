import sql from "mssql";
import {
  DEFAULT_EARLY_TOLERANCE_MINUTES,
  DEFAULT_LATE_TOLERANCE_MINUTES,
  IMPORT_EMPTY_LOCATION_VALUE_MESSAGE,
  IMPORT_LOCATION_AMBIGUOUS_MESSAGE,
  IMPORT_LOCATION_NOT_FOUND_MESSAGE,
  UNSUPPORTED_FILE_TYPE_MESSAGE,
} from "../constants/inventory-import";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { inventoryRepository } from "../repositories/inventory.repository";
import { storeRepository } from "../repositories/store.repository";
import type { CreateInventoryInput } from "../schemas/inventory.schema";
import type { Store } from "../types/domain";
import type {
  InventoryImportConfirmRow,
  InventoryImportFormat,
  InventoryImportPreviewResult,
  InventoryImportPreviewRow,
} from "../types/inventory-import";
import { mapImportHeaders } from "../utils/inventory-import-headers";
import {
  buildClientInventorySchedule,
  parseInventoryImportDateTime,
} from "../utils/inventory-import-datetime";
import { isInventoryStartInPast } from "../utils/inventory-lifecycle";
import {
  detectSpreadsheetFileType,
  isLikelyBinaryUpload,
  parseSpreadsheetBuffer,
  type SpreadsheetFileType,
} from "../utils/spreadsheet-parse";

const normalizeStoreKey = (value: string): string => {
  const trimmed = value.trim();
  if (/^\d+(\.0+)?$/.test(trimmed)) {
    return String(Math.trunc(Number(trimmed)));
  }

  return trimmed.toLowerCase();
};

const buildStoreLookup = (stores: Store[]): Map<string, Store[]> => {
  const lookup = new Map<string, Store[]>();

  for (const store of stores) {
    const key = normalizeStoreKey(store.name);
    const current = lookup.get(key) ?? [];
    current.push(store);
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

const buildInventoryDuplicateKey = (storeId: string, scheduledStart: string): string =>
  `${storeId}|${new Date(scheduledStart).toISOString()}`;

const markExistingInventoryConflicts = (
  rows: InventoryImportPreviewRow[],
  existingKeys: Set<string>,
): void => {
  for (const row of rows) {
    if (!row.storeId || !row.scheduledStart || row.errors.length > 0) {
      continue;
    }

    if (existingKeys.has(buildInventoryDuplicateKey(row.storeId, row.scheduledStart))) {
      row.errors.push("Ya existe una operación programada para esa ubicación y fecha de inicio");
      row.status = "invalid";
      row.earlyToleranceMinutes = null;
      row.lateToleranceMinutes = null;
    }
  }
};

const resolveStore = (
  lookupKey: string,
  storeLookup: Map<string, Store[]>,
  emptyError: string,
  notFoundError: string,
  ambiguousError: string,
): { storeId: string | null; storeName: string | null; errors: string[] } => {
  if (!lookupKey) {
    return { storeId: null, storeName: null, errors: [emptyError] };
  }

  const matches = storeLookup.get(normalizeStoreKey(lookupKey)) ?? [];
  if (matches.length === 0) {
    return { storeId: null, storeName: null, errors: [notFoundError] };
  }

  if (matches.length > 1) {
    return { storeId: null, storeName: null, errors: [ambiguousError] };
  }

  return { storeId: matches[0].id, storeName: matches[0].name, errors: [] };
};

const validateClientRow = (
  rowNumber: number,
  row: string[],
  headers: string[],
  storeLookup: Map<string, Store[]>,
  seenKeys: Set<string>,
): InventoryImportPreviewRow => {
  const locationValue = getCell(row, headers, "location").trim();
  const rawFecha = getCell(row, headers, "fecha").trim();
  const toleranciaTempranaRaw = getCell(row, headers, "tolerancia_temprana");
  const toleranciaTardiaRaw = getCell(row, headers, "tolerancia_tardia");
  const notas = getCell(row, headers, "notas").trim();

  const errors: string[] = [];

  const storeResolution = resolveStore(
    locationValue,
    storeLookup,
    IMPORT_EMPTY_LOCATION_VALUE_MESSAGE,
    IMPORT_LOCATION_NOT_FOUND_MESSAGE,
    IMPORT_LOCATION_AMBIGUOUS_MESSAGE,
  );
  errors.push(...storeResolution.errors);

  if (!rawFecha) {
    errors.push("La columna Fecha es obligatoria");
  }

  const earlyTolerance = parseTolerance(
    toleranciaTempranaRaw,
    "Tolerancia temprana",
    DEFAULT_EARLY_TOLERANCE_MINUTES,
  );
  const lateTolerance = parseTolerance(
    toleranciaTardiaRaw,
    "Tolerancia tardía",
    DEFAULT_LATE_TOLERANCE_MINUTES,
  );
  errors.push(...earlyTolerance.errors, ...lateTolerance.errors);

  let scheduledStart: string | null = null;
  let scheduledEnd: string | null = null;
  let parsedInventoryDate: string | null = null;
  let scheduledStartDisplay = "";
  let scheduledEndDisplay = "";

  if (rawFecha) {
    const schedule = buildClientInventorySchedule(rawFecha);
    if ("error" in schedule) {
      errors.push(schedule.error);
    } else {
      scheduledStart = schedule.scheduledStart;
      scheduledEnd = schedule.scheduledEnd;
      parsedInventoryDate = schedule.parsedInventoryDate;
      scheduledStartDisplay = schedule.scheduledStartDisplay;
      scheduledEndDisplay = schedule.scheduledEndDisplay;

      if (isInventoryStartInPast(scheduledStart)) {
        errors.push("La fecha de inicio no puede estar en el pasado");
      }
    }
  }

  if (storeResolution.storeId && scheduledStart) {
    const duplicateKey = buildInventoryDuplicateKey(storeResolution.storeId, scheduledStart);
    if (seenKeys.has(duplicateKey)) {
      errors.push("Fila duplicada en el archivo para la misma ubicación y fecha de inicio");
    } else {
      seenKeys.add(duplicateKey);
    }
  }

  const isValid =
    errors.length === 0 && storeResolution.storeId && scheduledStart && scheduledEnd;

  return {
    rowNumber,
    format: "client",
    punto: locationValue,
    tienda: locationValue,
    storeId: storeResolution.storeId,
    storeName: storeResolution.storeName,
    rawFecha,
    parsedInventoryDate,
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
  storeLookup: Map<string, Store[]>,
  seenKeys: Set<string>,
): InventoryImportPreviewRow => {
  const locationValue = getCell(row, headers, "location").trim();
  const fechaInicio = getCell(row, headers, "fecha_inicio").trim();
  const fechaFin = getCell(row, headers, "fecha_fin").trim();
  const toleranciaTempranaRaw = getCell(row, headers, "tolerancia_temprana");
  const toleranciaTardiaRaw = getCell(row, headers, "tolerancia_tardia");
  const notas = getCell(row, headers, "notas").trim();

  const errors: string[] = [];

  const storeResolution = resolveStore(
    locationValue,
    storeLookup,
    IMPORT_EMPTY_LOCATION_VALUE_MESSAGE,
    IMPORT_LOCATION_NOT_FOUND_MESSAGE,
    IMPORT_LOCATION_AMBIGUOUS_MESSAGE,
  );
  errors.push(...storeResolution.errors);

  if (!fechaInicio) {
    errors.push("La fecha de inicio es obligatoria");
  }
  if (!fechaFin) {
    errors.push("La fecha de fin es obligatoria");
  }

  const earlyTolerance = parseTolerance(
    toleranciaTempranaRaw,
    "Tolerancia temprana",
    DEFAULT_EARLY_TOLERANCE_MINUTES,
  );
  const lateTolerance = parseTolerance(
    toleranciaTardiaRaw,
    "Tolerancia tardía",
    DEFAULT_LATE_TOLERANCE_MINUTES,
  );
  errors.push(...earlyTolerance.errors, ...lateTolerance.errors);

  let scheduledStart: string | null = null;
  let scheduledEnd: string | null = null;

  if (fechaInicio) {
    const parsedStart = parseInventoryImportDateTime(fechaInicio);
    if ("error" in parsedStart) {
      errors.push(`Fecha de inicio: ${parsedStart.error}`);
    } else {
      scheduledStart = parsedStart.iso;
      if (isInventoryStartInPast(parsedStart.iso)) {
        errors.push("La fecha de inicio no puede estar en el pasado");
      }
    }
  }

  if (fechaFin) {
    const parsedEnd = parseInventoryImportDateTime(fechaFin);
    if ("error" in parsedEnd) {
      errors.push(`Fecha de fin: ${parsedEnd.error}`);
    } else {
      scheduledEnd = parsedEnd.iso;
    }
  }

  if (scheduledStart && scheduledEnd && new Date(scheduledEnd) <= new Date(scheduledStart)) {
    errors.push("La fecha de fin debe ser posterior a la fecha de inicio");
  }

  if (storeResolution.storeId && scheduledStart) {
    const duplicateKey = buildInventoryDuplicateKey(storeResolution.storeId, scheduledStart);
    if (seenKeys.has(duplicateKey)) {
      errors.push("Fila duplicada en el archivo para la misma ubicación y fecha de inicio");
    } else {
      seenKeys.add(duplicateKey);
    }
  }

  const isValid =
    errors.length === 0 && storeResolution.storeId && scheduledStart && scheduledEnd;

  return {
    rowNumber,
    format: "legacy",
    punto: "",
    tienda: locationValue,
    storeId: storeResolution.storeId,
    storeName: storeResolution.storeName,
    rawFecha: fechaInicio,
    parsedInventoryDate: null,
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

const toCreateInput = (row: InventoryImportConfirmRow): CreateInventoryInput => ({
  storeId: row.storeId,
  scheduledStart: row.scheduledStart,
  scheduledEnd: row.scheduledEnd,
  earlyToleranceMinutes: row.earlyToleranceMinutes,
  lateToleranceMinutes: row.lateToleranceMinutes,
  notes: row.notes,
});

const emptyPreview = (
  fileErrors: string[],
  fileType: SpreadsheetFileType | null = null,
): InventoryImportPreviewResult => ({
  format: null,
  fileType,
  fileErrors,
  summary: { totalRows: 0, validRows: 0, invalidRows: 0, canConfirm: false },
  rows: [],
});

export const inventoryImportService = {
  async previewFile(
    companyId: string,
    buffer: Buffer,
    fileName: string,
  ): Promise<InventoryImportPreviewResult> {
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

    const parsed = parseSpreadsheetBuffer(buffer, fileType);
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

    const stores = await storeRepository.listAllActive(companyId);
    const storeLookup = buildStoreLookup(stores);
    const seenKeys = new Set<string>();

    const rows: InventoryImportPreviewRow[] = [];
    for (let index = 0; index < parsed.rows.length; index += 1) {
      const row = parsed.rows[index];
      const isEmptyRow = row.every((cell) => !cell.trim());
      if (isEmptyRow) {
        continue;
      }

      const previewRow =
        format === "client"
          ? validateClientRow(index + 2, row, mapped, storeLookup, seenKeys)
          : validateLegacyRow(index + 2, row, mapped, storeLookup, seenKeys);
      rows.push(previewRow);
    }

    const pairsToCheck = rows
      .filter((row) => row.storeId && row.scheduledStart && row.errors.length === 0)
      .map((row) => ({
        storeId: row.storeId as string,
        scheduledStart: row.scheduledStart as string,
      }));
    const existingKeys = await inventoryRepository.findExistingActiveKeys(companyId, pairsToCheck);
    markExistingInventoryConflicts(rows, existingKeys);

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

  async preview(companyId: string, csvContent: string): Promise<InventoryImportPreviewResult> {
    return this.previewFile(companyId, Buffer.from(csvContent, "utf8"), "upload.csv");
  },

  async confirm(companyId: string, rows: InventoryImportConfirmRow[]) {
    const stores = await storeRepository.listAllActive(companyId);
    const storeById = new Map(stores.map((store) => [store.id, store]));
    const seenKeys = new Set<string>();

    for (const row of rows) {
      const store = storeById.get(row.storeId);
      if (!store) {
        throw new AppError(
          400,
          "INVENTORY_IMPORT_INVALID",
          "La importación contiene filas inválidas. Revisá el archivo y volvé a intentar.",
        );
      }

      if (!store.active) {
        throw new AppError(409, "STORE_INACTIVE", "No se puede crear inventario para una tienda inactiva");
      }

      if (isInventoryStartInPast(row.scheduledStart)) {
        throw new AppError(
          400,
          "INVENTORY_START_IN_PAST",
          "No se puede programar un inventario con fecha de inicio en el pasado",
        );
      }

      if (new Date(row.scheduledEnd) <= new Date(row.scheduledStart)) {
        throw new AppError(
          400,
          "INVALID_INVENTORY_DATE_RANGE",
          "scheduledEnd debe ser posterior a scheduledStart",
        );
      }

      const duplicateKey = buildInventoryDuplicateKey(row.storeId, row.scheduledStart);
      if (seenKeys.has(duplicateKey)) {
        throw new AppError(
          400,
          "INVENTORY_IMPORT_INVALID",
          "La importación contiene filas duplicadas para la misma tienda y fecha de inicio",
        );
      }
      seenKeys.add(duplicateKey);
    }

    const existingKeys = await inventoryRepository.findExistingActiveKeys(
      companyId,
      rows.map((row) => ({
        storeId: row.storeId,
        scheduledStart: row.scheduledStart,
      })),
    );
    if (existingKeys.size > 0) {
      throw new AppError(
        409,
        "INVENTORY_DUPLICATE",
        "Ya existe un inventario para esa tienda y fecha de inicio",
      );
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const created = await inventoryRepository.createManyInTransaction(
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
