import { isAbsenceIntent } from "../../utils/absence-intent";
import {
  isConfirmAttendanceIntent,
  isUnavailabilityIntent,
  isUpcomingAssignmentsIntent,
  isWorkdayQueryIntent,
} from "../../utils/assignment-intent";
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
  | "workday"
  | "upcoming_assignments"
  | "confirm_attendance"
  | "report_unavailability"
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

  if (isConfirmAttendanceIntent(body)) {
    return "confirm_attendance";
  }

  if (isUnavailabilityIntent(body)) {
    return "report_unavailability";
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

  if (isWorkdayQueryIntent(body)) {
    return "workday";
  }

  if (isUpcomingAssignmentsIntent(body)) {
    return "upcoming_assignments";
  }

  if (isGlobalMenuCommand(body) || isSimpleGreeting(body)) {
    return "menu";
  }

  return "unknown";
};
