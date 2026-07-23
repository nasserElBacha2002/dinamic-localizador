import { AppError } from "../errors/app-error";
import type { ImportRowError } from "./types";
import {
  buildExecuteResult,
  type PersistRowOutcome,
  type PreparedImport,
  type PreparedImportRow,
} from "./prepared-import";
import { rowError } from "./column-import-helpers";

export type CreateOnlyPersistBatchItem = {
  row: PreparedImportRow;
  payload: unknown;
};

export type CreateOnlyPersistBatchResult = {
  created: Array<{ rowNumber: number }>;
  rejected: Array<{ rowNumber: number; error: ImportRowError }>;
};

export type CreateOnlyImportExecutorOptions = {
  entityType: PreparedImport["entityType"];
  defaultCreateErrorCode: string;
  defaultCreateErrorMessage: string;
  defaultErrorField: string;
  classifyError: (error: unknown, row: PreparedImportRow) => ImportRowError;
  revalidateRows: (
    companyId: string,
    rows: PreparedImportRow[],
  ) => Promise<Map<number, ImportRowError[]>>;
  persistBatch: (
    companyId: string,
    items: CreateOnlyPersistBatchItem[],
  ) => Promise<CreateOnlyPersistBatchResult>;
  chunkSize: number;
  audit: (input: {
    companyId: string;
    userId?: string | null;
    importJobId?: string | null;
    prepared: PreparedImport;
    created: number;
    rejected: number;
    durationMs: number;
  }) => Promise<void>;
};

/**
 * Shared create-only import executor: classifies drafts, revalidates concurrency,
 * persists in real multi-row chunks, and builds the execute result.
 */
export const runCreateOnlyImport = async (
  companyId: string,
  prepared: PreparedImport,
  context: { userId?: string | null; importJobId?: string | null; revalidateConcurrency?: boolean },
  options: CreateOnlyImportExecutorOptions,
) => {
  const started = Date.now();
  const outcomes: PersistRowOutcome[] = [];

  const invalidRows = prepared.rows.filter((row) => row.errors.length > 0 || row.payload === null);
  const candidateRows = prepared.rows.filter((row) => row.errors.length === 0 && row.payload !== null);

  for (const row of invalidRows) {
    outcomes.push({
      rowNumber: row.rowNumber,
      status: "rejected",
      values: row.values,
      errors: row.errors,
    });
  }

  let working = candidateRows;
  if (context.revalidateConcurrency !== false) {
    const concurrencyErrors = await options.revalidateRows(companyId, working);
    const stillValid: PreparedImportRow[] = [];
    for (const row of working) {
      const extras = concurrencyErrors.get(row.rowNumber) ?? [];
      if (extras.length > 0) {
        outcomes.push({
          rowNumber: row.rowNumber,
          status: "rejected",
          values: row.values,
          errors: extras,
        });
      } else {
        stillValid.push(row);
      }
    }
    working = stillValid;
  }

  for (let offset = 0; offset < working.length; offset += options.chunkSize) {
    const chunk = working.slice(offset, offset + options.chunkSize);
    const items: CreateOnlyPersistBatchItem[] = chunk.map((row) => ({
      row,
      payload: row.payload,
    }));

    try {
      const batchResult = await options.persistBatch(companyId, items);
      const createdSet = new Set(batchResult.created.map((item) => item.rowNumber));
      const rejectedByRow = new Map(
        batchResult.rejected.map((item) => [item.rowNumber, item.error] as const),
      );

      for (const row of chunk) {
        if (createdSet.has(row.rowNumber)) {
          outcomes.push({
            rowNumber: row.rowNumber,
            status: "created",
            values: row.values,
            errors: [],
          });
          continue;
        }
        const classified =
          rejectedByRow.get(row.rowNumber) ??
          rowError(
            options.defaultCreateErrorCode,
            options.defaultCreateErrorMessage,
            options.defaultErrorField,
            row.values[options.defaultErrorField] ?? null,
          );
        outcomes.push({
          rowNumber: row.rowNumber,
          status: "rejected",
          values: row.values,
          errors: [classified],
        });
      }
    } catch (error) {
      // Chunk-level failure: fall back to single-row persistence for diagnostics.
      for (const item of items) {
        try {
          const single = await options.persistBatch(companyId, [item]);
          if (single.created.length === 1) {
            outcomes.push({
              rowNumber: item.row.rowNumber,
              status: "created",
              values: item.row.values,
              errors: [],
            });
          } else {
            const rejected = single.rejected[0]?.error ?? options.classifyError(error, item.row);
            outcomes.push({
              rowNumber: item.row.rowNumber,
              status: "rejected",
              values: item.row.values,
              errors: [rejected],
            });
          }
        } catch (rowErrorValue) {
          outcomes.push({
            rowNumber: item.row.rowNumber,
            status: "rejected",
            values: item.row.values,
            errors: [options.classifyError(rowErrorValue, item.row)],
          });
        }
      }
    }
  }

  const durationMs = Date.now() - started;
  const result = buildExecuteResult({
    entityType: options.entityType,
    totalRows: prepared.rows.length,
    outcomes,
    fileErrors: prepared.fileErrors,
    durationMs,
  });

  await options.audit({
    companyId,
    userId: context.userId,
    importJobId: context.importJobId,
    prepared,
    created: result.summary.created,
    rejected: result.summary.rejected,
    durationMs,
  });

  return result;
};

export const assertPreparedCanPersist = (
  prepared: PreparedImport,
  requireAllRowsValid: boolean,
): void => {
  if (prepared.fileErrors.length > 0 && prepared.rows.length === 0) {
    throw new AppError(
      400,
      "IMPORT_FILE_INVALID",
      prepared.fileErrors[0] ?? "El archivo de importación es inválido.",
    );
  }

  if (requireAllRowsValid && !prepared.summary.canConfirm) {
    throw new AppError(
      400,
      "IMPORT_ROWS_INVALID",
      "La importación contiene filas inválidas. Corregí el archivo y volvé a intentar.",
    );
  }

  if (!prepared.summary.canConfirm) {
    throw new AppError(
      400,
      "IMPORT_NO_VALID_ROWS",
      "No hay filas válidas para importar.",
    );
  }
};
