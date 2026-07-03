import { isAbsenceIntent } from "../../utils/absence-intent";
import {
  isCheckInIntent,
  isCheckoutIntent,
  isGlobalCancelCommand,
  isGlobalHelpCommand,
  isGlobalMenuCommand,
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

  if (isGlobalCancelCommand(body)) {
    return "cancel";
  }

  if (isGlobalHelpCommand(body)) {
    return "menu";
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

  if (isGlobalMenuCommand(body) || isSimpleGreeting(body)) {
    return "menu";
  }

  return "unknown";
};
