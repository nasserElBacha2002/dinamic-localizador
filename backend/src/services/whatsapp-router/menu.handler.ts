import { buildGreetingMessage } from "../bot/bot-menu.builder";
import { setLastDetectedIntent } from "../../utils/bot-runtime-context";
import type { WhatsAppRouterContext, WhatsAppRouterHandlers } from "./whatsapp-router.types";

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
