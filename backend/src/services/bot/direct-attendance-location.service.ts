import type { CompanyModuleKey } from "../../constants/company-modules";
import { COMPANY_MODULE_KEYS } from "../../constants/company-modules";
import type { BotSession } from "../../types/twilio.types";
import { getBotNow } from "../../utils/bot-runtime-context";
import { WHATSAPP_RESULT_CODES } from "../../constants/whatsapp-observability";
import { botSessionService } from "../bot-session.service";
import {
  getAttendanceModuleBlockedMessage,
  isModuleEnabledInStates,
} from "../whatsapp-module-gate";
import {
  buildCheckedInNeedsCheckoutIntentMessage,
  buildMixedAttendanceActionPrompt,
  buildWorkdaySelectionPrompt,
  MODULE_DISABLED_MESSAGE,
  NO_JUSTIFIED_ONLY_MESSAGE,
  NO_OPERATION_MESSAGE,
} from "./bot-response.builder";
import {
  listAvailableCheckInWorkdays,
  listOpenCheckoutWorkdays,
  mapCheckInCandidatesToSessionOptions,
  mapMixedAttendanceActionToSessionOptions,
} from "./bot-workday.selector";
import {
  resolveAttendanceLocationIntent,
  type AttendanceLocationIntent,
} from "./attendance-location-intent";

export type DirectLocationAttendanceHandlers = {
  processLocationCheckIn: (input: {
    companyId: string;
    session: BotSession;
    employeeId: string;
    employeeWorkdayId: string;
    operationId: string;
    latitude: number;
    longitude: number;
    messageSid: string;
    phoneFrom: string;
    phoneTo: string;
    eventAt?: Date;
  }) => Promise<string>;
  respond: (
    companyId: string,
    input: {
      message: string;
      employeeId: string;
      phoneFrom: string;
      phoneTo: string;
      resultCode?: string;
      flowType?: string;
    },
  ) => Promise<string>;
};

/**
 * Applies company module gates to a resolved LOCATION intent without silently
 * picking first(). OPERATIONS disabled drops check-in candidates only;
 * ATTENDANCE disabled blocks all attendance LOCATION flows.
 */
export const applyCompanyModulesToLocationIntent = (input: {
  intent: AttendanceLocationIntent;
  moduleStates: ReadonlyMap<CompanyModuleKey, boolean>;
  hasJustifiedWorkdayInWindow: boolean;
}): { intent: AttendanceLocationIntent; blockedMessage: string | null } => {
  const attendanceBlocked = getAttendanceModuleBlockedMessage(input.moduleStates);
  if (attendanceBlocked) {
    return { intent: input.intent, blockedMessage: attendanceBlocked };
  }

  const operationsEnabled = isModuleEnabledInStates(
    input.moduleStates,
    COMPANY_MODULE_KEYS.OPERATIONS,
  );

  if (operationsEnabled) {
    return { intent: input.intent, blockedMessage: null };
  }

  if (input.intent.kind === "CHECK_IN" || input.intent.kind === "AMBIGUOUS_CHECK_IN") {
    return { intent: input.intent, blockedMessage: MODULE_DISABLED_MESSAGE };
  }

  if (input.intent.kind !== "AMBIGUOUS_MIXED") {
    return { intent: input.intent, blockedMessage: null };
  }

  // OPERATIONS off: drop check-in options; remaining open checkout still needs "Me voy".
  const refined = resolveAttendanceLocationIntent({
    checkInCandidates: [],
    checkoutCandidates: input.intent.checkoutCandidates,
    hasJustifiedWorkdayInWindow: input.hasJustifiedWorkdayInWindow,
  });

  if (refined.kind === "NONE") {
    return { intent: refined, blockedMessage: MODULE_DISABLED_MESSAGE };
  }

  return { intent: refined, blockedMessage: null };
};

export const processDirectLocationAttendance = async (
  input: {
    companyId: string;
    employeeId: string;
    latitude: number;
    longitude: number;
    messageSid: string;
    phoneFrom: string;
    phoneTo: string;
    moduleStates: ReadonlyMap<CompanyModuleKey, boolean>;
  },
  handlers: DirectLocationAttendanceHandlers,
): Promise<string> => {
  const { companyId } = input;
  const eventAt = getBotNow();
  const [{ candidates: checkInCandidates, hasJustifiedWorkdayInWindow }, checkoutCandidates] =
    await Promise.all([
      listAvailableCheckInWorkdays(companyId, input.employeeId, eventAt),
      listOpenCheckoutWorkdays(companyId, input.employeeId, eventAt),
    ]);

  const rawIntent = resolveAttendanceLocationIntent({
    checkInCandidates,
    checkoutCandidates,
    hasJustifiedWorkdayInWindow,
  });

  const { intent, blockedMessage } = applyCompanyModulesToLocationIntent({
    intent: rawIntent,
    moduleStates: input.moduleStates,
    hasJustifiedWorkdayInWindow,
  });

  console.info("[whatsapp-bot] direct location intent resolved", {
    companyId,
    employeeId: input.employeeId,
    kind: intent.kind,
    rawKind: rawIntent.kind,
    checkInCount: checkInCandidates.length,
    checkoutCount: checkoutCandidates.length,
  });

  if (blockedMessage) {
    return handlers.respond(companyId, {
      message: blockedMessage,
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.MODULE_DISABLED,
      flowType: "CHECKIN",
    });
  }

  const pendingLocation = {
    latitude: input.latitude,
    longitude: input.longitude,
    messageSid: input.messageSid,
    receivedAt: eventAt.toISOString(),
  };

  if (intent.kind === "NONE") {
    return handlers.respond(companyId, {
      message: intent.hasJustifiedWorkdayInWindow
        ? NO_JUSTIFIED_ONLY_MESSAGE
        : NO_OPERATION_MESSAGE,
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.NO_AVAILABLE_EMPLOYEE_WORKDAY,
      flowType: "CHECKIN",
    });
  }

  if (intent.kind === "AMBIGUOUS_MIXED") {
    const options = mapMixedAttendanceActionToSessionOptions(
      intent.checkInCandidates,
      intent.checkoutCandidates,
    );
    await botSessionService.createOperationSelectionSession(companyId, {
      employeeId: input.employeeId,
      phoneNumber: input.phoneFrom,
      options,
      pendingLocation,
    });
    return handlers.respond(companyId, {
      message: buildMixedAttendanceActionPrompt({
        checkInCandidates: intent.checkInCandidates,
        checkoutCandidates: intent.checkoutCandidates,
      }),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  }

  if (intent.kind === "AMBIGUOUS_CHECK_IN") {
    const options = mapCheckInCandidatesToSessionOptions(intent.candidates);
    await botSessionService.createOperationSelectionSession(companyId, {
      employeeId: input.employeeId,
      phoneNumber: input.phoneFrom,
      options,
      pendingLocation,
    });
    return handlers.respond(companyId, {
      message: buildWorkdaySelectionPrompt(intent.candidates),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  }

  if (intent.kind === "NEEDS_CHECKOUT_INTENT") {
    // Bare LOCATION after check-in must not close the shift (different MessageSid still OK).
    return handlers.respond(companyId, {
      message: buildCheckedInNeedsCheckoutIntentMessage(intent.candidates),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.LOCATION_WITHOUT_ATTENDANCE_INTENT,
      flowType: "CHECKOUT",
    });
  }

  // CHECK_IN
  const workday = intent.candidate;
  const session = await botSessionService.createWaitingLocationSession(companyId, {
    employeeId: input.employeeId,
    phoneNumber: input.phoneFrom,
    operationId: workday.operationId,
    employeeWorkdayId: workday.employeeWorkdayId,
  });
  return handlers.processLocationCheckIn({
    companyId,
    session,
    employeeId: input.employeeId,
    employeeWorkdayId: workday.employeeWorkdayId,
    operationId: workday.operationId,
    latitude: input.latitude,
    longitude: input.longitude,
    messageSid: input.messageSid,
    phoneFrom: input.phoneFrom,
    phoneTo: input.phoneTo,
    eventAt,
  });
};
