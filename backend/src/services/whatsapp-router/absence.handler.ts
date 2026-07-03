import { absenceBotService } from "../absence-bot.service";
import { ACTIVE_ATTENDANCE_FLOW_MESSAGE } from "../bot/bot-response.builder";
import { isAbsenceSessionState } from "../../utils/bot-session-states";
import { setLastDetectedIntent } from "../../utils/bot-runtime-context";
import { getAbsenceModuleBlockedMessage } from "../whatsapp-module-gate";
import { logModuleBlocked } from "./module-session-gate";
import type { WhatsAppRouterContext, WhatsAppRouterHandlers } from "./whatsapp-router.types";
import type { BotSession } from "../../types/twilio.types";

export const handleActiveAbsenceSession = async (
  ctx: WhatsAppRouterContext,
  session: BotSession,
  handlers: WhatsAppRouterHandlers,
): Promise<string> => {
  const boundRespond = (msg: Parameters<WhatsAppRouterHandlers["respond"]>[1]) =>
    handlers.respond(ctx.companyId, msg);

  return absenceBotService.handleAbsenceSession(ctx.companyId, {
    session,
    body: ctx.body,
    employeeId: ctx.employeeId!,
    phoneFrom: ctx.phoneFrom,
    phoneTo: ctx.phoneTo,
    messageSid: ctx.payload.MessageSid,
    respond: boundRespond,
  });
};

export const handleAbsenceIntent = async (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
  session: BotSession | null,
): Promise<string> => {
  setLastDetectedIntent("absence");
  const blockedMessage = getAbsenceModuleBlockedMessage(ctx.moduleStates);
  if (blockedMessage) {
    logModuleBlocked(ctx.companyId, "absences");
    return handlers.respond(ctx.companyId, {
      message: blockedMessage,
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
    });
  }

  if (absenceBotService.hasActiveAttendanceSession(session)) {
    return handlers.respond(ctx.companyId, {
      message: ACTIVE_ATTENDANCE_FLOW_MESSAGE,
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
    });
  }

  const boundRespond = (msg: Parameters<WhatsAppRouterHandlers["respond"]>[1]) =>
    handlers.respond(ctx.companyId, msg);

  return absenceBotService.startAbsenceFlow(ctx.companyId, {
    employeeId: ctx.employeeId!,
    phoneFrom: ctx.phoneFrom,
    phoneTo: ctx.phoneTo,
    body: ctx.body,
    respond: boundRespond,
  });
};

export const isAbsenceFlowSession = (session: BotSession | null): session is BotSession =>
  Boolean(session && isAbsenceSessionState(session.state));
