import { WHATSAPP_RESULT_CODES } from "../../constants/whatsapp-observability";
import { absenceTypeRepository } from "../../repositories/absence-type.repository";
import { absenceBotService } from "../absence-bot.service";
import { ACTIVE_ATTENDANCE_FLOW_MESSAGE, MODULE_DISABLED_MESSAGE } from "../bot/bot-response.builder";
import {
  buildAvailableAbsenceKindOptions,
  buildInvalidAbsenceKindSelectionMessage,
  resolveAbsenceKindSelection,
  resolveAbsenceKindSnapshot,
} from "../bot/absence-kind-options";
import { detectAbsenceTypeCode } from "../../utils/absence-intent";
import {
  isAbsenceKindSelectionSessionState,
  isAbsenceSessionState,
} from "../../utils/bot-session-states";
import { setLastDetectedIntent } from "../../utils/bot-runtime-context";
import {
  getAbsenceModuleBlockedMessage,
  getAssignmentConfirmationModuleBlockedMessage,
} from "../whatsapp-module-gate";
import { botSessionService } from "../bot-session.service";
import { recordInvalidContextualInput } from "../contextual-session-retry.service";
import { logModuleBlocked } from "./module-session-gate";
import { handleUnavailabilityIntent } from "./assignment-confirmation.handler";
import type { WhatsAppRouterContext, WhatsAppRouterHandlers } from "./whatsapp-router.types";
import type { AbsenceKindOption } from "../bot/absence-kind-options";
import type { BotSession } from "../../types/twilio.types";

const filterInactiveVacationKindOption = async (
  companyId: string,
  kinds: AbsenceKindOption[],
): Promise<AbsenceKindOption[]> => {
  if (!kinds.some((option) => option.key === "vacation")) {
    return kinds;
  }
  const vacationType = await absenceTypeRepository.findByCode(companyId, "VACATION");
  if (vacationType?.isActive) {
    return kinds;
  }
  return kinds.filter((option) => option.key !== "vacation");
};

const bindAbsenceRespond = (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
) => {
  return (msg: Parameters<WhatsAppRouterHandlers["respond"]>[1]) =>
    handlers.respond(ctx.companyId, {
      ...msg,
      resultCode: msg.resultCode ?? WHATSAPP_RESULT_CODES.ABSENCE_FLOW,
      flowType: msg.flowType ?? "ABSENCE",
    });
};

const respondModuleBlocked = (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
  moduleKey: "absences" | "operations",
  message: string = MODULE_DISABLED_MESSAGE,
) => {
  logModuleBlocked(ctx.companyId, moduleKey);
  return handlers.respond(ctx.companyId, {
    message,
    employeeId: ctx.employeeId,
    phoneFrom: ctx.phoneTo,
    phoneTo: ctx.phoneFrom,
    resultCode: WHATSAPP_RESULT_CODES.MODULE_DISABLED,
    flowType: "ABSENCE",
  });
};

const dispatchAbsenceKind = async (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
  kind: "single_workday" | "absence" | "vacation",
  session: BotSession | null,
): Promise<string> => {
  const respond = bindAbsenceRespond(ctx, handlers);

  if (kind === "single_workday") {
    if (getAssignmentConfirmationModuleBlockedMessage(ctx.moduleStates)) {
      return respondModuleBlocked(ctx, handlers, "operations");
    }
    if (session) {
      await botSessionService.cancelSession(ctx.companyId, session.id, session);
    }
    return handleUnavailabilityIntent(ctx, handlers);
  }

  if (getAbsenceModuleBlockedMessage(ctx.moduleStates)) {
    return respondModuleBlocked(ctx, handlers, "absences");
  }

  if (kind === "vacation") {
    if (session) {
      return absenceBotService.continueVacationFromKindSelection(ctx.companyId, {
        session,
        employeeId: ctx.employeeId!,
        phoneFrom: ctx.phoneFrom,
        phoneTo: ctx.phoneTo,
        respond,
      });
    }
    return absenceBotService.startVacationAbsenceFlow(ctx.companyId, {
      employeeId: ctx.employeeId!,
      phoneFrom: ctx.phoneFrom,
      phoneTo: ctx.phoneTo,
      respond,
    });
  }

  if (session) {
    return absenceBotService.continueAbsenceTypeSelection(ctx.companyId, {
      session,
      employeeId: ctx.employeeId!,
      phoneFrom: ctx.phoneFrom,
      phoneTo: ctx.phoneTo,
      respond,
    });
  }

  return absenceBotService.startAbsenceFlow(ctx.companyId, {
    employeeId: ctx.employeeId!,
    phoneFrom: ctx.phoneFrom,
    phoneTo: ctx.phoneTo,
    body: ctx.body,
    excludeVacationType: true,
    respond,
  });
};

export const handleActiveAbsenceSession = async (
  ctx: WhatsAppRouterContext,
  session: BotSession,
  handlers: WhatsAppRouterHandlers,
): Promise<string> => {
  if (isAbsenceKindSelectionSessionState(session.state)) {
    const context = botSessionService.parseContext(session.contextJson);
    const snapshot = resolveAbsenceKindSnapshot(context.absenceKindOptions);
    const currentlyAllowed = await filterInactiveVacationKindOption(
      ctx.companyId,
      buildAvailableAbsenceKindOptions(ctx.moduleStates),
    );
    const currentlyAllowedKeys = new Set(currentlyAllowed.map((option) => option.key));

    if (!snapshot || snapshot.some((option) => !currentlyAllowedKeys.has(option.key))) {
      await botSessionService.cancelSession(ctx.companyId, session.id, session);
      return handleAbsenceIntent({ ...ctx, session: null }, handlers, null);
    }

    const kind = resolveAbsenceKindSelection(
      ctx.body,
      snapshot.map((option) => option.key),
    );
    if (!kind) {
      const retry = await recordInvalidContextualInput({
        companyId: ctx.companyId,
        session,
        messageSid: ctx.payload.MessageSid,
        retryMessage: buildInvalidAbsenceKindSelectionMessage(snapshot),
      });
      return handlers.respond(ctx.companyId, {
        message: retry.message,
        employeeId: ctx.employeeId,
        phoneFrom: ctx.phoneTo,
        phoneTo: ctx.phoneFrom,
        resultCode: WHATSAPP_RESULT_CODES.INVALID_SELECTION,
        flowType: "ABSENCE",
      });
    }

    return dispatchAbsenceKind(ctx, handlers, kind, session);
  }

  const boundRespond = bindAbsenceRespond(ctx, handlers);

  return absenceBotService.handleAbsenceSession(ctx.companyId, {
    session,
    body: ctx.body,
    employeeId: ctx.employeeId!,
    phoneFrom: ctx.phoneFrom,
    phoneTo: ctx.phoneTo,
    messageSid: ctx.payload.MessageSid,
    webhookPayload: ctx.payload as Record<string, unknown>,
    respond: boundRespond,
  });
};

export const handleAbsenceIntent = async (
  ctx: WhatsAppRouterContext,
  handlers: WhatsAppRouterHandlers,
  session: BotSession | null,
): Promise<string> => {
  setLastDetectedIntent("absence");

  const absenceBlocked = getAbsenceModuleBlockedMessage(ctx.moduleStates);
  const unavailabilityBlocked = getAssignmentConfirmationModuleBlockedMessage(ctx.moduleStates);
  if (absenceBlocked && unavailabilityBlocked) {
    logModuleBlocked(ctx.companyId, "absences");
    return handlers.respond(ctx.companyId, {
      message: absenceBlocked,
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.MODULE_DISABLED,
      flowType: "ABSENCE",
    });
  }

  if (absenceBotService.hasActiveAttendanceSession(session)) {
    return handlers.respond(ctx.companyId, {
      message: ACTIVE_ATTENDANCE_FLOW_MESSAGE,
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.INVALID_SELECTION,
      flowType: "ABSENCE",
    });
  }

  const boundRespond = bindAbsenceRespond(ctx, handlers);

  // Keep textual shortcuts (e.g. "vacaciones") when absences module is enabled.
  if (!absenceBlocked) {
    const detectedCode = detectAbsenceTypeCode(ctx.body);
    if (detectedCode && detectedCode !== "GENERIC" && detectedCode !== "OTHER") {
      return absenceBotService.startAbsenceFlow(ctx.companyId, {
        employeeId: ctx.employeeId!,
        phoneFrom: ctx.phoneFrom,
        phoneTo: ctx.phoneTo,
        body: ctx.body,
        respond: boundRespond,
      });
    }
  }

  const kinds = await filterInactiveVacationKindOption(
    ctx.companyId,
    buildAvailableAbsenceKindOptions(ctx.moduleStates),
  );
  if (kinds.length === 0) {
    return handlers.respond(ctx.companyId, {
      message: absenceBlocked ?? unavailabilityBlocked ?? MODULE_DISABLED_MESSAGE,
      employeeId: ctx.employeeId,
      phoneFrom: ctx.phoneTo,
      phoneTo: ctx.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.MODULE_DISABLED,
      flowType: "ABSENCE",
    });
  }

  if (kinds.length === 1) {
    return dispatchAbsenceKind(ctx, handlers, kinds[0].key, null);
  }

  return absenceBotService.startAbsenceKindSelection(ctx.companyId, {
    employeeId: ctx.employeeId!,
    phoneFrom: ctx.phoneFrom,
    phoneTo: ctx.phoneTo,
    kindKeys: kinds.map((option) => option.key),
    respond: boundRespond,
  });
};

export const isAbsenceFlowSession = (session: BotSession | null): session is BotSession =>
  Boolean(session && isAbsenceSessionState(session.state));
