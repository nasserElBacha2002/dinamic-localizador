import {
  ACTIVE_ATTENDANCE_FLOW_MESSAGE,
  LOCATION_DURING_SELECTION_MESSAGE,
  WAITING_LOCATION_TEXT_MESSAGE,
} from "../bot/bot-response.builder";
import { isAbsenceSessionState } from "../../utils/bot-session-states";
import { setLastDetectedIntent } from "../../utils/bot-runtime-context";
import { getCheckInModuleBlockedMessage } from "../whatsapp-module-gate";
import { logModuleBlocked } from "./module-session-gate";
import type { WhatsAppRouterContext, WhatsAppRouterHandlers } from "./whatsapp-router.types";
import type { BotSession } from "../../types/twilio.types";

export const handleActiveCheckInTextSession = async (
  ctx: WhatsAppRouterContext,
  session: BotSession,
  handlers: WhatsAppRouterHandlers,
): Promise<string | null> => {
  if (session.state === "WAITING_INVENTORY_SELECTION") {
    return handlers.handleInventorySelection({
      companyId: ctx.companyId,
      session,
      body: ctx.body,
      employeeId: ctx.employeeId!,
      phoneFrom: ctx.phoneFrom,
      phoneTo: ctx.phoneTo,
    });
  }

  if (session.state === "WAITING_LOCATION") {
    return handlers.respond(ctx.companyId, {
      message: WAITING_LOCATION_TEXT_MESSAGE,
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
    });
  }

  return null;
};

export const handleArrivalIntent = async (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
  session: BotSession | null,
): Promise<string> => {
  setLastDetectedIntent("check-in");
  const blockedMessage = getCheckInModuleBlockedMessage(ctx.moduleStates);
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

  return handlers.startCheckIn({
    companyId: ctx.companyId,
    employeeId: ctx.employeeId!,
    phoneFrom: ctx.phoneFrom,
    phoneTo: ctx.phoneTo,
  });
};

export const handleCheckInLocation = async (
  ctx: WhatsAppRouterContext,
  session: BotSession,
  handlers: WhatsAppRouterHandlers,
): Promise<string | null> => {
  if (session.state === "WAITING_INVENTORY_SELECTION") {
    return handlers.respond(ctx.companyId, {
      message: LOCATION_DURING_SELECTION_MESSAGE,
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
    });
  }

  if (session.state !== "WAITING_LOCATION" || !session.operationId) {
    return null;
  }

  return handlers.processLocationCheckIn({
    companyId: ctx.companyId,
    session,
    employeeId: ctx.employeeId!,
    operationId: session.operationId,
    latitude: Number(ctx.payload.Latitude),
    longitude: Number(ctx.payload.Longitude),
    messageSid: ctx.payload.MessageSid,
    phoneFrom: ctx.phoneFrom,
    phoneTo: ctx.phoneTo,
  });
};
