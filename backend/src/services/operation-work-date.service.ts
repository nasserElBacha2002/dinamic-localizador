import { AppError } from "../errors/app-error";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { operationRepository } from "../repositories/operation.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import { operationWorkdayResolver } from "./operation-workday-resolver";

/**
 * Resolves the canonical operation work date without persisting workday rows.
 * Uses materialized OperationWorkday when present; otherwise derives from schedule + timezone.
 */
export const operationWorkDateService = {
  async resolveOperationWorkDate(companyId: string, operationId: string): Promise<string> {
    const operation = await operationRepository.findById(companyId, operationId);
    if (!operation) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }

    const operationKind = operation.operationKind ?? "ONE_TIME";
    if (operationKind === "RECURRING") {
      throw new AppError(
        501,
        "RECURRING_OPERATION_NOT_SUPPORTED",
        "Las operaciones recurrentes aún no están disponibles",
      );
    }

    const materialized = await operationWorkdayRepository.listByOperationId(companyId, operationId);
    if (materialized.length > 1) {
      throw new AppError(
        500,
        "ONE_TIME_OPERATION_MULTIPLE_WORKDAYS",
        `La operación ONE_TIME ${operationId} tiene múltiples jornadas materializadas`,
      );
    }
    if (materialized[0]) {
      return materialized[0].workDate;
    }

    const settings = await companySettingsRepository.findByCompanyId(companyId);
    const timezone = resolveOperationTimezone(settings?.operationTimezone);
    return operationWorkdayResolver.resolveOneTime(operation, timezone).workDate;
  },
};
