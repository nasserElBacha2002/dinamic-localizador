import type { CompanyModuleKey } from "../../constants/company-modules";
import type { BotSessionState } from "../../types/twilio.types";
import {
  isAbsenceSessionState,
  isAssignmentSelectionSessionState,
  isCheckInSessionState,
  isCheckoutSessionState,
} from "../../utils/bot-session-states";
import {
  getAbsenceModuleBlockedMessage,
  getAssignmentConfirmationModuleBlockedMessage,
  getAttendanceModuleBlockedMessage,
  getCheckInModuleBlockedMessage,
} from "../whatsapp-module-gate";
import {
  buildAvailableMenuOptions,
  formatMenuOptionsLines,
} from "./bot-menu-options";

export {
  buildAvailableMenuOptions,
  buildInvalidMenuSelectionMessage,
  formatMenuOptionsLines,
  INVALID_MENU_SELECTION_PREFIX,
  isNumericMenuInput,
  parseMenuNumberInput,
  resolveMenuNumberSelection,
} from "./bot-menu-options";
export type { BotMenuOption, BotMenuOptionKey } from "./bot-menu-options";

export const NO_WHATSAPP_OPTIONS_MESSAGE =
  "Hola 👋\n\nEn este momento no hay opciones disponibles por WhatsApp para tu empresa. Contactá a administración.";

export const NO_ACTIVE_FLOW_CANCEL_PREFIX = "No tenés ningún flujo activo para cancelar.";

export const VOLVER_ACTIVE_SESSION_MESSAGE =
  'No puedo volver al paso anterior en este flujo. Si querés empezar de nuevo, escribí "Cancelar".';

export function buildGreetingMessage(
  moduleStates: ReadonlyMap<CompanyModuleKey, boolean>,
  options?: { hasActiveSession?: boolean },
): string {
  const menuOptions = buildAvailableMenuOptions(moduleStates);

  if (menuOptions.length === 0) {
    return NO_WHATSAPP_OPTIONS_MESSAGE;
  }

  const lines = [
    "Hola 👋",
    "¿Qué querés hacer?",
    "",
    ...formatMenuOptionsLines(menuOptions),
    "",
    'También podés escribir "Ayuda", "Cancelar" o el número de la opción.',
  ];

  if (options?.hasActiveSession) {
    lines.push(
      "",
      'Tenés un flujo activo. Escribí "Cancelar" para salir sin completarlo.',
    );
  }

  return lines.join("\n");
}

export function buildHelpMessage(
  moduleStates: ReadonlyMap<CompanyModuleKey, boolean>,
  options?: { hasActiveSession?: boolean },
): string {
  const lines = [
    "Te puedo ayudar con las opciones habilitadas para tu empresa.",
    "",
    buildGreetingMessage(moduleStates, { hasActiveSession: options?.hasActiveSession }),
    "",
    'Si estás en medio de un flujo, escribí "Cancelar" para salir.',
    "Si algo no funciona como esperás, contactá a administración.",
  ];

  return lines.join("\n");
}

export function buildNoActiveFlowCancelMessage(
  moduleStates: ReadonlyMap<CompanyModuleKey, boolean>,
): string {
  return `${NO_ACTIVE_FLOW_CANCEL_PREFIX}\n\n${buildGreetingMessage(moduleStates)}`;
}

export function buildVolverMessage(
  moduleStates: ReadonlyMap<CompanyModuleKey, boolean>,
  hasActiveSession: boolean,
): string {
  if (hasActiveSession) {
    return VOLVER_ACTIVE_SESSION_MESSAGE;
  }

  return buildGreetingMessage(moduleStates);
}

export function getModuleBlockedMessageForSessionState(
  state: BotSessionState,
  moduleStates: ReadonlyMap<CompanyModuleKey, boolean>,
): string | null {
  if (isCheckInSessionState(state)) {
    return getCheckInModuleBlockedMessage(moduleStates);
  }

  if (isCheckoutSessionState(state)) {
    return getAttendanceModuleBlockedMessage(moduleStates);
  }

  if (isAbsenceSessionState(state)) {
    return getAbsenceModuleBlockedMessage(moduleStates);
  }

  if (isAssignmentSelectionSessionState(state)) {
    return getAssignmentConfirmationModuleBlockedMessage(moduleStates);
  }

  return null;
}
