import { COMPANY_MODULE_KEYS } from "../../constants/company-modules";
import { EMPLOYEE_TYPES } from "../../constants/employee-types";
import { AppError } from "../../errors/app-error";
import { employeeCategoryRepository } from "../../repositories/employee-category.repository";
import { employeeRepository } from "../../repositories/employee.repository";
import { createEmployeeSchema } from "../../schemas/employee.schema";
import { auditService } from "../../services/audit.service";
import { employeeService } from "../../services/employee.service";
import { logAuditSafe } from "../../utils/audit-post-commit";
import { normalizeCategoryName } from "../../utils/normalize-category-name";
import { normalizePhoneNumber } from "../../utils/phone";
import { isDuplicateKeyError } from "../../utils/sql-server-errors";
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

type EmployeeDraft = {
  rowNumber: number;
  values: Record<string, string>;
  uniqueKey: string | null;
  input: {
    name: string;
    documentNumber: string | null;
    phoneNumber: string;
    employeeType: (typeof EMPLOYEE_TYPES)[number];
    categoryId: string | null;
  } | null;
  errors: ReturnType<typeof rowError>[];
};

const buildEmployeeDrafts = async (
  companyId: string,
  buffer: Buffer,
  fileName: string,
): Promise<{
  fileType: "csv" | "xlsx";
  fileErrors: string[];
  drafts: EmployeeDraft[];
}> => {
  const mapped = parseAndMapColumns(buffer, fileName, EMPLOYEE_IMPORT_COLUMNS, {
    maxRows: DEFAULT_IMPORT_MAX_ROWS,
  });

  if (mapped.fileErrors.length > 0 && mapped.dataRows.length === 0) {
    return { fileType: mapped.fileType, fileErrors: mapped.fileErrors, drafts: [] };
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
  const drafts: EmployeeDraft[] = mapped.dataRows.map((row) => {
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

    let input: EmployeeDraft["input"] = null;
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
        input = {
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
      uniqueKey: phoneNumber,
      input,
      errors,
    };
  });

  const existingPhones = await employeeRepository.findExistingPhones(companyId, normalizedPhones);
  for (const draft of drafts) {
    if (draft.uniqueKey && existingPhones.has(draft.uniqueKey)) {
      draft.errors.push(
        rowError(
          "EMPLOYEE_PHONE_ALREADY_EXISTS",
          "El teléfono ya está registrado",
          "phoneNumber",
          draft.values.phoneNumber,
        ),
      );
      draft.input = null;
    }
  }

  const duplicateErrors = markInFileDuplicates(
    drafts,
    "phoneNumber",
    "EMPLOYEE_DUPLICATE_IN_FILE",
    "Teléfono duplicado dentro del archivo",
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

const toPreviewRows = (drafts: EmployeeDraft[]): ImportPreviewRow[] =>
  drafts.map((draft) => ({
    rowNumber: draft.rowNumber,
    status: draft.errors.length === 0 ? "valid" : "invalid",
    values: draft.values,
    errors: draft.errors,
  }));

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

  async preview(companyId, buffer, fileName): Promise<ImportPreviewResult> {
    const { fileType, fileErrors, drafts } = await buildEmployeeDrafts(companyId, buffer, fileName);
    const rows = toPreviewRows(drafts);
    return {
      entityType: "employees",
      fileType,
      format: null,
      summary: summarizePreviewRows(rows, false),
      rows,
      fileErrors,
      displayColumns: EMPLOYEE_IMPORT_COLUMNS.map((column) => ({
        key: column.key,
        header: column.header,
      })),
    };
  },

  async execute(companyId, buffer, fileName, userId): Promise<ImportExecuteResult> {
    const started = Date.now();
    const { fileErrors, drafts } = await buildEmployeeDrafts(companyId, buffer, fileName);
    if (fileErrors.length > 0 && drafts.length === 0) {
      return {
        entityType: "employees",
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
          await employeeService.create(companyId, draft.input!);
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
              : isDuplicateKeyError(error)
                ? "El teléfono ya está registrado"
                : "No se pudo crear el colaborador.";
          const code =
            error instanceof AppError
              ? error.code
              : isDuplicateKeyError(error)
                ? "EMPLOYEE_PHONE_ALREADY_EXISTS"
                : "EMPLOYEE_CREATE_FAILED";
          resultRows.push({
            rowNumber: draft.rowNumber,
            status: "rejected",
            values: draft.values,
            errors: [rowError(code, message, "phoneNumber", draft.values.phoneNumber)],
          });
        }
      }
    }

    resultRows.sort((a, b) => a.rowNumber - b.rowNumber);

    await logAuditSafe("import.employees.execute", () =>
      auditService.log(companyId, {
        entityType: "import",
        entityId: companyId,
        action: "import.execute",
        newData: {
          entityType: "employees",
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
      entityType: "employees",
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
