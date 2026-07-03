import type { CompanyModuleKey } from "../../constants/company-modules";
import type { BotSession } from "../../types/twilio.types";
import {
  isAbsenceSessionState,
  isAssignmentSelectionSessionState,
  isCheckInSessionState,
  isCheckoutSessionState,
} from "../../utils/bot-session-states";
import { getModuleBlockedMessageForSessionState } from "../bot/bot-menu.builder";
import type { WhatsAppRouterHandlers, WhatsAppRouterRespondInput } from "./whatsapp-router.types";

export const logModuleBlocked = (companyId: string, moduleKey: CompanyModuleKey): void => {
  console.info("[whatsapp-bot] module blocked", { companyId, moduleKey });
};

export const respondIfActiveSessionModuleBlocked = async (
  companyId: string,
  session: BotSession,
  moduleStates: ReadonlyMap<CompanyModuleKey, boolean>,
  employeeId: string,
  phoneTo: string,
  phoneFrom: string,
  respond: WhatsAppRouterHandlers["respond"],
): Promise<string | null> => {
  const blockedMessage = getModuleBlockedMessageForSessionState(session.state, moduleStates);
  if (!blockedMessage) {
    return null;
  }

  if (isCheckInSessionState(session.state)) {
    logModuleBlocked(companyId, "attendance");
  } else if (isCheckoutSessionState(session.state)) {
    logModuleBlocked(companyId, "attendance");
  } else if (isAbsenceSessionState(session.state)) {
    logModuleBlocked(companyId, "absences");
  } else if (isAssignmentSelectionSessionState(session.state)) {
    logModuleBlocked(companyId, "inventory_operations");
  }

  const input: WhatsAppRouterRespondInput = {
    message: blockedMessage,
    employeeId,
    phoneFrom: phoneTo,
    phoneTo: phoneFrom,
  };
  return respond(companyId, input);
};
