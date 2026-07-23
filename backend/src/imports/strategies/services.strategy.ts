import { COMPANY_MODULE_KEYS } from "../../constants/company-modules";
import { AppError } from "../../errors/app-error";
import { serviceRepository } from "../../repositories/service.repository";
import { createServiceSchema, type CreateServiceInput } from "../../schemas/service.schema";
import { auditService } from "../../services/audit.service";
import { companyLocationTypesService } from "../../services/company-location-types.service";
import { logAuditSafe } from "../../utils/audit-post-commit";
import {
  markInFileDuplicates,
  parseAndMapColumns,
  rowError,
  summarizePreviewRows,
} from "../column-import-helpers";
import { classifyServiceUniqueViolation } from "../constraint-classifiers";
import { DEFAULT_IMPORT_MAX_ROWS, IMPORT_PERSIST_CHUNK_SIZE } from "../constants";
import {
  runCreateOnlyImport,
  type CreateOnlyPersistBatchResult,
} from "../create-only-executor";
import { buildCsvTemplate } from "../parse-import-file";
import {
  hashImportFile,
  IMPORT_STRATEGY_VERSION,
  preparedToPreviewResult,
  type PreparedImport,
  type PreparedImportRow,
} from "../prepared-import";
import type { ImportPersistContext, ImportStrategy } from "../strategy";
import type { ImportColumnDefinition, ImportTemplate } from "../types";

export const SERVICE_IMPORT_COLUMNS: ImportColumnDefinition[] = [
  { key: "name", header: "Nombre", required: true, aliases: ["servicio", "sucursal", "punto"] },
  { key: "address", header: "Dirección", required: false, aliases: ["direccion", "address"] },
  { key: "neighborhood", header: "Barrio", required: false, aliases: ["neighborhood"] },
  { key: "locality", header: "Localidad", required: false, aliases: ["locality", "ciudad"] },
  {
    key: "serviceFormat",
    header: "Formato",
    required: false,
    aliases: ["formato", "tipo", "location_type", "service_format"],
  },
  { key: "latitude", header: "Latitud", required: true, aliases: ["lat", "latitude"] },
  { key: "longitude", header: "Longitud", required: true, aliases: ["lng", "lon", "longitude"] },
  {
    key: "allowedRadiusMeters",
    header: "Radio (metros)",
    required: false,
    aliases: ["radio", "radius", "allowed_radius_meters"],
  },
  {
    key: "googlePlaceId",
    header: "Google Place ID",
    required: false,
    aliases: ["google_place_id", "place_id"],
  },
];

const resolveFormatCode = (
  raw: string,
  types: Array<{ code: string; name: string; isActive: boolean }>,
): { code: string | null; error: string | null } => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { code: null, error: null };
  }

  const needle = trimmed.toLowerCase();
  const matches = types.filter(
    (type) =>
      type.isActive &&
      (type.code.toLowerCase() === needle || type.name.toLowerCase() === needle),
  );

  if (matches.length === 0) {
    return {
      code: null,
      error: `El formato "${trimmed}" no existe o no está activo en la compañía.`,
    };
  }

  if (matches.length > 1) {
    return {
      code: null,
      error: `El formato "${trimmed}" es ambiguo. Usá el código del tipo de ubicación.`,
    };
  }

  return { code: matches[0]!.code, error: null };
};

const parseNumber = (raw: string, field: string): { value: number | null; error: string | null } => {
  if (!raw.trim()) {
    return { value: null, error: `${field} es obligatorio.` };
  }
  const normalized = raw.trim().replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return { value: null, error: `${field} debe ser numérico.` };
  }
  return { value, error: null };
};

const buildServicePrepared = async (
  companyId: string,
  buffer: Buffer,
  fileName: string,
  maxRows: number,
): Promise<PreparedImport> => {
  const mapped = parseAndMapColumns(buffer, fileName, SERVICE_IMPORT_COLUMNS, { maxRows });

  if (mapped.fileErrors.length > 0 && mapped.dataRows.length === 0) {
    return {
      entityType: "services",
      strategyVersion: IMPORT_STRATEGY_VERSION,
      fileName,
      fileHash: hashImportFile(buffer),
      fileType: mapped.fileType,
      format: null,
      requireAllRowsValid: false,
      displayColumns: SERVICE_IMPORT_COLUMNS.map((column) => ({
        key: column.key,
        header: column.header,
      })),
      fileErrors: mapped.fileErrors,
      rows: [],
      summary: summarizePreviewRows([], false),
    };
  }

  const locationTypes = await companyLocationTypesService.listLocationTypes(companyId, false);
  const names = mapped.dataRows.map((row) => row.values.name?.trim() ?? "").filter(Boolean);
  const existingNames = await serviceRepository.findExistingNames(companyId, names);

  const rows: PreparedImportRow[] = mapped.dataRows.map((row) => {
    const values = row.values;
    const errors = [];
    const name = values.name?.trim() ?? "";
    if (!name) {
      errors.push(rowError("SERVICE_NAME_REQUIRED", "El nombre es obligatorio.", "name", values.name));
    }

    const lat = parseNumber(values.latitude ?? "", "Latitud");
    if (lat.error) {
      errors.push(rowError("SERVICE_LATITUDE_INVALID", lat.error, "latitude", values.latitude));
    }
    const lng = parseNumber(values.longitude ?? "", "Longitud");
    if (lng.error) {
      errors.push(rowError("SERVICE_LONGITUDE_INVALID", lng.error, "longitude", values.longitude));
    }

    let radius = 150;
    if (values.allowedRadiusMeters?.trim()) {
      const parsedRadius = parseNumber(values.allowedRadiusMeters, "Radio (metros)");
      if (parsedRadius.error || parsedRadius.value === null || parsedRadius.value <= 0) {
        errors.push(
          rowError(
            "SERVICE_RADIUS_INVALID",
            "Radio (metros) debe ser un entero positivo.",
            "allowedRadiusMeters",
            values.allowedRadiusMeters,
          ),
        );
      } else {
        radius = Math.trunc(parsedRadius.value);
      }
    }

    const format = resolveFormatCode(values.serviceFormat ?? "", locationTypes);
    if (format.error) {
      errors.push(
        rowError("SERVICE_FORMAT_INVALID", format.error, "serviceFormat", values.serviceFormat),
      );
    }

    const uniqueKey = name ? name.toLowerCase() : null;
    if (uniqueKey && existingNames.has(uniqueKey)) {
      errors.push(
        rowError(
          "SERVICE_NAME_ALREADY_EXISTS",
          "Ya existe un servicio con este nombre en la compañía.",
          "name",
          name,
        ),
      );
    }

    let payload: CreateServiceInput | null = null;
    if (errors.length === 0 && lat.value !== null && lng.value !== null) {
      const candidate = {
        name,
        address: values.address?.trim() ? values.address.trim() : null,
        neighborhood: values.neighborhood?.trim() ? values.neighborhood.trim() : null,
        locality: values.locality?.trim() ? values.locality.trim() : null,
        serviceFormat: format.code,
        latitude: lat.value,
        longitude: lng.value,
        allowedRadiusMeters: radius,
        googlePlaceId: values.googlePlaceId?.trim() ? values.googlePlaceId.trim() : null,
      };
      const parsed = createServiceSchema.safeParse(candidate);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          errors.push(
            rowError(
              "SERVICE_VALIDATION",
              issue.message,
              String(issue.path[0] ?? "name"),
              values[String(issue.path[0] ?? "name")] ?? null,
            ),
          );
        }
      } else {
        payload = {
          name: parsed.data.name,
          address: parsed.data.address ?? null,
          neighborhood: parsed.data.neighborhood ?? null,
          locality: parsed.data.locality ?? null,
          serviceFormat: parsed.data.serviceFormat ?? null,
          latitude: parsed.data.latitude,
          longitude: parsed.data.longitude,
          allowedRadiusMeters: parsed.data.allowedRadiusMeters,
          googlePlaceId: parsed.data.googlePlaceId ?? null,
        };
      }
    }

    return {
      rowNumber: row.rowNumber,
      values,
      errors,
      payload,
    };
  });

  const duplicateErrors = markInFileDuplicates(
    rows.map((row) => ({
      rowNumber: row.rowNumber,
      values: row.values,
      uniqueKey: row.values.name?.trim() ? row.values.name.trim().toLowerCase() : null,
      errors: row.errors,
    })),
    "name",
    "SERVICE_DUPLICATE_IN_FILE",
    "Nombre duplicado dentro del archivo",
  );
  for (const row of rows) {
    const extras = duplicateErrors.get(row.rowNumber);
    if (extras) {
      row.errors.push(...extras);
      row.payload = null;
    }
  }

  const previewRows = rows.map((row) => ({
    rowNumber: row.rowNumber,
    status: (row.errors.length === 0 ? "valid" : "invalid") as "valid" | "invalid",
    values: row.values,
    errors: row.errors,
  }));

  return {
    entityType: "services",
    strategyVersion: IMPORT_STRATEGY_VERSION,
    fileName,
    fileHash: hashImportFile(buffer),
    fileType: mapped.fileType,
    format: null,
    requireAllRowsValid: false,
    displayColumns: SERVICE_IMPORT_COLUMNS.map((column) => ({
      key: column.key,
      header: column.header,
    })),
    fileErrors: mapped.fileErrors,
    rows,
    summary: summarizePreviewRows(previewRows, false),
  };
};

export const servicesImportStrategy: ImportStrategy = {
  entityType: "services",
  permission: "services:manage",
  moduleKeys: [COMPANY_MODULE_KEYS.OPERATIONS],
  requireAllRowsValid: false,
  maxRows: DEFAULT_IMPORT_MAX_ROWS,
  strategyVersion: IMPORT_STRATEGY_VERSION,

  buildTemplate(): ImportTemplate {
    return {
      fileName: "plantilla-importacion-servicios.csv",
      contentType: "text/csv; charset=utf-8",
      body: buildCsvTemplate(
        SERVICE_IMPORT_COLUMNS.map((column) => column.header),
        [
          [
            "Sucursal Centro",
            "Av. Ejemplo 123",
            "Centro",
            "CABA",
            "",
            "-34.6037",
            "-58.3816",
            "150",
            "",
          ],
        ],
      ),
    };
  },

  prepare(companyId, buffer, fileName) {
    return buildServicePrepared(companyId, buffer, fileName, this.maxRows);
  },

  async preview(companyId, buffer, fileName) {
    const prepared = await this.prepare(companyId, buffer, fileName);
    return preparedToPreviewResult(prepared);
  },

  async persist(companyId, prepared, context: ImportPersistContext = {}) {
    return runCreateOnlyImport(companyId, prepared, context, {
      entityType: "services",
      defaultCreateErrorCode: "SERVICE_CREATE_FAILED",
      defaultCreateErrorMessage: "No se pudo crear el servicio.",
      defaultErrorField: "name",
      chunkSize: IMPORT_PERSIST_CHUNK_SIZE,
      classifyError: (error, row) => {
        if (error instanceof AppError) {
          return rowError(error.code, error.message, "name", row.values.name);
        }
        const classified = classifyServiceUniqueViolation(error);
        if (classified) {
          return rowError(classified.code, classified.message, classified.field, row.values.name);
        }
        return rowError(
          "SERVICE_CREATE_FAILED",
          "No se pudo crear el servicio.",
          "name",
          row.values.name,
        );
      },
      revalidateRows: async (cid, rows) => {
        const names = rows
          .map((row) => (row.payload as CreateServiceInput | null)?.name ?? "")
          .filter(Boolean);
        const existing = await serviceRepository.findExistingNames(cid, names);
        const map = new Map<number, ReturnType<typeof rowError>[]>();
        for (const row of rows) {
          const name = (row.payload as CreateServiceInput | null)?.name ?? "";
          if (name && existing.has(name.toLowerCase())) {
            map.set(row.rowNumber, [
              rowError(
                "SERVICE_NAME_ALREADY_EXISTS",
                "Ya existe un servicio con este nombre en la compañía.",
                "name",
                name,
              ),
            ]);
          }
        }
        return map;
      },
      persistBatch: async (cid, items): Promise<CreateOnlyPersistBatchResult> => {
        const payloads = items.map((item) => item.payload as CreateServiceInput);
        try {
          await serviceRepository.createMany(cid, payloads);
          return {
            created: items.map((item) => ({ rowNumber: item.row.rowNumber })),
            rejected: [],
          };
        } catch (error) {
          const classified = classifyServiceUniqueViolation(error);
          if (classified || error instanceof AppError) {
            // Fall back to per-row so partial success is preserved.
            const created: Array<{ rowNumber: number }> = [];
            const rejected: CreateOnlyPersistBatchResult["rejected"] = [];
            for (const item of items) {
              try {
                await serviceRepository.createMany(cid, [item.payload as CreateServiceInput]);
                created.push({ rowNumber: item.row.rowNumber });
              } catch (rowErrorValue) {
                const rowClassified =
                  rowErrorValue instanceof AppError
                    ? rowError(
                        rowErrorValue.code,
                        rowErrorValue.message,
                        "name",
                        item.row.values.name,
                      )
                    : (() => {
                        const hit = classifyServiceUniqueViolation(rowErrorValue);
                        return hit
                          ? rowError(hit.code, hit.message, hit.field, item.row.values.name)
                          : rowError(
                              "SERVICE_CREATE_FAILED",
                              "No se pudo crear el servicio.",
                              "name",
                              item.row.values.name,
                            );
                      })();
                rejected.push({ rowNumber: item.row.rowNumber, error: rowClassified });
              }
            }
            return { created, rejected };
          }
          throw error;
        }
      },
      audit: async ({ companyId: cid, userId, importJobId, prepared: plan, created, rejected, durationMs }) => {
        await logAuditSafe("import.services.execute", () =>
          auditService.log(cid, {
            entityType: "import_job",
            entityId: importJobId ?? cid,
            action: "import.execute",
            newData: {
              entityType: "services",
              importJobId: importJobId ?? null,
              fileName: plan.fileName,
              strategyVersion: plan.strategyVersion,
              totalRows: plan.rows.length,
              created,
              updated: 0,
              rejected,
              durationMs,
            },
            reason: "generic_import",
            userId: userId ?? null,
          }),
        );
      },
    });
  },

  async execute(companyId, buffer, fileName, userId) {
    const prepared = await this.prepare(companyId, buffer, fileName);
    return this.persist(companyId, prepared, { userId, revalidateConcurrency: true });
  },
};
