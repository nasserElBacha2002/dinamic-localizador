import type { BotSessionState } from "../types/twilio.types";

export const ACTIVE_BOT_SESSION_STATES = [
  "WAITING_LOCATION",
  "WAITING_INVENTORY_SELECTION",
  "WAITING_CHECKOUT_LOCATION",
  "WAITING_CHECKOUT_INVENTORY_SELECTION",
] as const satisfies readonly BotSessionState[];

export const ACTIVE_BOT_SESSION_STATES_SQL = `(${ACTIVE_BOT_SESSION_STATES.map((state) => `'${state}'`).join(", ")})`;

export const isCheckInSessionState = (state: BotSessionState): boolean =>
  state === "WAITING_LOCATION" || state === "WAITING_INVENTORY_SELECTION";

export const isCheckoutSessionState = (state: BotSessionState): boolean =>
  state === "WAITING_CHECKOUT_LOCATION" || state === "WAITING_CHECKOUT_INVENTORY_SELECTION";
