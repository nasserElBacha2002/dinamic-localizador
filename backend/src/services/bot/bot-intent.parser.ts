import { isAbsenceCancelIntent, isAbsenceIntent } from "../../utils/absence-intent";
import {
  isCheckInIntent,
  isCheckoutIntent,
  isSimpleGreeting,
  parseInventorySelection,
} from "../../utils/intent";

export type BotIntent =
  | "arrival"
  | "checkout"
  | "menu"
  | "absence"
  | "location"
  | "inventory_selection"
  | "cancel"
  | "unknown";

export const parseBotIntent = (input: {
  body?: string | null;
  hasLocation?: boolean;
}): BotIntent => {
  if (input.hasLocation) {
    return "location";
  }

  const body = input.body?.trim() ?? "";
  if (!body) {
    return "unknown";
  }

  if (isAbsenceCancelIntent(body)) {
    return "cancel";
  }

  if (parseInventorySelection(body) !== null) {
    return "inventory_selection";
  }

  if (isCheckoutIntent(body)) {
    return "checkout";
  }

  if (isCheckInIntent(body)) {
    return "arrival";
  }

  if (isAbsenceIntent(body)) {
    return "absence";
  }

  if (isSimpleGreeting(body)) {
    return "menu";
  }

  return "unknown";
};
