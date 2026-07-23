import { COMPANY_MODULE_KEYS } from "../../constants/company-modules";
import { EMPLOYEE_TYPES } from "../../constants/employee-types";
import { AppError } from "../../errors/app-error";
import { employeeCategoryRepository } from "../../repositories/employee-category.repository";
import { employeeRepository } from "../../repositories/employee.repository";
import { createEmployeeSchema, type CreateEmployeeInput } from "../../schemas/employee.schema";
import { auditService } from "../../services/audit.service";
import { employeeService } from "../../services/employee.service";
import { logAuditSafe } from "../../utils/audit-post-commit";
import { normalizeCategoryName } from "../../utils/normalize-category-name";
import { normalizePhoneNumber } from "../../utils/phone";
import {
  markInFileDuplicates,
  parseAndMapColumns,
  rowError,
  summarizePreviewRows,
} from "../column-import-helpers";
import { classifyEmployeeUniqueViolation } from "../constraint-classifiers";
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

export const EMPLOYEE_IMPORT_COLUMNS: ImportColumnDefinition[] = [
  { key: "name", header: "Nombre", required: true, aliases: ["colaborador", "empleado"] },
  {
    key: "documentNumber",
    header: "Documento",
    required: false,
    aliases: ["dni", "document", "document_number"],
  },
  {
    key: "phoneNumber",
    header: "Teléfono",
    required: true,
    aliases: ["telefono", "phone", "phone_number", "whatsapp"],
  },
  {
    key: "employeeType",
    header: "Tipo",
    required: true,
    aliases: ["tipo", "employee_type", "tipo_colaborador"],
  },
  {
    key: "category",
    header: "Categoría",
    required: false,
    aliases: ["categoria", "category", "category_name"],
  },
];

const parseEmployeeType = (
  raw: string,
): { value: (typeof EMPLOYEE_TYPES)[number] | null; error: string | null } => {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return { value: null, error: "El tipo es obligatorio." };
  }

  if (trimmed === "fijo" || trimmed === "eventual") {
    return { value: trimmed, error: null };
  }

  return {
    value: null,
    error: 'Tipo inválido. Usá "Fijo" o "Eventual".',
  };
};

const buildEmployeePrepared = async (
  companyId: string,
  buffer: Buffer,
  fileName: string,
  maxRows: number,
): Promise<PreparedImport> => {
  const mapped = parseAndMapColumns(buffer, fileName, EMPLOYEE_IMPORT_COLUMNS, { maxRows });

  if (mapped.fileErrors.length > 0 && mapped.dataRows.length === 0) {
    return {
      entityType: "employees",
      strategyVersion: IMPORT_STRATEGY_VERSION,
      fileName,
      fileHash: hashImportFile(buffer),
      fileType: mapped.fileType,
      format: null,
      requireAllRowsValid: false,
      displayColumns: EMPLOYEE_IMPORT_COLUMNS.map((column) => ({
        key: column.key,
        header: column.header,
      })),
      fileErrors: mapped.fileErrors,
      rows: [],
      summary: summarizePreviewRows([], false),
    };
  }

  const categories = await employeeCategoryRepository.listForCompany(companyId, {
    includeInactive: false,
  });
  const categoryByNormalized = new Map(
    categories
      .filter((category) => category.isActive)
      .map((category) => [category.normalizedName, category]),
  );

  const normalizedPhones: string[] = [];
  const rows: PreparedImportRow[] = mapped.dataRows.map((row) => {
    const values = row.values;
    const errors = [];
    const name = values.name?.trim() ?? "";
    if (!name) {
      errors.push(rowError("EMPLOYEE_NAME_REQUIRED", "El nombre es obligatorio.", "name", values.name));
    }

    let phoneNumber: string | null = null;
    try {
      phoneNumber = normalizePhoneNumber(values.phoneNumber ?? "");
    } catch {
      errors.push(
        rowError(
          "EMPLOYEE_PHONE_INVALID",
          "Teléfono inválido. Usá formato E.164 (ej. +5491112345678).",
          "phoneNumber",
          values.phoneNumber,
        ),
      );
    }

    const type = parseEmployeeType(values.employeeType ?? "");
    if (type.error || !type.value) {
      errors.push(
        rowError("EMPLOYEE_TYPE_INVALID", type.error ?? "Tipo inválido.", "employeeType", values.employeeType),
      );
    }

    let categoryId: string | null = null;
    const categoryRaw = values.category?.trim() ?? "";
    if (categoryRaw) {
      const category = categoryByNormalized.get(normalizeCategoryName(categoryRaw));
      if (!category || !category.isActive) {
        errors.push(
          rowError(
            "EMPLOYEE_CATEGORY_NOT_FOUND",
            `La categoría "${categoryRaw}" no existe o no está activa.`,
            "category",
            categoryRaw,
          ),
        );
      } else {
        categoryId = category.id;
      }
    }

    if (phoneNumber) {
      normalizedPhones.push(phoneNumber);
    }

    let payload: CreateEmployeeInput | null = null;
    if (errors.length === 0 && phoneNumber && type.value) {
      const candidate = {
        name,
        documentNumber: values.documentNumber?.trim() ? values.documentNumber.trim() : null,
        phoneNumber,
        employeeType: type.value,
        categoryId,
      };
      const parsed = createEmployeeSchema.safeParse(candidate);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          errors.push(
            rowError(
              "EMPLOYEE_VALIDATION",
              issue.message,
              String(issue.path[0] ?? "name"),
              values[String(issue.path[0] ?? "name")] ?? null,
            ),
          );
        }
      } else {
        payload = {
          name: parsed.data.name,
          documentNumber: parsed.data.documentNumber ?? null,
          phoneNumber: parsed.data.phoneNumber,
          employeeType: parsed.data.employeeType,
          categoryId: parsed.data.categoryId ?? null,
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

  const existingPhones = await employeeRepository.findExistingPhones(companyId, normalizedPhones);
  for (const row of rows) {
    const phone = (row.payload as CreateEmployeeInput | null)?.phoneNumber ?? null;
    if (phone && existingPhones.has(phone)) {
      row.errors.push(
        rowError(
          "EMPLOYEE_PHONE_ALREADY_EXISTS",
          "El teléfono ya está registrado",
          "phoneNumber",
          row.values.phoneNumber,
        ),
      );
      row.payload = null;
    }
  }

  const duplicateErrors = markInFileDuplicates(
    rows.map((row) => ({
      rowNumber: row.rowNumber,
      values: row.values,
      uniqueKey: (row.payload as CreateEmployeeInput | null)?.phoneNumber ?? null,
      errors: row.errors,
    })),
    "phoneNumber",
    "EMPLOYEE_DUPLICATE_IN_FILE",
    "Teléfono duplicado dentro del archivo",
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
    entityType: "employees",
    strategyVersion: IMPORT_STRATEGY_VERSION,
    fileName,
    fileHash: hashImportFile(buffer),
    fileType: mapped.fileType,
    format: null,
    requireAllRowsValid: false,
    displayColumns: EMPLOYEE_IMPORT_COLUMNS.map((column) => ({
      key: column.key,
      header: column.header,
    })),
    fileErrors: mapped.fileErrors,
    rows,
    summary: summarizePreviewRows(previewRows, false),
  };
};

export const employeesImportStrategy: ImportStrategy = {
  entityType: "employees",
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
      fileName: "plantilla-importacion-colaboradores.csv",
      contentType: "text/csv; charset=utf-8",
      body: buildCsvTemplate(
        EMPLOYEE_IMPORT_COLUMNS.map((column) => column.header),
        [["Ada Lovelace", "30111222", "+5491112345678", "Fijo", ""]],
      ),
    };
  },

  prepare(companyId, buffer, fileName) {
    return buildEmployeePrepared(companyId, buffer, fileName, this.maxRows);
  },

  async preview(companyId, buffer, fileName) {
    const prepared = await this.prepare(companyId, buffer, fileName);
    return preparedToPreviewResult(prepared);
  },

  async persist(companyId, prepared, context: ImportPersistContext = {}) {
    return runCreateOnlyImport(companyId, prepared, context, {
      entityType: "employees",
      defaultCreateErrorCode: "EMPLOYEE_CREATE_FAILED",
      defaultCreateErrorMessage: "No se pudo crear el colaborador.",
      defaultErrorField: "phoneNumber",
      chunkSize: IMPORT_PERSIST_CHUNK_SIZE,
      classifyError: (error, row) => {
        if (error instanceof AppError) {
          const field =
            error.code === "EMPLOYEE_PHONE_ALREADY_EXISTS"
              ? "phoneNumber"
              : error.code.includes("CATEGORY")
                ? "category"
                : "phoneNumber";
          return rowError(error.code, error.message, field, row.values[field] ?? null);
        }
        const classified = classifyEmployeeUniqueViolation(error);
        if (classified) {
          return rowError(
            classified.code,
            classified.message,
            classified.field === "unknown" ? null : classified.field,
            classified.field === "phoneNumber" ? row.values.phoneNumber : null,
          );
        }
        return rowError(
          "EMPLOYEE_CREATE_FAILED",
          "No se pudo crear el colaborador.",
          null,
          null,
        );
      },
      revalidateRows: async (cid, candidateRows) => {
        const phones = candidateRows
          .map((row) => (row.payload as CreateEmployeeInput | null)?.phoneNumber ?? "")
          .filter(Boolean);
        const existing = await employeeRepository.findExistingPhones(cid, phones);
        const map = new Map<number, ReturnType<typeof rowError>[]>();
        for (const row of candidateRows) {
          const phone = (row.payload as CreateEmployeeInput | null)?.phoneNumber ?? "";
          if (phone && existing.has(phone)) {
            map.set(row.rowNumber, [
              rowError(
                "EMPLOYEE_PHONE_ALREADY_EXISTS",
                "El teléfono ya está registrado",
                "phoneNumber",
                row.values.phoneNumber,
              ),
            ]);
          }
        }
        return map;
      },
      persistBatch: async (cid, items): Promise<CreateOnlyPersistBatchResult> => {
        const payloads = items.map((item) => item.payload as CreateEmployeeInput);
        try {
          await employeeService.createManyForImport(cid, payloads);
          return {
            created: items.map((item) => ({ rowNumber: item.row.rowNumber })),
            rejected: [],
          };
        } catch (error) {
          const classified = classifyEmployeeUniqueViolation(error);
          if (classified || error instanceof AppError) {
            const created: Array<{ rowNumber: number }> = [];
            const rejected: CreateOnlyPersistBatchResult["rejected"] = [];
            for (const item of items) {
              try {
                await employeeService.create(cid, item.payload as CreateEmployeeInput, {
                  creationMode: "import",
                });
                created.push({ rowNumber: item.row.rowNumber });
              } catch (rowErrorValue) {
                if (rowErrorValue instanceof AppError) {
                  rejected.push({
                    rowNumber: item.row.rowNumber,
                    error: rowError(
                      rowErrorValue.code,
                      rowErrorValue.message,
                      rowErrorValue.code === "EMPLOYEE_PHONE_ALREADY_EXISTS"
                        ? "phoneNumber"
                        : null,
                      rowErrorValue.code === "EMPLOYEE_PHONE_ALREADY_EXISTS"
                        ? item.row.values.phoneNumber
                        : null,
                    ),
                  });
                  continue;
                }
                const hit = classifyEmployeeUniqueViolation(rowErrorValue);
                rejected.push({
                  rowNumber: item.row.rowNumber,
                  error: hit
                    ? rowError(
                        hit.code,
                        hit.message,
                        hit.field === "unknown" ? null : hit.field,
                        hit.field === "phoneNumber" ? item.row.values.phoneNumber : null,
                      )
                    : rowError(
                        "EMPLOYEE_CREATE_FAILED",
                        "No se pudo crear el colaborador.",
                        null,
                        null,
                      ),
                });
              }
            }
            return { created, rejected };
          }
          throw error;
        }
      },
      audit: async ({ companyId: cid, userId, importJobId, prepared: plan, created, rejected, durationMs }) => {
        await logAuditSafe("import.employees.execute", () =>
          auditService.log(cid, {
            entityType: "import_job",
            entityId: importJobId ?? cid,
            action: "import.execute",
            newData: {
              entityType: "employees",
              importJobId: importJobId ?? null,
              fileName: plan.fileName,
              strategyVersion: plan.strategyVersion,
              creationMode: "import",
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
