import { employeeWorkdayService } from "../employee-workday.service";
import { getUpcomingAssignmentsModuleBlockedMessage } from "../whatsapp-module-gate";
import { logModuleBlocked } from "./module-session-gate";
import { setLastDetectedIntent } from "../../utils/bot-runtime-context";
import type { WhatsAppRouterContext, WhatsAppRouterHandlers } from "./whatsapp-router.types";

export const handleUpcomingAssignmentsIntent = async (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
): Promise<string> => {
  setLastDetectedIntent("upcoming-assignments");
  const blockedMessage = getUpcomingAssignmentsModuleBlockedMessage(ctx.moduleStates);
  if (blockedMessage) {
    logModuleBlocked(ctx.companyId, "inventory_operations");
    return handlers.respond(ctx.companyId, {
      message: blockedMessage,
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
    });
  }

  const message = await employeeWorkdayService.buildUpcomingAssignmentsMessage(
    ctx.companyId,
    ctx.employeeId!,
  );

  return handlers.respond(ctx.companyId, {
    message,
    employeeId: ctx.employeeId,
    phoneFrom: ctx.phoneTo,
    phoneTo: ctx.phoneFrom,
  });
};
