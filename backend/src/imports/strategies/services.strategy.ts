import { COMPANY_MODULE_KEYS } from "../../constants/company-modules";
import { AppError } from "../../errors/app-error";
import { serviceRepository } from "../../repositories/service.repository";
import { createServiceSchema } from "../../schemas/service.schema";
import { auditService } from "../../services/audit.service";
import { companyLocationTypesService } from "../../services/company-location-types.service";
import { serviceService } from "../../services/service.service";
import { logAuditSafe } from "../../utils/audit-post-commit";
import { isOperationalLocationNameDuplicateKeyError } from "../../utils/service-name-duplicate-errors";
import {
  markInFileDuplicates,
  parseAndMapColumns,
  rowError,
  summarizePreviewRows,
} from "../column-import-helpers";
import { DEFAULT_IMPORT_BATCH_SIZE, DEFAULT_IMPORT_MAX_ROWS } from "../constants";
import { buildCsvTemplate } from "../parse-import-file";
import type { ImportStrategy } from "../strategy";
import type {
  ImportColumnDefinition,
  ImportExecuteResult,
  ImportExecuteRow,
  ImportPreviewResult,
  ImportPreviewRow,
  ImportTemplate,
} from "../types";

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

type ServiceDraft = {
  rowNumber: number;
  values: Record<string, string>;
  uniqueKey: string | null;
  input: {
    name: string;
    address: string | null;
    neighborhood: string | null;
    locality: string | null;
    serviceFormat: string | null;
    latitude: number;
    longitude: number;
    allowedRadiusMeters: number;
    googlePlaceId: string | null;
  } | null;
  errors: ReturnType<typeof rowError>[];
};

const buildServiceDrafts = async (
  companyId: string,
  buffer: Buffer,
  fileName: string,
): Promise<{
  fileType: "csv" | "xlsx";
  fileErrors: string[];
  drafts: ServiceDraft[];
}> => {
  const mapped = parseAndMapColumns(buffer, fileName, SERVICE_IMPORT_COLUMNS, {
    maxRows: DEFAULT_IMPORT_MAX_ROWS,
  });

  if (mapped.fileErrors.length > 0 && mapped.dataRows.length === 0) {
    return { fileType: mapped.fileType, fileErrors: mapped.fileErrors, drafts: [] };
  }

  const locationTypes = await companyLocationTypesService.listLocationTypes(companyId, false);
  const names = mapped.dataRows.map((row) => row.values.name?.trim() ?? "").filter(Boolean);
  const existingNames = await serviceRepository.findExistingNames(companyId, names);

  const drafts: ServiceDraft[] = mapped.dataRows.map((row) => {
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

    let input: ServiceDraft["input"] = null;
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
        input = {
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
      uniqueKey,
      input,
      errors,
    };
  });

  const duplicateErrors = markInFileDuplicates(
    drafts,
    "name",
    "SERVICE_DUPLICATE_IN_FILE",
    "Nombre duplicado dentro del archivo",
  );
  for (const draft of drafts) {
    const extras = duplicateErrors.get(draft.rowNumber);
    if (extras) {
      draft.errors.push(...extras);
      draft.input = null;
    }
  }

  return {
    fileType: mapped.fileType,
    fileErrors: mapped.fileErrors,
    drafts,
  };
};

const toPreviewRows = (drafts: ServiceDraft[]): ImportPreviewRow[] =>
  drafts.map((draft) => ({
    rowNumber: draft.rowNumber,
    status: draft.errors.length === 0 ? "valid" : "invalid",
    values: draft.values,
    errors: draft.errors,
  }));

export const servicesImportStrategy: ImportStrategy = {
  entityType: "services",
  permission: "services:manage",
  moduleKeys: [COMPANY_MODULE_KEYS.OPERATIONS],
  requireAllRowsValid: false,
  maxRows: DEFAULT_IMPORT_MAX_ROWS,

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

  async preview(companyId, buffer, fileName): Promise<ImportPreviewResult> {
    const { fileType, fileErrors, drafts } = await buildServiceDrafts(companyId, buffer, fileName);
    const rows = toPreviewRows(drafts);
    return {
      entityType: "services",
      fileType,
      format: null,
      summary: summarizePreviewRows(rows, false),
      rows,
      fileErrors,
      displayColumns: SERVICE_IMPORT_COLUMNS.map((column) => ({
        key: column.key,
        header: column.header,
      })),
    };
  },

  async execute(companyId, buffer, fileName, userId): Promise<ImportExecuteResult> {
    const started = Date.now();
    const { fileErrors, drafts } = await buildServiceDrafts(companyId, buffer, fileName);
    if (fileErrors.length > 0 && drafts.length === 0) {
      return {
        entityType: "services",
        summary: {
          totalRows: 0,
          processedRows: 0,
          created: 0,
          updated: 0,
          rejected: 0,
          durationMs: Date.now() - started,
        },
        rows: [],
        fileErrors,
      };
    }

    const resultRows: ImportExecuteRow[] = [];
    let created = 0;
    let rejected = 0;

    const validDrafts = drafts.filter((draft) => draft.errors.length === 0 && draft.input);
    const invalidDrafts = drafts.filter((draft) => draft.errors.length > 0 || !draft.input);

    for (const draft of invalidDrafts) {
      rejected += 1;
      resultRows.push({
        rowNumber: draft.rowNumber,
        status: "rejected",
        values: draft.values,
        errors: draft.errors,
      });
    }

    for (let offset = 0; offset < validDrafts.length; offset += DEFAULT_IMPORT_BATCH_SIZE) {
      const batch = validDrafts.slice(offset, offset + DEFAULT_IMPORT_BATCH_SIZE);
      for (const draft of batch) {
        try {
          await serviceService.create(companyId, draft.input!);
          created += 1;
          resultRows.push({
            rowNumber: draft.rowNumber,
            status: "created",
            values: draft.values,
            errors: [],
          });
        } catch (error) {
          rejected += 1;
          const message =
            error instanceof AppError
              ? error.message
              : isOperationalLocationNameDuplicateKeyError(error)
                ? "Ya existe un servicio con este nombre en la compañía."
                : "No se pudo crear el servicio.";
          const code =
            error instanceof AppError
              ? error.code
              : isOperationalLocationNameDuplicateKeyError(error)
                ? "SERVICE_NAME_ALREADY_EXISTS"
                : "SERVICE_CREATE_FAILED";
          resultRows.push({
            rowNumber: draft.rowNumber,
            status: "rejected",
            values: draft.values,
            errors: [rowError(code, message, "name", draft.values.name)],
          });
        }
      }
    }

    resultRows.sort((a, b) => a.rowNumber - b.rowNumber);

    await logAuditSafe("import.services.execute", () =>
      auditService.log(companyId, {
        entityType: "import",
        entityId: companyId,
        action: "import.execute",
        newData: {
          entityType: "services",
          fileName,
          totalRows: drafts.length,
          created,
          updated: 0,
          rejected,
        },
        reason: "generic_import",
        userId: userId ?? null,
      }),
    );

    return {
      entityType: "services",
      summary: {
        totalRows: drafts.length,
        processedRows: created + rejected,
        created,
        updated: 0,
        rejected,
        durationMs: Date.now() - started,
      },
      rows: resultRows,
      fileErrors,
    };
  },
};
