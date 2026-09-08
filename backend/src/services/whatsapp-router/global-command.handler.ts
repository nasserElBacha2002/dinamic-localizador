import { botSessionService } from "../bot-session.service";
import { GLOBAL_CANCEL_MESSAGE } from "../bot/bot-response.builder";
import {
  buildAvailableMenuOptions,
  buildHelpMessage,
  buildNoActiveFlowCancelMessage,
} from "../bot/bot-menu.builder";
import {
  isGlobalBackCommand,
  isGlobalCancelCommand,
  isGlobalHelpCommand,
  isGlobalMenuCommand,
} from "../../utils/intent";
import { setLastDetectedIntent } from "../../utils/bot-runtime-context";
import type { WhatsAppRouterContext, WhatsAppRouterHandlers } from "./whatsapp-router.types";
import { handleMenuFallback } from "./menu.handler";

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
      await botSessionService.cancelSession(companyId, session.id, session);
      return respond(GLOBAL_CANCEL_MESSAGE);
    }

    setLastDetectedIntent("greeting");
    await botSessionService.createMenuSelectionSession(companyId, {
      employeeId,
      phoneNumber: phoneFrom,
      options: buildAvailableMenuOptions(moduleStates).map((option) => option.key),
    });
    return respond(buildNoActiveFlowCancelMessage(moduleStates));
  }

  if (isGlobalBackCommand(body)) {
    if (session) {
      await botSessionService.cancelSession(companyId, session.id, session);
    }
    setLastDetectedIntent("greeting");
    return handleMenuFallback({ ...ctx, session: null }, handlers);
  }

  if (isGlobalHelpCommand(body)) {
    setLastDetectedIntent("greeting");
    if (!session) {
      await botSessionService.createMenuSelectionSession(companyId, {
        employeeId,
        phoneNumber: phoneFrom,
        options: buildAvailableMenuOptions(moduleStates).map((option) => option.key),
      });
    }
    return respond(buildHelpMessage(moduleStates, { hasActiveSession: Boolean(session) }));
  }

  if (isGlobalMenuCommand(body)) {
    if (session) {
      await botSessionService.cancelSession(companyId, session.id, session);
    }
    setLastDetectedIntent("greeting");
    return handleMenuFallback({ ...ctx, session: null }, handlers);
  }

  return null;
};
