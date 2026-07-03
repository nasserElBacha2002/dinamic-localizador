import { botSessionService } from "../bot-session.service";
import { GLOBAL_CANCEL_MESSAGE } from "../bot/bot-response.builder";
import {
  buildGreetingMessage,
  buildHelpMessage,
  buildNoActiveFlowCancelMessage,
  buildVolverMessage,
} from "../bot/bot-menu.builder";
import {
  isGlobalBackCommand,
  isGlobalCancelCommand,
  isGlobalHelpCommand,
  isGlobalMenuCommand,
} from "../../utils/intent";
import { setLastDetectedIntent } from "../../utils/bot-runtime-context";
import type { WhatsAppRouterContext, WhatsAppRouterHandlers } from "./whatsapp-router.types";

export const tryHandleGlobalCommand = async (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
): Promise<string | null> => {
  const { companyId, employeeId, phoneFrom, phoneTo, moduleStates, session, body } = ctx;
  if (!employeeId) {
    return null;
  }

  const respond = (message: string) =>
    handlers.respond(companyId, {
      message,
      employeeId,
      phoneFrom: phoneTo,
      phoneTo: phoneFrom,
    });

  if (isGlobalCancelCommand(body)) {
    if (session) {
      await botSessionService.cancelSession(companyId, session.id);
      return respond(GLOBAL_CANCEL_MESSAGE);
    }

    setLastDetectedIntent("greeting");
    return respond(buildNoActiveFlowCancelMessage(moduleStates));
  }

  if (isGlobalBackCommand(body)) {
    setLastDetectedIntent("greeting");
    return respond(buildVolverMessage(moduleStates, Boolean(session)));
  }

  if (isGlobalHelpCommand(body)) {
    setLastDetectedIntent("greeting");
    return respond(buildHelpMessage(moduleStates, { hasActiveSession: Boolean(session) }));
  }

  if (isGlobalMenuCommand(body)) {
    setLastDetectedIntent("greeting");
    return respond(buildGreetingMessage(moduleStates, { hasActiveSession: Boolean(session) }));
  }

  return null;
};
