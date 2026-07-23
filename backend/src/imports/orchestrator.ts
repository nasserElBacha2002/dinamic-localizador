import { AppError } from "../errors/app-error";
import { decodeImportBase64 } from "./parse-import-file";
import { importStrategyRegistry } from "./registry";
import type { ImportExecuteResult, ImportPreviewResult, ImportTemplate } from "./types";

export const importOrchestrator = {
  getStrategy(entityType: string) {
    return importStrategyRegistry.get(entityType);
  },

  getTemplate(entityType: string): ImportTemplate {
    return importStrategyRegistry.get(entityType).buildTemplate();
  },

  async preview(
    companyId: string,
    entityType: string,
    input: { fileName: string; fileContentBase64: string },
  ): Promise<ImportPreviewResult> {
    const strategy = importStrategyRegistry.get(entityType);
    const buffer = decodeImportBase64(input.fileContentBase64);
    return strategy.preview(companyId, buffer, input.fileName);
  },

  async execute(
    companyId: string,
    entityType: string,
    input: { fileName: string; fileContentBase64: string },
    userId?: string | null,
  ): Promise<ImportExecuteResult> {
    const strategy = importStrategyRegistry.get(entityType);
    const buffer = decodeImportBase64(input.fileContentBase64);
    const preview = await strategy.preview(companyId, buffer, input.fileName);

    if (preview.fileErrors.length > 0 && preview.rows.length === 0) {
      throw new AppError(
        400,
        "IMPORT_FILE_INVALID",
        preview.fileErrors[0] ?? "El archivo de importación es inválido.",
      );
    }

    if (strategy.requireAllRowsValid && !preview.summary.canConfirm) {
      throw new AppError(
        400,
        "IMPORT_ROWS_INVALID",
        "La importación contiene filas inválidas. Corregí el archivo y volvé a intentar.",
      );
    }

    if (!preview.summary.canConfirm) {
      throw new AppError(
        400,
        "IMPORT_NO_VALID_ROWS",
        "No hay filas válidas para importar.",
      );
    }

    return strategy.execute(companyId, buffer, input.fileName, userId);
  },
};
