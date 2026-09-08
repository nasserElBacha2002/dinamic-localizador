import type { BotIntent } from "../services/bot/bot-intent.parser";
import type { BotSessionIntent, BotSessionState } from "../types/twilio.types";

export const BOT_SESSION_INTENTS = [
  "MENU",
  "CHECK_IN",
  "CHECK_OUT",
  "PAYROLL_RECEIPT",
  "ABSENCE",
  "CONFIRM_ATTENDANCE",
  "REPORT_UNAVAILABILITY",
  "ATTENDANCE_CONFIRMATION_RESPONSE",
] as const satisfies readonly BotSessionIntent[];

const STATE_INTENT: Partial<Record<BotSessionState, BotSessionIntent>> = {
  WAITING_MENU_SELECTION: "MENU",
  WAITING_LOCATION: "CHECK_IN",
  WAITING_OPERATION_SELECTION: "CHECK_IN",
  WAITING_CHECKOUT_LOCATION: "CHECK_OUT",
  WAITING_CHECKOUT_OPERATION_SELECTION: "CHECK_OUT",
  WAITING_ABSENCE_TYPE: "ABSENCE",
  WAITING_ABSENCE_START_DATE: "ABSENCE",
  WAITING_ABSENCE_END_DATE: "ABSENCE",
  WAITING_ABSENCE_REASON: "ABSENCE",
  WAITING_ABSENCE_CONFIRMATION: "ABSENCE",
  WAITING_CONFIRM_ATTENDANCE_SELECTION: "CONFIRM_ATTENDANCE",
  WAITING_UNAVAILABILITY_SELECTION: "REPORT_UNAVAILABILITY",
  WAITING_ATTENDANCE_CONFIRMATION_RESPONSE: "ATTENDANCE_CONFIRMATION_RESPONSE",
  WAITING_PAYROLL_RECEIPT_PERIOD: "PAYROLL_RECEIPT",
};

export const isBotSessionIntent = (value: unknown): value is BotSessionIntent =>
  typeof value === "string" &&
  (BOT_SESSION_INTENTS as readonly string[]).includes(value);

export const inferHistoricalIntentFromState = (
  state: BotSessionState,
): BotSessionIntent | null => STATE_INTENT[state] ?? null;

export const isIntentStateCompatible = (
  intent: BotSessionIntent | null,
  state: BotSessionState,
): boolean => {
  const expected = STATE_INTENT[state];
  return expected ? intent === expected : intent === null;
};

const PARSER_INTENT: Partial<Record<BotSessionIntent, BotIntent>> = {
  MENU: "menu",
  CHECK_IN: "arrival",
  CHECK_OUT: "checkout",
  PAYROLL_RECEIPT: "payroll_receipt",
  ABSENCE: "absence",
  CONFIRM_ATTENDANCE: "confirm_attendance",
  REPORT_UNAVAILABILITY: "report_unavailability",
};

export const isExplicitIntentCompatibleWithSession = (
  explicitIntent: BotIntent,
  sessionIntent: BotSessionIntent | null,
): boolean => {
  if (sessionIntent === "ATTENDANCE_CONFIRMATION_RESPONSE") {
    return (
      explicitIntent === "confirm_attendance" ||
      explicitIntent === "report_unavailability"
    );
  }
  return sessionIntent ? PARSER_INTENT[sessionIntent] === explicitIntent : false;
};
