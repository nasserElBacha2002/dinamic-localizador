import { COMPANY_MODULE_KEYS } from "../../constants/company-modules";
import { CLIENT_IMPORT_RECOMMENDED_TEMPLATE_HEADERS } from "../../constants/operation-import";
import { operationImportService } from "../../services/operation-import.service";
import { auditService } from "../../services/audit.service";
import { logAuditSafe } from "../../utils/audit-post-commit";
import { DEFAULT_IMPORT_MAX_ROWS } from "../constants";
import { buildCsvTemplate } from "../parse-import-file";
import {
  hashImportFile,
  IMPORT_STRATEGY_VERSION,
  preparedToPreviewResult,
  type PreparedImport,
  type PreparedImportRow,
} from "../prepared-import";
import type { ImportPersistContext, ImportStrategy } from "../strategy";
import type {
  ImportExecuteResult,
  ImportRowError,
  ImportTemplate,
} from "../types";

type OperationConfirmPayload = {
  serviceId: string;
  scheduledStart: string;
  scheduledEnd: string;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  notes: string | null;
};

const toRowErrors = (messages: string[]): ImportRowError[] =>
  messages.map((message) => ({
    field: null,
    value: null,
    code: "OPERATION_IMPORT_ROW_INVALID",
    message,
    severity: "error" as const,
  }));

const buildOperationsPrepared = async (
  companyId: string,
  buffer: Buffer,
  fileName: string,
): Promise<PreparedImport> => {
  const result = await operationImportService.previewFile(companyId, buffer, fileName);
  const rows: PreparedImportRow[] = result.rows.map((row) => {
    const values = {
      punto: row.punto || row.legacyLocation,
      serviceName: row.serviceName ?? "",
      rawFecha: row.rawFecha,
      parsedOperationDate: row.parsedOperationDate ?? "",
      fechaInicio: row.fechaInicio,
      fechaFin: row.fechaFin,
      scheduledStartDisplay: row.scheduledStartDisplay,
      scheduledEndDisplay: row.scheduledEndDisplay,
      notas: row.notas,
    };
    const errors = toRowErrors(row.errors);
    const payload: OperationConfirmPayload | null =
      row.status === "valid" &&
      row.serviceId &&
      row.scheduledStart &&
      row.scheduledEnd &&
      row.earlyToleranceMinutes !== null &&
      row.lateToleranceMinutes !== null
        ? {
            serviceId: row.serviceId,
            scheduledStart: row.scheduledStart,
            scheduledEnd: row.scheduledEnd,
            earlyToleranceMinutes: row.earlyToleranceMinutes,
            lateToleranceMinutes: row.lateToleranceMinutes,
            notes: row.notas.trim() ? row.notas.trim() : null,
          }
        : null;

    return {
      rowNumber: row.rowNumber,
      values,
      errors,
      payload,
    };
  });

  const previewRows = rows.map((row) => ({
    rowNumber: row.rowNumber,
    status: (row.errors.length === 0 ? "valid" : "invalid") as "valid" | "invalid",
    values: row.values,
    errors: row.errors,
  }));

  return {
    entityType: "operations",
    strategyVersion: IMPORT_STRATEGY_VERSION,
    fileName,
    fileHash: hashImportFile(buffer),
    fileType: result.fileType,
    format: result.format,
    requireAllRowsValid: true,
    displayColumns: [
      { key: "punto", header: result.format === "client" ? "PUNTO" : "Servicio" },
      { key: "serviceName", header: "Servicio resuelto" },
      { key: "rawFecha", header: result.format === "client" ? "Fecha original" : "Inicio original" },
      { key: "scheduledStartDisplay", header: "Inicio" },
      { key: "scheduledEndDisplay", header: "Fin" },
      { key: "notas", header: "Notas" },
    ],
    fileErrors: result.fileErrors,
    rows,
    summary: {
      totalRows: result.summary.totalRows,
      validRows: result.summary.validRows,
      invalidRows: result.summary.invalidRows,
      warningRows: 0,
      canConfirm: result.summary.canConfirm,
      createdEstimate: result.summary.validRows,
      updatedEstimate: 0,
    },
  };
};

export const operationsImportStrategy: ImportStrategy = {
  entityType: "operations",
  permission: "operations:manage",
  moduleKeys: [COMPANY_MODULE_KEYS.OPERATIONS],
  requireAllRowsValid: true,
  maxRows: DEFAULT_IMPORT_MAX_ROWS,
  strategyVersion: IMPORT_STRATEGY_VERSION,

  buildTemplate(): ImportTemplate {
    return {
      fileName: "plantilla-importacion-operaciones.csv",
      contentType: "text/csv; charset=utf-8",
      body: buildCsvTemplate([...CLIENT_IMPORT_RECOMMENDED_TEMPLATE_HEADERS], [
        ["Sucursal Ejemplo", "25/07/2026"],
      ]),
    };
  },

  prepare(companyId, buffer, fileName) {
    return buildOperationsPrepared(companyId, buffer, fileName);
  },

  async preview(companyId, buffer, fileName) {
    const prepared = await this.prepare(companyId, buffer, fileName);
    return preparedToPreviewResult(prepared);
  },

  async persist(companyId, prepared, context: ImportPersistContext = {}) {
    const started = Date.now();

    if (prepared.fileErrors.length > 0 || !prepared.summary.canConfirm) {
      return {
        entityType: "operations",
        summary: {
          totalRows: prepared.summary.totalRows,
          processedRows: 0,
          created: 0,
          updated: 0,
          rejected: prepared.summary.invalidRows || prepared.summary.totalRows,
          durationMs: Date.now() - started,
        },
        rows: prepared.rows.map((row) => ({
          rowNumber: row.rowNumber,
          status: "rejected" as const,
          values: row.values,
          errors:
            row.errors.length > 0
              ? row.errors
              : toRowErrors(prepared.fileErrors),
        })),
        fileErrors: prepared.fileErrors,
      };
    }

    const confirmRows = prepared.rows
      .filter((row) => row.payload)
      .map((row) => row.payload as OperationConfirmPayload);

    const created = await operationImportService.confirm(companyId, confirmRows);

    await logAuditSafe("import.operations.execute", () =>
      auditService.log(companyId, {
        entityType: "import_job",
        entityId: context.importJobId ?? companyId,
        action: "import.execute",
        newData: {
          entityType: "operations",
          importJobId: context.importJobId ?? null,
          fileName: prepared.fileName,
          strategyVersion: prepared.strategyVersion,
          totalRows: prepared.summary.totalRows,
          created: created.count,
          updated: 0,
          rejected: 0,
          durationMs: Date.now() - started,
        },
        reason: "generic_import",
        userId: context.userId ?? null,
      }),
    );

    const result: ImportExecuteResult = {
      entityType: "operations",
      summary: {
        totalRows: prepared.summary.totalRows,
        processedRows: created.count,
        created: created.count,
        updated: 0,
        rejected: 0,
        durationMs: Date.now() - started,
      },
      rows: prepared.rows.map((row) => ({
        rowNumber: row.rowNumber,
        status: "created" as const,
        values: {
          punto: row.values.punto ?? "",
          serviceName: row.values.serviceName ?? "",
          rawFecha: row.values.rawFecha ?? "",
        },
        errors: [],
      })),
      fileErrors: [],
    };

    return result;
  },

  async execute(companyId, buffer, fileName, userId) {
    const prepared = await this.prepare(companyId, buffer, fileName);
    return this.persist(companyId, prepared, { userId });
  },
};
