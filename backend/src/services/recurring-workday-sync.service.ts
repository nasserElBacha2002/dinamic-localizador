import { AppError } from "../errors/app-error";
import type { CompanyMaterializationSummary } from "../types/materialization";

const SYNC_FAILED_MESSAGE =
  "La configuración se guardó, pero no se pudieron actualizar las jornadas programadas. Podés volver a sincronizarlas desde la operación.";

const COMPANY_SYNC_FAILED_MESSAGE =
  "La configuración se guardó, pero algunas jornadas no pudieron actualizarse. Usá \"Actualizar jornadas\" para volver a sincronizar.";

export const recurringWorkdaySyncService = {
  async runOperationSync<T>(
    companyId: string,
    operationId: string,
    action: () => Promise<T>,
    context: string,
  ): Promise<T> {
    try {
      return await action();
    } catch (error) {
      console.error(`[recurring-workday-sync] ${context} failed`, {
        companyId,
        operationId,
        error,
      });
      if (error instanceof AppError && error.code === "RECURRING_WORKDAY_SYNC_FAILED") {
        throw error;
      }
      throw new AppError(503, "RECURRING_WORKDAY_SYNC_FAILED", SYNC_FAILED_MESSAGE, {
        operationId,
      });
    }
  },

  assertCompanySyncSucceeded(summary: CompanyMaterializationSummary): void {
    if (summary.operationsFailed === 0) {
      return;
    }

    throw new AppError(503, "RECURRING_WORKDAY_SYNC_FAILED", COMPANY_SYNC_FAILED_MESSAGE, {
      operationsProcessed: summary.operationsProcessed,
      operationsFailed: summary.operationsFailed,
    });
  },
};
