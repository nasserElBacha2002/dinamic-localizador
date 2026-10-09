import { COMPANY_MODULE_KEYS } from "../../constants/company-modules";
import { AppError } from "../../errors/app-error";
import { clientRepository } from "../../repositories/client.repository";
import { createClientSchema, type CreateClientInput } from "../../schemas/client.schema";
import { auditService } from "../../services/audit.service";
import { logAuditSafe } from "../../utils/audit-post-commit";
import { normalizeClientName } from "../../utils/client-name.utils";
import {
  markInFileDuplicates,
  parseAndMapColumns,
  rowError,
  summarizePreviewRows,
} from "../column-import-helpers";
import { classifyClientUniqueViolation } from "../constraint-classifiers";
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

export const CLIENT_IMPORT_COLUMNS: ImportColumnDefinition[] = [
  { key: "name", header: "Nombre", required: true, aliases: ["cliente", "client", "client_name"] },
];

const buildClientPrepared = async (
  companyId: string,
  buffer: Buffer,
  fileName: string,
  maxRows: number,
): Promise<PreparedImport> => {
  const mapped = parseAndMapColumns(buffer, fileName, CLIENT_IMPORT_COLUMNS, { maxRows });

  if (mapped.fileErrors.length > 0 && mapped.dataRows.length === 0) {
    return {
      entityType: "clients",
      strategyVersion: IMPORT_STRATEGY_VERSION,
      fileName,
      fileHash: hashImportFile(buffer),
      fileType: mapped.fileType,
      format: null,
      requireAllRowsValid: false,
      displayColumns: CLIENT_IMPORT_COLUMNS.map((column) => ({
        key: column.key,
        header: column.header,
      })),
      fileErrors: mapped.fileErrors,
      rows: [],
      summary: summarizePreviewRows([], false),
    };
  }

  const normalizedNames = mapped.dataRows
    .map((row) => normalizeClientName(row.values.name ?? ""))
    .filter(Boolean);
  const existingNormalized = await clientRepository.findExistingNormalizedNames(
    companyId,
    normalizedNames,
  );

  const rows: PreparedImportRow[] = mapped.dataRows.map((row) => {
    const values = row.values;
    const errors = [];
    const name = values.name?.trim() ?? "";
    if (!name) {
      errors.push(rowError("CLIENT_NAME_REQUIRED", "El nombre es obligatorio.", "name", values.name));
    }

    const normalizedName = name ? normalizeClientName(name) : "";
    if (normalizedName && existingNormalized.has(normalizedName)) {
      errors.push(
        rowError(
          "CLIENT_NAME_ALREADY_EXISTS",
          "Ya existe un cliente con ese nombre",
          "name",
          name,
        ),
      );
    }

    let payload: CreateClientInput | null = null;
    if (errors.length === 0 && name) {
      const parsed = createClientSchema.safeParse({ name });
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          errors.push(
            rowError(
              "CLIENT_VALIDATION",
              issue.message,
              String(issue.path[0] ?? "name"),
              values[String(issue.path[0] ?? "name")] ?? null,
            ),
          );
        }
      } else {
        payload = { name: parsed.data.name };
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
      uniqueKey: row.values.name?.trim() ? normalizeClientName(row.values.name) : null,
      errors: row.errors,
    })),
    "name",
    "CLIENT_DUPLICATE_IN_FILE",
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
    entityType: "clients",
    strategyVersion: IMPORT_STRATEGY_VERSION,
    fileName,
    fileHash: hashImportFile(buffer),
    fileType: mapped.fileType,
    format: null,
    requireAllRowsValid: false,
    displayColumns: CLIENT_IMPORT_COLUMNS.map((column) => ({
      key: column.key,
      header: column.header,
    })),
    fileErrors: mapped.fileErrors,
    rows,
    summary: summarizePreviewRows(previewRows, false),
  };
};

export const clientsImportStrategy: ImportStrategy = {
  entityType: "clients",
  permission: "employees:manage",
  moduleKeys: [
    COMPANY_MODULE_KEYS.ATTENDANCE,
    COMPANY_MODULE_KEYS.OPERATIONS,
    COMPANY_MODULE_KEYS.ABSENCES,
  ],
  requireAllRowsValid: false,
  maxRows: DEFAULT_IMPORT_MAX_ROWS,
  strategyVersion: IMPORT_STRATEGY_VERSION,

  buildTemplate(): ImportTemplate {
    return {
      fileName: "plantilla-importacion-clientes.csv",
      contentType: "text/csv; charset=utf-8",
      body: buildCsvTemplate(CLIENT_IMPORT_COLUMNS.map((column) => column.header), [
        ["Cliente Ejemplo"],
      ]),
    };
  },

  prepare(companyId, buffer, fileName) {
    return buildClientPrepared(companyId, buffer, fileName, this.maxRows);
  },

  async preview(companyId, buffer, fileName) {
    const prepared = await this.prepare(companyId, buffer, fileName);
    return preparedToPreviewResult(prepared);
  },

  async persist(companyId, prepared, context: ImportPersistContext = {}) {
    return runCreateOnlyImport(companyId, prepared, context, {
      entityType: "clients",
      defaultCreateErrorCode: "CLIENT_CREATE_FAILED",
      defaultCreateErrorMessage: "No se pudo crear el cliente.",
      defaultErrorField: "name",
      chunkSize: IMPORT_PERSIST_CHUNK_SIZE,
      classifyError: (error, row) => {
        if (error instanceof AppError) {
          return rowError(error.code, error.message, "name", row.values.name);
        }
        const classified = classifyClientUniqueViolation(error);
        if (classified) {
          return rowError(classified.code, classified.message, classified.field, row.values.name);
        }
        return rowError(
          "CLIENT_CREATE_FAILED",
          "No se pudo crear el cliente.",
          "name",
          row.values.name,
        );
      },
      revalidateRows: async (cid, candidateRows) => {
        const names = candidateRows
          .map((row) => (row.payload as CreateClientInput | null)?.name ?? "")
          .filter(Boolean);
        const existing = await clientRepository.findExistingNormalizedNames(cid, names);
        const map = new Map<number, ReturnType<typeof rowError>[]>();
        for (const row of candidateRows) {
          const name = (row.payload as CreateClientInput | null)?.name ?? "";
          const normalized = name ? normalizeClientName(name) : "";
          if (normalized && existing.has(normalized)) {
            map.set(row.rowNumber, [
              rowError(
                "CLIENT_NAME_ALREADY_EXISTS",
                "Ya existe un cliente con ese nombre",
                "name",
                name,
              ),
            ]);
          }
        }
        return map;
      },
      persistBatch: async (cid, items): Promise<CreateOnlyPersistBatchResult> => {
        const userId = context.userId ?? null;
        const created: Array<{ rowNumber: number }> = [];
        const rejected: CreateOnlyPersistBatchResult["rejected"] = [];

        for (const item of items) {
          const payload = item.payload as CreateClientInput;
          const normalizedName = normalizeClientName(payload.name);
          try {
            await clientRepository.create(cid, {
              name: payload.name.trim(),
              normalizedName,
              createdBy: userId ?? null,
            });
            created.push({ rowNumber: item.row.rowNumber });
          } catch (error) {
            if (error instanceof AppError) {
              rejected.push({
                rowNumber: item.row.rowNumber,
                error: rowError(error.code, error.message, "name", item.row.values.name),
              });
              continue;
            }
            const classified = classifyClientUniqueViolation(error);
            if (classified) {
              rejected.push({
                rowNumber: item.row.rowNumber,
                error: rowError(
                  classified.code,
                  classified.message,
                  classified.field,
                  item.row.values.name,
                ),
              });
              continue;
            }
            if (
              error instanceof Error &&
              error.message === "CLIENT_NAME_ALREADY_EXISTS"
            ) {
              rejected.push({
                rowNumber: item.row.rowNumber,
                error: rowError(
                  "CLIENT_NAME_ALREADY_EXISTS",
                  "Ya existe un cliente con ese nombre",
                  "name",
                  item.row.values.name,
                ),
              });
              continue;
            }
            throw error;
          }
        }

        return { created, rejected };
      },
      audit: async ({ companyId: cid, userId, importJobId, prepared: plan, created, rejected, durationMs }) => {
        await logAuditSafe("import.clients.execute", () =>
          auditService.log(cid, {
            entityType: "import_job",
            entityId: importJobId ?? cid,
            action: "import.execute",
            newData: {
              entityType: "clients",
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
