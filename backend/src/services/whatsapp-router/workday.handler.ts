import { employeeWorkdayService } from "../employee-workday.service";
import { getWorkdayModuleBlockedMessage } from "../whatsapp-module-gate";
import { logModuleBlocked } from "./module-session-gate";
import { setLastDetectedIntent } from "../../utils/bot-runtime-context";
import type { WhatsAppRouterContext, WhatsAppRouterHandlers } from "./whatsapp-router.types";

export const handleWorkdayIntent = async (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
): Promise<string> => {
  setLastDetectedIntent("workday");
  const blockedMessage = getWorkdayModuleBlockedMessage(ctx.moduleStates);
  if (blockedMessage) {
    logModuleBlocked(ctx.companyId, "attendance");
    return handlers.respond(ctx.companyId, {
      message: blockedMessage,
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
    });
  }

  const message = await employeeWorkdayService.buildTodayWorkdayMessage(
    ctx.companyId,
    ctx.employeeId!,
    true,
  );

  return handlers.respond(ctx.companyId, {
    message,
    employeeId: ctx.employeeId,
    phoneFrom: ctx.phoneTo,
    phoneTo: ctx.phoneFrom,
  });
};
