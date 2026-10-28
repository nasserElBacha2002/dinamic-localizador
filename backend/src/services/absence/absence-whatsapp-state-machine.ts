/**
 * Phase 6.1 — pure absence WhatsApp state machine (no I/O).
 * Side effects remain in absence-bot.service / handlers.
 */

export const ABSENCE_WHATSAPP_STATES = [
  "IDLE",
  "SELECTING_ACTION",
  "SELECTING_ABSENCE_TYPE",
  "ENTERING_START_DATE",
  "ENTERING_END_DATE",
  "ENTERING_REASON",
  "WAITING_ATTACHMENT",
  "REVIEWING_SUMMARY",
  "CONFIRMING_SUBMISSION",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "ERROR_RECOVERY",
] as const;

export type AbsenceWhatsappState = (typeof ABSENCE_WHATSAPP_STATES)[number];

export type AbsenceWhatsappCommand =
  | "INICIO"
  | "AYUDA"
  | "CANCELAR"
  | "VOLVER"
  | "CREAR_AUSENCIA"
  | "CONSULTAR_SALDO"
  | "VER_SOLICITUDES"
  | "SELECT_OPTION"
  | "SUBMIT_TEXT"
  | "SUBMIT_ATTACHMENT"
  | "CONFIRMAR"
  | "EXPIRE";

export type AbsenceWhatsappTransition = {
  nextState: AbsenceWhatsappState;
  replyKey: string;
  cancelSession?: boolean;
  requireConfirmFingerprint?: boolean;
};

const TERMINAL: ReadonlySet<AbsenceWhatsappState> = new Set([
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
]);

export const normalizeAbsenceCommand = (raw: string): AbsenceWhatsappCommand | null => {
  const text = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (!text) {
    return null;
  }
  if (text === "INICIO" || text === "HOLA" || text === "MENU" || text === "MENÚ") {
    return "INICIO";
  }
  if (text === "AYUDA" || text === "HELP" || text === "?") {
    return "AYUDA";
  }
  if (text === "CANCELAR" || text === "CANCEL") {
    return "CANCELAR";
  }
  if (text === "VOLVER" || text === "ATRAS" || text === "ATRÁS") {
    return "VOLVER";
  }
  if (text === "CREAR AUSENCIA" || text === "1" || text === "NUEVA AUSENCIA") {
    return "CREAR_AUSENCIA";
  }
  if (text === "CONSULTAR SALDO" || text === "2" || text === "SALDO") {
    return "CONSULTAR_SALDO";
  }
  if (text === "VER SOLICITUDES" || text === "3" || text === "SOLICITUDES") {
    return "VER_SOLICITUDES";
  }
  if (text === "CONFIRMAR" || text === "SI" || text === "SÍ") {
    return "CONFIRMAR";
  }
  if (/^\d+$/.test(text)) {
    return "SELECT_OPTION";
  }
  return "SUBMIT_TEXT";
};

export const transitionAbsenceWhatsapp = (
  state: AbsenceWhatsappState,
  command: AbsenceWhatsappCommand,
): AbsenceWhatsappTransition | null => {
  if (command === "EXPIRE") {
    return { nextState: "EXPIRED", replyKey: "session_expired", cancelSession: true };
  }
  if (command === "CANCELAR") {
    return { nextState: "CANCELLED", replyKey: "cancelled", cancelSession: true };
  }
  if (command === "AYUDA") {
    return { nextState: state, replyKey: "help" };
  }
  if (command === "INICIO") {
    return { nextState: "SELECTING_ACTION", replyKey: "menu" };
  }
  if (TERMINAL.has(state)) {
    return { nextState: "SELECTING_ACTION", replyKey: "menu_restart" };
  }

  switch (state) {
    case "IDLE":
    case "SELECTING_ACTION":
      if (command === "CREAR_AUSENCIA") {
        return { nextState: "SELECTING_ABSENCE_TYPE", replyKey: "ask_absence_type" };
      }
      if (command === "CONSULTAR_SALDO") {
        return { nextState: "SELECTING_ACTION", replyKey: "balance_summary" };
      }
      if (command === "VER_SOLICITUDES") {
        return { nextState: "SELECTING_ACTION", replyKey: "requests_list" };
      }
      return { nextState: "SELECTING_ACTION", replyKey: "menu" };

    case "SELECTING_ABSENCE_TYPE":
      if (command === "VOLVER") {
        return { nextState: "SELECTING_ACTION", replyKey: "menu" };
      }
      if (command === "SELECT_OPTION" || command === "SUBMIT_TEXT") {
        return { nextState: "ENTERING_START_DATE", replyKey: "ask_start_date" };
      }
      return null;

    case "ENTERING_START_DATE":
      if (command === "VOLVER") {
        return { nextState: "SELECTING_ABSENCE_TYPE", replyKey: "ask_absence_type" };
      }
      if (command === "SUBMIT_TEXT") {
        return { nextState: "ENTERING_END_DATE", replyKey: "ask_end_date" };
      }
      return null;

    case "ENTERING_END_DATE":
      if (command === "VOLVER") {
        return { nextState: "ENTERING_START_DATE", replyKey: "ask_start_date" };
      }
      if (command === "SUBMIT_TEXT") {
        return { nextState: "ENTERING_REASON", replyKey: "ask_reason" };
      }
      return null;

    case "ENTERING_REASON":
      if (command === "VOLVER") {
        return { nextState: "ENTERING_END_DATE", replyKey: "ask_end_date" };
      }
      if (command === "SUBMIT_TEXT") {
        return { nextState: "WAITING_ATTACHMENT", replyKey: "ask_attachment_or_skip" };
      }
      return null;

    case "WAITING_ATTACHMENT":
      if (command === "VOLVER") {
        return { nextState: "ENTERING_REASON", replyKey: "ask_reason" };
      }
      if (command === "SUBMIT_ATTACHMENT" || command === "SUBMIT_TEXT") {
        return { nextState: "REVIEWING_SUMMARY", replyKey: "show_summary" };
      }
      return null;

    case "REVIEWING_SUMMARY":
      if (command === "VOLVER") {
        return { nextState: "WAITING_ATTACHMENT", replyKey: "ask_attachment_or_skip" };
      }
      if (command === "CONFIRMAR") {
        return {
          nextState: "CONFIRMING_SUBMISSION",
          replyKey: "confirming",
          requireConfirmFingerprint: true,
        };
      }
      return null;

    case "CONFIRMING_SUBMISSION":
      if (command === "CONFIRMAR") {
        return {
          nextState: "COMPLETED",
          replyKey: "submitted",
          requireConfirmFingerprint: true,
        };
      }
      return { nextState: "REVIEWING_SUMMARY", replyKey: "fingerprint_changed" };

    case "ERROR_RECOVERY":
      return { nextState: "SELECTING_ACTION", replyKey: "menu_restart" };

    default:
      return null;
  }
};

export const buildConfirmationFingerprint = (input: {
  absenceTypeId: string;
  startDate: string;
  endDate: string;
  startPeriod: string;
  endPeriod: string;
  calendarVersion: number;
  balanceVersion: number;
  attachmentPolicy: string;
  inputHash: string;
}): string =>
  [
    input.absenceTypeId,
    input.startDate,
    input.endDate,
    input.startPeriod,
    input.endPeriod,
    String(input.calendarVersion),
    String(input.balanceVersion),
    input.attachmentPolicy,
    input.inputHash,
  ].join("|");
