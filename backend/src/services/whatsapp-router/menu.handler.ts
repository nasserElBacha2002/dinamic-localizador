import { WHATSAPP_RESULT_CODES } from "../../constants/whatsapp-observability";
import {
  buildAvailableMenuOptions,
  buildGreetingMessageFromSnapshot,
  buildInvalidMenuSelectionMessage,
  resolveMenuSnapshot,
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
  let snapshot = options.map((option) => option.key);
  if (ctx.employeeId && options.length > 0) {
    const persisted = await botSessionService.createMenuSelectionSession(ctx.companyId, {
      employeeId: ctx.employeeId,
      phoneNumber: ctx.phoneFrom,
      options: snapshot,
    });
    const persistedOptions = resolveMenuSnapshot(
      botSessionService.parseContext(persisted.contextJson).menuOptions,
    );
    if (persistedOptions) {
      snapshot = persistedOptions.map((option) => option.key);
    }
  }
  return handlers.respond(ctx.companyId, {
    message: buildGreetingMessageFromSnapshot(snapshot),
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
  const snapshot = resolveMenuSnapshot(context.menuOptions);
  const currentlyAllowed = new Set(
    buildAvailableMenuOptions(ctx.moduleStates).map((option) => option.key),
  );
  if (!snapshot || snapshot.some((option) => !currentlyAllowed.has(option.key))) {
    const consumed = await botSessionService.cancelSession(ctx.companyId, session.id, session);
    if (!consumed) {
      return handlers.respond(ctx.companyId, {
        message: "El menú cambió mientras procesábamos tu respuesta. Escribí “Menú” para verlo.",
        employeeId: ctx.employeeId,
        phoneFrom: ctx.phoneTo,
        phoneTo: ctx.phoneFrom,
        resultCode: WHATSAPP_RESULT_CODES.INVALID_SELECTION,
        flowType: "MENU",
      });
    }
    return handleMenuFallback({ ...ctx, session: null }, handlers);
  }
  const snapshotKeys = snapshot.map((option) => option.key);
  const optionKey =
    ctx.body
      ? resolveMenuSnapshotSelection(ctx.body, snapshotKeys)
      : null;
  if (!optionKey) {
    const retry = await recordInvalidContextualInput({
      companyId: ctx.companyId,
      session,
      messageSid: ctx.payload.MessageSid,
      retryMessage: buildInvalidMenuSelectionMessage(snapshotKeys),
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

  const consumed = await botSessionService.cancelSession(ctx.companyId, session.id, session);
  if (!consumed) {
    return handlers.respond(ctx.companyId, {
      message: "El menú ya fue procesado. Revisá el último mensaje del bot.",
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.INVALID_SELECTION,
      flowType: "MENU",
    });
  }
  return routeMenuOptionByKey(ctx, handlers, optionKey);
};
