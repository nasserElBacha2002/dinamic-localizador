import {
  ACTIVE_ATTENDANCE_FLOW_MESSAGE,
  LOCATION_DURING_CHECKOUT_SELECTION_MESSAGE,
  WAITING_CHECKOUT_LOCATION_TEXT_MESSAGE,
} from "../bot/bot-response.builder";
import { isAbsenceSessionState } from "../../utils/bot-session-states";
import { setLastDetectedIntent } from "../../utils/bot-runtime-context";
import { getAttendanceModuleBlockedMessage } from "../whatsapp-module-gate";
import { logModuleBlocked } from "./module-session-gate";
import type { WhatsAppRouterContext, WhatsAppRouterHandlers } from "./whatsapp-router.types";
import type { BotSession } from "../../types/twilio.types";

export const handleActiveCheckoutTextSession = async (
  ctx: WhatsAppRouterContext,
  session: BotSession,
  handlers: WhatsAppRouterHandlers,
): Promise<string | null> => {
  if (session.state === "WAITING_CHECKOUT_INVENTORY_SELECTION") {
    return handlers.handleCheckoutInventorySelection({
      companyId: ctx.companyId,
      session,
      body: ctx.body,
      employeeId: ctx.employeeId!,
      phoneFrom: ctx.phoneFrom,
      phoneTo: ctx.phoneTo,
      messageSid: ctx.payload.MessageSid,
    });
  }

  if (session.state === "WAITING_CHECKOUT_LOCATION") {
    return handlers.respond(ctx.companyId, {
      message: WAITING_CHECKOUT_LOCATION_TEXT_MESSAGE,
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
    });
  }

  return null;
};

export const handleCheckoutIntent = async (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
  session: BotSession | null,
): Promise<string> => {
  setLastDetectedIntent("checkout");
  const blockedMessage = getAttendanceModuleBlockedMessage(ctx.moduleStates);
  if (blockedMessage) {
    logModuleBlocked(ctx.companyId, "attendance");
    return handlers.respond(ctx.companyId, {
      message: blockedMessage,
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
    });
  }

  if (session && isAbsenceSessionState(session.state)) {
    return handlers.respond(ctx.companyId, {
      message: ACTIVE_ATTENDANCE_FLOW_MESSAGE,
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
    });
  }

  return handlers.startCheckout({
    companyId: ctx.companyId,
    employeeId: ctx.employeeId!,
    phoneFrom: ctx.phoneFrom,
    phoneTo: ctx.phoneTo,
    messageSid: ctx.payload.MessageSid,
  });
};

export const handleCheckoutLocation = async (
  ctx: WhatsAppRouterContext,
  session: BotSession,
  handlers: WhatsAppRouterHandlers,
): Promise<string | null> => {
  if (session.state === "WAITING_CHECKOUT_INVENTORY_SELECTION") {
    return handlers.respond(ctx.companyId, {
      message: LOCATION_DURING_CHECKOUT_SELECTION_MESSAGE,
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
    });
  }

  if (session.state !== "WAITING_CHECKOUT_LOCATION" || !session.inventoryId) {
    return null;
  }

  return handlers.processLocationCheckout({
    companyId: ctx.companyId,
    session,
    employeeId: ctx.employeeId!,
    inventoryId: session.inventoryId,
    latitude: Number(ctx.payload.Latitude),
    longitude: Number(ctx.payload.Longitude),
    messageSid: ctx.payload.MessageSid,
    phoneFrom: ctx.phoneFrom,
    phoneTo: ctx.phoneTo,
  });
};
