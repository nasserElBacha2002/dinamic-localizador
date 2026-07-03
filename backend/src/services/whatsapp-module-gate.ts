import {
  COMPANY_MODULE_KEYS,
  type CompanyModuleKey,
} from "../constants/company-modules";
import { MODULE_DISABLED_MESSAGE } from "./bot/bot-response.builder";

export function isModuleEnabledInStates(
  moduleStates: ReadonlyMap<CompanyModuleKey, boolean>,
  moduleKey: CompanyModuleKey,
): boolean {
  return moduleStates.get(moduleKey) === true;
}

export function getAttendanceModuleBlockedMessage(
  moduleStates: ReadonlyMap<CompanyModuleKey, boolean>,
): string | null {
  if (!isModuleEnabledInStates(moduleStates, COMPANY_MODULE_KEYS.ATTENDANCE)) {
    return MODULE_DISABLED_MESSAGE;
  }

  return null;
}

export function getCheckInModuleBlockedMessage(
  moduleStates: ReadonlyMap<CompanyModuleKey, boolean>,
): string | null {
  const attendanceBlocked = getAttendanceModuleBlockedMessage(moduleStates);
  if (attendanceBlocked) {
    return attendanceBlocked;
  }

  if (!isModuleEnabledInStates(moduleStates, COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS)) {
    return MODULE_DISABLED_MESSAGE;
  }

  return null;
}

export function getAbsenceModuleBlockedMessage(
  moduleStates: ReadonlyMap<CompanyModuleKey, boolean>,
): string | null {
  if (!isModuleEnabledInStates(moduleStates, COMPANY_MODULE_KEYS.ABSENCES)) {
    return MODULE_DISABLED_MESSAGE;
  }

  return null;
}
