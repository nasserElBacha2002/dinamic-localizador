import { WHATSAPP_RESULT_CODES } from "../../constants/whatsapp-observability";
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
      resultCode: WHATSAPP_RESULT_CODES.MODULE_DISABLED,
      flowType: "WORKDAY_QUERY",
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
    resultCode: WHATSAPP_RESULT_CODES.WORKDAY_QUERY_COMPLETED,
    flowType: "WORKDAY_QUERY",
  });
};
