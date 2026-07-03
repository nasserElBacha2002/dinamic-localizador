import type { CompanyModuleKey } from "../../constants/company-modules";
import type { BotSessionState } from "../../types/twilio.types";
import {
  isAbsenceSessionState,
  isCheckInSessionState,
  isCheckoutSessionState,
} from "../../utils/bot-session-states";
import {
  getAbsenceModuleBlockedMessage,
  getAttendanceModuleBlockedMessage,
  getCheckInModuleBlockedMessage,
} from "../whatsapp-module-gate";

export const NO_WHATSAPP_OPTIONS_MESSAGE =
  "Hola 👋\n\nEn este momento no hay opciones disponibles por WhatsApp para tu empresa. Contactá a administración.";

export const NO_ACTIVE_FLOW_CANCEL_PREFIX = "No tenés ningún flujo activo para cancelar.";

export const VOLVER_ACTIVE_SESSION_MESSAGE =
  'No puedo volver al paso anterior en este flujo. Si querés empezar de nuevo, escribí "Cancelar".';

const MENU_OPTION_HINTS: Record<string, string> = {
  "Marcar llegada": 'escribí "Llegué"',
  "Marcar salida": 'escribí "Me voy"',
  "Pedir ausencia o vacaciones": 'escribí "Pedir ausencia"',
};

export function buildGreetingMessage(
  moduleStates: ReadonlyMap<CompanyModuleKey, boolean>,
  options?: { hasActiveSession?: boolean },
): string {
  const labels: string[] = [];

  if (!getCheckInModuleBlockedMessage(moduleStates)) {
    labels.push("Marcar llegada");
  }

  if (!getAttendanceModuleBlockedMessage(moduleStates)) {
    labels.push("Marcar salida");
  }

  if (!getAbsenceModuleBlockedMessage(moduleStates)) {
    labels.push("Pedir ausencia o vacaciones");
  }

  if (labels.length === 0) {
    return NO_WHATSAPP_OPTIONS_MESSAGE;
  }

  const numbered = labels.map(
    (label, index) => `${index + 1}. ${label} — ${MENU_OPTION_HINTS[label]}`,
  );

  const lines = [
    "Hola 👋",
    "¿Qué querés hacer?",
    "",
    ...numbered,
    "",
    'También podés escribir "Ayuda" o "Cancelar".',
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

  return null;
}
