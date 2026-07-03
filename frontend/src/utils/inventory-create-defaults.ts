import type { InventoryFormValues } from "../schemas/inventory.schema";
import type { CompanySettings } from "../types/company-settings";

export function buildInventoryCreateDefaultValues(
  settings: CompanySettings,
): InventoryFormValues {
  return {
    storeId: "",
    scheduledStart: "",
    scheduledEnd: "",
    earlyToleranceMinutes: settings.defaultEarlyArrivalToleranceMinutes,
    lateToleranceMinutes: settings.defaultLateArrivalToleranceMinutes,
    notes: "",
  };
}
