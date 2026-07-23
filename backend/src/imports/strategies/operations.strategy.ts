import { COMPANY_MODULE_KEYS } from "../../constants/company-modules";
import { CLIENT_IMPORT_RECOMMENDED_TEMPLATE_HEADERS } from "../../constants/operation-import";
import { operationImportService } from "../../services/operation-import.service";
import { auditService } from "../../services/audit.service";
import { logAuditSafe } from "../../utils/audit-post-commit";
import { DEFAULT_IMPORT_MAX_ROWS } from "../constants";
import { buildCsvTemplate } from "../parse-import-file";
import type { ImportStrategy } from "../strategy";
import type {
  ImportExecuteResult,
  ImportPreviewResult,
  ImportRowError,
  ImportTemplate,
} from "../types";

const toRowErrors = (messages: string[]): ImportRowError[] =>
  messages.map((message) => ({
    field: null,
    value: null,
    code: "OPERATION_IMPORT_ROW_INVALID",
    message,
    severity: "error" as const,
  }));

const adaptOperationPreview = async (
  companyId: string,
  buffer: Buffer,
  fileName: string,
): Promise<ImportPreviewResult> => {
  const result = await operationImportService.previewFile(companyId, buffer, fileName);
  const rows = result.rows.map((row) => ({
    rowNumber: row.rowNumber,
    status: row.status === "valid" ? ("valid" as const) : ("invalid" as const),
    values: {
      punto: row.punto || row.legacyLocation,
      serviceName: row.serviceName ?? "",
      rawFecha: row.rawFecha,
      parsedOperationDate: row.parsedOperationDate ?? "",
      fechaInicio: row.fechaInicio,
      fechaFin: row.fechaFin,
      scheduledStartDisplay: row.scheduledStartDisplay,
      scheduledEndDisplay: row.scheduledEndDisplay,
      notas: row.notas,
    },
    errors: toRowErrors(row.errors),
  }));

  return {
    entityType: "operations",
    fileType: result.fileType,
    format: result.format,
    summary: {
      totalRows: result.summary.totalRows,
      validRows: result.summary.validRows,
      invalidRows: result.summary.invalidRows,
      warningRows: 0,
      canConfirm: result.summary.canConfirm,
      createdEstimate: result.summary.validRows,
      updatedEstimate: 0,
    },
    rows,
    fileErrors: result.fileErrors,
    displayColumns: [
      { key: "punto", header: result.format === "client" ? "PUNTO" : "Servicio" },
      { key: "serviceName", header: "Servicio resuelto" },
      { key: "rawFecha", header: result.format === "client" ? "Fecha original" : "Inicio original" },
      { key: "scheduledStartDisplay", header: "Inicio" },
      { key: "scheduledEndDisplay", header: "Fin" },
      { key: "notas", header: "Notas" },
    ],
  };
};

export const operationsImportStrategy: ImportStrategy = {
  entityType: "operations",
  permission: "operations:manage",
  moduleKeys: [COMPANY_MODULE_KEYS.OPERATIONS],
  requireAllRowsValid: true,
  maxRows: DEFAULT_IMPORT_MAX_ROWS,

  buildTemplate(): ImportTemplate {
    return {
      fileName: "plantilla-importacion-operaciones.csv",
      contentType: "text/csv; charset=utf-8",
      body: buildCsvTemplate([...CLIENT_IMPORT_RECOMMENDED_TEMPLATE_HEADERS], [
        ["Sucursal Ejemplo", "25/07/2026"],
      ]),
    };
  },

  preview(companyId, buffer, fileName) {
    return adaptOperationPreview(companyId, buffer, fileName);
  },

  async execute(companyId, buffer, fileName, userId) {
    const started = Date.now();
    const preview = await operationImportService.previewFile(companyId, buffer, fileName);

    if (preview.fileErrors.length > 0 || !preview.summary.canConfirm) {
      return {
        entityType: "operations",
        summary: {
          totalRows: preview.summary.totalRows,
          processedRows: 0,
          created: 0,
          updated: 0,
          rejected: preview.summary.invalidRows || preview.summary.totalRows,
          durationMs: Date.now() - started,
        },
        rows: preview.rows.map((row) => ({
          rowNumber: row.rowNumber,
          status: "rejected" as const,
          values: {
            punto: row.punto || row.legacyLocation,
            serviceName: row.serviceName ?? "",
            rawFecha: row.rawFecha,
          },
          errors: toRowErrors(
            row.errors.length > 0 ? row.errors : preview.fileErrors,
          ),
        })),
        fileErrors: preview.fileErrors,
      };
    }

    const confirmRows = preview.rows
      .filter((row) => row.status === "valid")
      .map((row) => ({
        serviceId: row.serviceId!,
        scheduledStart: row.scheduledStart!,
        scheduledEnd: row.scheduledEnd!,
        earlyToleranceMinutes: row.earlyToleranceMinutes!,
        lateToleranceMinutes: row.lateToleranceMinutes!,
        notes: row.notas.trim() ? row.notas.trim() : null,
      }));

    const created = await operationImportService.confirm(companyId, confirmRows);

    await logAuditSafe("import.operations.execute", () =>
      auditService.log(companyId, {
        entityType: "import",
        entityId: companyId,
        action: "import.execute",
        newData: {
          entityType: "operations",
          fileName,
          totalRows: preview.summary.totalRows,
          created: created.count,
          updated: 0,
          rejected: 0,
        },
        reason: "generic_import",
        userId: userId ?? null,
      }),
    );

    const result: ImportExecuteResult = {
      entityType: "operations",
      summary: {
        totalRows: preview.summary.totalRows,
        processedRows: created.count,
        created: created.count,
        updated: 0,
        rejected: 0,
        durationMs: Date.now() - started,
      },
      rows: preview.rows.map((row) => ({
        rowNumber: row.rowNumber,
        status: "created" as const,
        values: {
          punto: row.punto || row.legacyLocation,
          serviceName: row.serviceName ?? "",
          rawFecha: row.rawFecha,
        },
        errors: [],
      })),
      fileErrors: [],
    };

    return result;
  },
};
