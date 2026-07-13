import type { CompanyModuleKey } from "../../constants/company-modules";
import {
  getAbsenceModuleBlockedMessage,
  getAssignmentConfirmationModuleBlockedMessage,
  getAttendanceModuleBlockedMessage,
  getCheckInModuleBlockedMessage,
  getUpcomingAssignmentsModuleBlockedMessage,
  getWorkdayModuleBlockedMessage,
} from "../whatsapp-module-gate";
import { parseOperationSelection } from "../../utils/intent";

export type BotMenuOptionKey =
  | "check_in"
  | "checkout"
  | "absence"
  | "workday"
  | "upcoming_assignments"
  | "confirm_attendance"
  | "report_unavailability";

export interface BotMenuOption {
  key: BotMenuOptionKey;
  label: string;
  hint: string;
}

const MENU_OPTION_DEFINITIONS: Record<BotMenuOptionKey, Omit<BotMenuOption, "key">> = {
  check_in: {
    label: "Marcar llegada",
    hint: 'escribí "Llegué"',
  },
  checkout: {
    label: "Marcar salida",
    hint: 'escribí "Me voy"',
  },
  absence: {
    label: "Pedir ausencia o vacaciones",
    hint: 'escribí "Pedir ausencia"',
  },
  workday: {
    label: "Consultar jornada de hoy",
    hint: 'escribí "Mi jornada" o "Hoy"',
  },
  upcoming_assignments: {
    label: "Ver próximos turnos",
    hint: 'escribí "Mis turnos" o "Agenda"',
  },
  confirm_attendance: {
    label: "Confirmar asistencia",
    hint: 'escribí "Confirmo asistencia"',
  },
  report_unavailability: {
    label: "Avisar no disponibilidad",
    hint: 'escribí "No puedo asistir"',
  },
};

export const buildAvailableMenuOptions = (
  moduleStates: ReadonlyMap<CompanyModuleKey, boolean>,
): BotMenuOption[] => {
  const options: BotMenuOption[] = [];

  if (!getCheckInModuleBlockedMessage(moduleStates)) {
    options.push({ key: "check_in", ...MENU_OPTION_DEFINITIONS.check_in });
  }

  if (!getAttendanceModuleBlockedMessage(moduleStates)) {
    options.push({ key: "checkout", ...MENU_OPTION_DEFINITIONS.checkout });
  }

  if (!getAbsenceModuleBlockedMessage(moduleStates)) {
    options.push({ key: "absence", ...MENU_OPTION_DEFINITIONS.absence });
  }

  if (!getWorkdayModuleBlockedMessage(moduleStates)) {
    options.push({ key: "workday", ...MENU_OPTION_DEFINITIONS.workday });
  }

  if (!getUpcomingAssignmentsModuleBlockedMessage(moduleStates)) {
    options.push({ key: "upcoming_assignments", ...MENU_OPTION_DEFINITIONS.upcoming_assignments });
  }

  if (!getAssignmentConfirmationModuleBlockedMessage(moduleStates)) {
    options.push({ key: "confirm_attendance", ...MENU_OPTION_DEFINITIONS.confirm_attendance });
    options.push({ key: "report_unavailability", ...MENU_OPTION_DEFINITIONS.report_unavailability });
  }

  return options;
};

export const formatMenuOptionsLines = (options: BotMenuOption[]): string[] =>
  options.map((option, index) => `${index + 1}. ${option.label} — ${option.hint}`);

export const parseMenuNumberInput = (body: string): number | null => parseOperationSelection(body);

export const resolveMenuNumberSelection = (
  body: string,
  moduleStates: ReadonlyMap<CompanyModuleKey, boolean>,
): BotMenuOptionKey | null => {
  const selection = parseMenuNumberInput(body?.trim() ?? "");
  if (selection === null) {
    return null;
  }

  const options = buildAvailableMenuOptions(moduleStates);
  const selected = options[selection - 1];
  return selected?.key ?? null;
};

export const isNumericMenuInput = (body: string): boolean =>
  parseMenuNumberInput(body?.trim() ?? "") !== null;

export const INVALID_MENU_SELECTION_PREFIX = "No encontré una opción con ese número.";

export const buildInvalidMenuSelectionMessage = (
  moduleStates: ReadonlyMap<CompanyModuleKey, boolean>,
): string => {
  const options = buildAvailableMenuOptions(moduleStates);
  const lines = formatMenuOptionsLines(options);
  return [INVALID_MENU_SELECTION_PREFIX, "", ...lines].join("\n");
};
