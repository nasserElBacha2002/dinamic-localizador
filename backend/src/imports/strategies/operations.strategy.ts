import { COMPANY_MODULE_KEYS } from "../../constants/company-modules";
import { CLIENT_IMPORT_RECOMMENDED_TEMPLATE_HEADERS } from "../../constants/operation-import";
import { operationImportService, buildRecurringImportConfirmPayload } from "../../services/operations/operation-import.service";
import type {
  OperationImportConfirmRow,
  OperationImportPreviewRow,
} from "../../types/operation-import";
import { isRecurringImportConfirmRow } from "../../types/operation-import";
import { collapseRecurringMultiShiftConfirmRows } from "../../utils/operations/operation-import-multi-shift";
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

type OperationOneTimeConfirmPayload = {
  serviceId: string;
  scheduledStart: string;
  scheduledEnd: string;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  earlyToleranceSource: "COMPANY_DEFAULT" | "CUSTOM";
  lateToleranceSource: "COMPANY_DEFAULT" | "CUSTOM";
};

type OperationConfirmPayload = OperationOneTimeConfirmPayload | OperationImportConfirmRow;

const buildConfirmPayload = (row: OperationImportPreviewRow): OperationConfirmPayload | null => {
  if (row.operationKind === "RECURRING") {
    return buildRecurringImportConfirmPayload(row);
  }

  if (
    row.status !== "valid" ||
    !row.serviceId ||
    row.earlyToleranceMinutes === null ||
    row.lateToleranceMinutes === null
  ) {
    return null;
  }

  if (!row.scheduledStart || !row.scheduledEnd) {
    return null;
  }

  return {
    serviceId: row.serviceId,
    scheduledStart: row.scheduledStart,
    scheduledEnd: row.scheduledEnd,
    earlyToleranceMinutes: row.earlyToleranceMinutes,
    lateToleranceMinutes: row.lateToleranceMinutes,
    earlyToleranceSource: row.earlyToleranceSource,
    lateToleranceSource: row.lateToleranceSource,
  };
};

const estimateCreatedOperations = (rows: PreparedImportRow[]): number => {
  const confirmRows = rows
    .map((row) => row.payload)
    .filter((payload): payload is OperationImportConfirmRow => payload != null);
  const recurringRows = confirmRows.filter(isRecurringImportConfirmRow);
  const oneTimeRows = confirmRows.length - recurringRows.length;
  const collapsedRecurring = collapseRecurringMultiShiftConfirmRows(recurringRows);
  return oneTimeRows + collapsedRecurring.length;
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
    const errors = toRowErrors(row.errors);
    const payload = buildConfirmPayload(row);

    return {
      rowNumber: row.rowNumber,
      values: {
        punto: row.punto || row.legacyLocation,
        serviceName: row.serviceName ?? "",
        operationKind: row.operationKind,
        rawFecha: row.rawFecha,
        parsedOperationDate: row.parsedOperationDate ?? "",
        fechaInicio: row.fechaInicio,
        fechaFin: row.fechaFin,
        validFrom: row.validFrom ?? "",
        validUntil: row.validUntil ?? "",
        scheduleSource: row.scheduleSource ?? "",
        scheduleMode: row.scheduleMode,
        shiftCode: row.shiftCode ?? "",
        scheduledStartDisplay: row.scheduledStartDisplay,
        scheduledEndDisplay: row.scheduledEndDisplay,
        scheduleTimezone: row.scheduleTimezone ?? "",
      },
      errors,
      payload,
    };
  });

  const displayColumns =
    result.format === "recurring"
      ? [
          { key: "punto", header: "Sucursal" },
          { key: "serviceName", header: "Servicio resuelto" },
          { key: "validFrom", header: "Vigencia desde" },
          { key: "validUntil", header: "Vigencia hasta" },
          { key: "scheduleMode", header: "Modo horario" },
          { key: "shiftCode", header: "Turno" },
          { key: "scheduleSource", header: "Origen horario" },
          { key: "scheduledStartDisplay", header: "Horario" },
          { key: "scheduleTimezone", header: "Zona horaria" },
        ]
      : [
          { key: "punto", header: result.format === "client" ? "PUNTO" : "Servicio" },
          { key: "serviceName", header: "Servicio resuelto" },
          {
            key: "rawFecha",
            header: result.format === "client" ? "Fecha original" : "Inicio original",
          },
          { key: "scheduledStartDisplay", header: "Inicio" },
          { key: "scheduledEndDisplay", header: "Fin" },
        ];

  return {
    entityType: "operations",
    strategyVersion: IMPORT_STRATEGY_VERSION,
    fileName,
    fileHash: hashImportFile(buffer),
    fileType: result.fileType,
    format: result.format,
    requireAllRowsValid: true,
    displayColumns,
    fileErrors: result.fileErrors,
    rows,
    summary: {
      totalRows: result.summary.totalRows,
      validRows: result.summary.validRows,
      invalidRows: result.summary.invalidRows,
      warningRows: 0,
      canConfirm: result.summary.canConfirm,
      createdEstimate: estimateCreatedOperations(rows),
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
      .map((row) => row.payload as OperationImportConfirmRow);

    const created = await operationImportService.confirm(companyId, confirmRows);
    const fileErrors = created.workdaySyncError ? [created.workdaySyncError.message] : [];

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
      fileErrors,
    };

    return result;
  },

  async execute(companyId, buffer, fileName, userId) {
    const prepared = await this.prepare(companyId, buffer, fileName);
    return this.persist(companyId, prepared, { userId });
  },
};
