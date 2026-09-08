import { WHATSAPP_RESULT_CODES } from "../../constants/whatsapp-observability";
import {
  buildAvailableMenuOptions,
  buildGreetingMessage,
  buildInvalidMenuSelectionMessage,
  resolveMenuSnapshotSelection,
  type BotMenuOptionKey,
} from "../bot/bot-menu.builder";
import { botSessionService } from "../bot-session.service";
import { setLastDetectedIntent } from "../../utils/bot-runtime-context";
import type { BotSession } from "../../types/twilio.types";
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
import { handlePayrollReceiptIntent } from "./payroll-receipt.handler";
import { recordInvalidContextualInput } from "../contextual-session-retry.service";

export const handleMenuFallback = async (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
): Promise<string> => {
  setLastDetectedIntent("greeting");
  const options = buildAvailableMenuOptions(ctx.moduleStates);
  if (ctx.employeeId && options.length > 0) {
    await botSessionService.createMenuSelectionSession(ctx.companyId, {
      employeeId: ctx.employeeId,
      phoneNumber: ctx.phoneFrom,
      options: options.map((option) => option.key),
    });
  }
  return handlers.respond(ctx.companyId, {
    message: buildGreetingMessage(ctx.moduleStates),
    employeeId: ctx.employeeId,
    phoneFrom: ctx.phoneTo,
    phoneTo: ctx.phoneFrom,
    resultCode: WHATSAPP_RESULT_CODES.MENU_SHOWN,
    flowType: "MENU",
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
    case "payroll_receipt":
      return handlePayrollReceiptIntent(ctx, handlers);
  }
};

export const handleActiveMenuSelection = async (
  ctx: WhatsAppRouterContext,
  session: BotSession,
  handlers: WhatsAppRouterHandlers,
): Promise<string | null> => {
  if (session.state !== "WAITING_MENU_SELECTION") {
    return null;
  }

  const context = botSessionService.parseContext(session.contextJson);
  const optionKey =
    ctx.body && context.menuOptions
      ? resolveMenuSnapshotSelection(ctx.body, context.menuOptions)
      : null;
  if (!optionKey) {
    const retry = await recordInvalidContextualInput({
      companyId: ctx.companyId,
      session,
      messageSid: ctx.payload.MessageSid,
      retryMessage: buildInvalidMenuSelectionMessage(ctx.moduleStates),
    });
    return handlers.respond(ctx.companyId, {
      message: retry.message,
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.INVALID_SELECTION,
      flowType: "MENU",
    });
  }

  await botSessionService.cancelSession(ctx.companyId, session.id);
  return routeMenuOptionByKey(ctx, handlers, optionKey);
};
