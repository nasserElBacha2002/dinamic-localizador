import { AppError } from "../errors/app-error";
import type { AbsenceWorkdayReconciliationResult } from "../types/absence-workday-reconciliation";

const SYNC_FAILED_MESSAGE =
  "La ausencia fue guardada, pero no se pudieron actualizar las jornadas programadas.";

export const absenceWorkdaySyncService = {
  async runAfterAbsenceMutation<T extends { workdayReconciliation?: AbsenceWorkdayReconciliationResult }>(
    companyId: string,
    absenceRequestId: string,
    loadResult: () => Promise<T>,
    reconcile: () => Promise<AbsenceWorkdayReconciliationResult>,
    context: string,
  ): Promise<T & { workdayReconciliation: AbsenceWorkdayReconciliationResult }> {
    const result = await loadResult();

    try {
      const workdayReconciliation = await reconcile();
      return { ...result, workdayReconciliation };
    } catch (error) {
      console.error(`[absence-workday-sync] ${context} failed`, {
        companyId,
        absenceRequestId,
        error,
      });
      if (error instanceof AppError && error.code === "ABSENCE_WORKDAY_SYNC_FAILED") {
        throw error;
      }
      throw new AppError(503, "ABSENCE_WORKDAY_SYNC_FAILED", SYNC_FAILED_MESSAGE, {
        absenceRequestId,
      });
    }
  },
};
