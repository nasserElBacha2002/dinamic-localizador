import type { OperationFormValues } from "../schemas/operation.schema";
import type { CompanySettings } from "../types/company-settings";

export function buildOperationCreateDefaultValues(
  settings: CompanySettings,
): OperationFormValues {
  return {
    serviceId: "",
    scheduledStart: "",
    scheduledEnd: "",
    earlyToleranceMinutes: settings.defaultEarlyArrivalToleranceMinutes,
    lateToleranceMinutes: settings.defaultLateArrivalToleranceMinutes,
    notes: "",
  };
}
