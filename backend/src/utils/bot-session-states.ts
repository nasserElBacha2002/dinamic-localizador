import type { BotSessionState } from "../types/twilio.types";

export const ACTIVE_BOT_SESSION_STATES = [
  "WAITING_LOCATION",
  "WAITING_INVENTORY_SELECTION",
  "WAITING_CHECKOUT_LOCATION",
  "WAITING_CHECKOUT_INVENTORY_SELECTION",
  "WAITING_ABSENCE_TYPE",
  "WAITING_ABSENCE_START_DATE",
  "WAITING_ABSENCE_END_DATE",
  "WAITING_ABSENCE_REASON",
  "WAITING_ABSENCE_CONFIRMATION",
  "WAITING_CONFIRM_ATTENDANCE_SELECTION",
  "WAITING_UNAVAILABILITY_SELECTION",
] as const satisfies readonly BotSessionState[];

export const ACTIVE_BOT_SESSION_STATES_SQL = `(${ACTIVE_BOT_SESSION_STATES.map((state) => `'${state}'`).join(", ")})`;

export const isCheckInSessionState = (state: BotSessionState): boolean =>
  state === "WAITING_LOCATION" || state === "WAITING_INVENTORY_SELECTION";

export const isCheckoutSessionState = (state: BotSessionState): boolean =>
  state === "WAITING_CHECKOUT_LOCATION" || state === "WAITING_CHECKOUT_INVENTORY_SELECTION";

export const isAbsenceSessionState = (state: BotSessionState): boolean =>
  state === "WAITING_ABSENCE_TYPE" ||
  state === "WAITING_ABSENCE_START_DATE" ||
  state === "WAITING_ABSENCE_END_DATE" ||
  state === "WAITING_ABSENCE_REASON" ||
  state === "WAITING_ABSENCE_CONFIRMATION";

export const isAssignmentSelectionSessionState = (state: BotSessionState): boolean =>
  state === "WAITING_CONFIRM_ATTENDANCE_SELECTION" ||
  state === "WAITING_UNAVAILABILITY_SELECTION";
