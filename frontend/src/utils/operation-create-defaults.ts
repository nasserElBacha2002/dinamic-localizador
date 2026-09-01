import type { OperationFormValues } from "../schemas/operation.schema";
import type { CompanySettings } from "../types/company-settings";
import { createDefaultWeeklySchedule } from "../types/schedule";
import { getTodayDateInput } from "./dates";

export function buildOperationCreateDefaultValues(
  settings: CompanySettings,
  options?: { serviceId?: string },
): OperationFormValues {
  const presetServiceId = options?.serviceId?.trim() ?? "";

  return {
    operationKind: "ONE_TIME",
    serviceId: presetServiceId,
    scheduledStart: "",
    scheduledEnd: "",
    validFrom: getTodayDateInput(),
    validUntil: "",
    scheduleSource: "COMPANY",
    scheduleDays: createDefaultWeeklySchedule(
      settings.defaultOperationStartTime,
      settings.defaultOperationEndTime,
    ),
    earlyToleranceMinutes: settings.defaultEarlyArrivalToleranceMinutes,
    lateToleranceMinutes: settings.defaultLateArrivalToleranceMinutes,
  };
}
