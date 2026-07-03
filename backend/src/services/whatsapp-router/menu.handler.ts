import {
  buildGreetingMessage,
  buildInvalidMenuSelectionMessage,
  isNumericMenuInput,
  resolveMenuNumberSelection,
  type BotMenuOptionKey,
} from "../bot/bot-menu.builder";
import { setLastDetectedIntent } from "../../utils/bot-runtime-context";
import type { WhatsAppRouterContext, WhatsAppRouterHandlers } from "./whatsapp-router.types";
import { handleAbsenceIntent } from "./absence.handler";
import {
  handleConfirmAttendanceIntent,
  handleUnavailabilityIntent,
} from "./assignment-confirmation.handler";
import { handleArrivalIntent } from "./attendance.handler";
import { handleCheckoutIntent } from "./checkout.handler";
import { handleUpcomingAssignmentsIntent } from "./upcoming-assignments.handler";
import { handleWorkdayIntent } from "./workday.handler";

export const handleMenuFallback = async (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
): Promise<string> => {
  setLastDetectedIntent("greeting");
  return handlers.respond(ctx.companyId, {
    message: buildGreetingMessage(ctx.moduleStates),
    employeeId: ctx.employeeId,
    phoneFrom: ctx.phoneTo,
    phoneTo: ctx.phoneFrom,
  });
};

const routeMenuOptionByKey = async (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
  optionKey: BotMenuOptionKey,
): Promise<string> => {
  switch (optionKey) {
    case "check_in":
      return handleArrivalIntent(ctx, handlers, ctx.session);
    case "checkout":
      return handleCheckoutIntent(ctx, handlers, ctx.session);
    case "absence":
      return handleAbsenceIntent(ctx, handlers, ctx.session);
    case "workday":
      return handleWorkdayIntent(ctx, handlers);
    case "upcoming_assignments":
      return handleUpcomingAssignmentsIntent(ctx, handlers);
    case "confirm_attendance":
      return handleConfirmAttendanceIntent(ctx, handlers);
    case "report_unavailability":
      return handleUnavailabilityIntent(ctx, handlers);
  }
};

export const handleNumericMenuSelection = async (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
): Promise<string | null> => {
  if (!ctx.body || !isNumericMenuInput(ctx.body)) {
    return null;
  }

  const optionKey = resolveMenuNumberSelection(ctx.body, ctx.moduleStates);
  if (!optionKey) {
    return handlers.respond(ctx.companyId, {
      message: buildInvalidMenuSelectionMessage(ctx.moduleStates),
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
    });
  }

  return routeMenuOptionByKey(ctx, handlers, optionKey);
};
