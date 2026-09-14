import {
  CRITICAL_FLOW_TYPES,
  CRITICAL_RESOLVED_INTENTS,
  CRITICAL_SESSION_STATES,
  LIMITED_FLOW_TYPES,
  LIMITED_RESOLVED_INTENTS,
  LIMITED_SESSION_STATES,
  WHATSAPP_TURN_CLASSIFICATION_RULE_VERSION,
} from "../constants/whatsapp-turn-classification";
import type {
  SystemInteractionContext,
  TurnClassificationInput,
  TurnClassificationResult,
} from "../types/whatsapp-turn-classification";

const isIn = (value: string | null | undefined, list: readonly string[]): boolean =>
  Boolean(value && list.includes(value));

const isCriticalSession = (state: string | null | undefined): boolean =>
  isIn(state, CRITICAL_SESSION_STATES);

const isLimitedSession = (state: string | null | undefined): boolean =>
  isIn(state, LIMITED_SESSION_STATES);

const result = (
  partial: Omit<TurnClassificationResult, "ruleVersion">,
): TurnClassificationResult => ({
  ...partial,
  ruleVersion: WHATSAPP_TURN_CLASSIFICATION_RULE_VERSION,
});

const isInteractionActiveAt = (
  interaction: SystemInteractionContext,
  input: TurnClassificationInput,
  nowMs: number,
): boolean =>
  interaction.status === "ACTIVE" &&
  interaction.companyId === input.companyId &&
  interaction.employeeId === input.employeeId &&
  new Date(interaction.expiresAt).getTime() > nowMs;

export const systemInteractionMatchesCriticalReply = (
  interaction: SystemInteractionContext,
  input: TurnClassificationInput,
): boolean => {
  const intent = input.resolvedIntent;
  const handler = input.resolvedHandler;
  const messageType = input.messageType;

  switch (interaction.category) {
    case "ARRIVAL_REMINDER":
    case "NO_CHECKIN_REMINDER":
      return (
        intent === "arrival" ||
        handler === "CHECKIN" ||
        (messageType === "LOCATION" &&
          (handler === "CHECKIN" || handler === "LOCATION_SECURITY"))
      );
    case "EXIT_REMINDER":
      return (
        intent === "checkout" ||
        handler === "CHECKOUT" ||
        (messageType === "LOCATION" &&
          (handler === "CHECKOUT" || handler === "LOCATION_SECURITY"))
      );
    case "ATTENDANCE_CONFIRMATION":
      return (
        handler === "ATTENDANCE_CONFIRMATION_RESPONSE" ||
        handler === "CONFIRMATION" ||
        intent === "confirm_attendance" ||
        intent === "report_unavailability"
      );
    case "OPERATION_ASSIGNMENT":
      return (
        intent === "confirm_attendance" ||
        intent === "report_unavailability" ||
        handler === "CONFIRMATION"
      );
    default:
      return false;
  }
};

/**
 * Pure, deterministic turn classifier (Phase 1). No I/O, no Twilio, no quotas.
 * Inject `nowMs` for expiry evaluation — never call Date.now() internally.
 */
export const classifyWhatsAppTurn = (
  input: TurnClassificationInput,
): TurnClassificationResult => {
  const nowMs = input.nowMs ?? 0;
  const origin: TurnClassificationResult["origin"] =
    input.companyId && input.employeeId ? "EMPLOYEE" : "UNKNOWN";

  if (!input.companyId || !input.employeeId) {
    return result({
      origin: "UNKNOWN",
      classification: "AMBIGUOUS",
      category: "IDENTITY_UNRESOLVED",
      reasonCode: "MISSING_COMPANY_OR_EMPLOYEE",
      relatedOperationId: input.relatedOperationId ?? null,
    });
  }

  const correlated = input.correlatedSystemInteraction ?? null;
  const interactionValid =
    correlated && isInteractionActiveAt(correlated, input, nowMs) ? correlated : null;

  const matchedInteraction =
    interactionValid && systemInteractionMatchesCriticalReply(interactionValid, input)
      ? interactionValid
      : null;

  // Destination after routing wins over pre-route session (explicit flow switch).
  if (isIn(input.resolvedHandler, CRITICAL_FLOW_TYPES)) {
    return result({
      origin,
      classification: "CRITICAL_EXEMPT",
      category: "CRITICAL_HANDLER",
      reasonCode: "RESOLVED_CRITICAL_HANDLER",
      relatedOperationId: input.relatedOperationId ?? null,
      systemInteractionId: matchedInteraction?.id ?? null,
    });
  }

  if (isIn(input.resolvedHandler, LIMITED_FLOW_TYPES)) {
    return result({
      origin,
      classification: "EMPLOYEE_LIMITED",
      category: "LIMITED_HANDLER",
      reasonCode: "RESOLVED_LIMITED_HANDLER",
      relatedOperationId: input.relatedOperationId ?? null,
      systemInteractionId: null,
    });
  }

  if (isIn(input.resolvedIntent, CRITICAL_RESOLVED_INTENTS)) {
    return result({
      origin,
      classification: "CRITICAL_EXEMPT",
      category: "CRITICAL_INTENT",
      reasonCode: "RESOLVED_CRITICAL_INTENT",
      relatedOperationId: input.relatedOperationId ?? null,
      systemInteractionId: matchedInteraction?.id ?? null,
    });
  }

  // Critical session continuation only when routing did not switch to an independent flow.
  if (isCriticalSession(input.activeSessionState)) {
    if (input.globalCommand === "cancel" || input.globalCommand === "back") {
      return result({
        origin,
        classification: "CRITICAL_EXEMPT",
        category: "CRITICAL_SESSION_NAVIGATION",
        reasonCode: "CANCEL_OR_BACK_IN_CRITICAL_SESSION",
        relatedOperationId: input.relatedOperationId ?? null,
        systemInteractionId: null,
      });
    }
    return result({
      origin,
      classification: "CRITICAL_EXEMPT",
      category: "CRITICAL_SESSION_CONTINUATION",
      reasonCode: "ACTIVE_CRITICAL_SESSION",
      relatedOperationId: input.relatedOperationId ?? null,
      systemInteractionId: matchedInteraction?.id ?? null,
    });
  }

  if (matchedInteraction) {
    return result({
      origin,
      classification: "CRITICAL_EXEMPT",
      category: "SYSTEM_INTERACTION_CONTINUATION",
      reasonCode: "ACTIVE_SYSTEM_INTERACTION_CRITICAL_REPLY",
      relatedOperationId:
        input.relatedOperationId ?? matchedInteraction.relatedOperationId ?? null,
      systemInteractionId: matchedInteraction.id,
    });
  }

  if (isLimitedSession(input.activeSessionState)) {
    if (input.globalCommand === "cancel" || input.globalCommand === "back") {
      return result({
        origin,
        classification: "EMPLOYEE_LIMITED",
        category: "LIMITED_SESSION_NAVIGATION",
        reasonCode: "CANCEL_OR_BACK_IN_LIMITED_SESSION",
        relatedOperationId: input.relatedOperationId ?? null,
        systemInteractionId: null,
      });
    }
    return result({
      origin,
      classification: "EMPLOYEE_LIMITED",
      category: "LIMITED_SESSION_CONTINUATION",
      reasonCode: "ACTIVE_LIMITED_SESSION",
      relatedOperationId: input.relatedOperationId ?? null,
      systemInteractionId: null,
    });
  }

  // Unknown/inconsistent session states before limited-intent allowlists so that
  // intent "unknown" does not silently convert novel states into EMPLOYEE_LIMITED.
  if (
    input.activeSessionState &&
    !isCriticalSession(input.activeSessionState) &&
    !isLimitedSession(input.activeSessionState)
  ) {
    return result({
      origin,
      classification: "AMBIGUOUS",
      category: "UNKNOWN_SESSION_STATE",
      reasonCode:
        input.resolvedIntent === "unknown" || !input.resolvedIntent
          ? "UNKNOWN_SESSION_STATE_WITH_UNKNOWN_INTENT"
          : "UNKNOWN_OR_INCONSISTENT_SESSION_STATE",
      relatedOperationId: input.relatedOperationId ?? null,
      systemInteractionId: null,
    });
  }

  if (isIn(input.resolvedIntent, LIMITED_RESOLVED_INTENTS)) {
    return result({
      origin,
      classification: "EMPLOYEE_LIMITED",
      category: "LIMITED_INTENT",
      reasonCode: "RESOLVED_LIMITED_INTENT",
      relatedOperationId: input.relatedOperationId ?? null,
      systemInteractionId: null,
    });
  }

  if (
    input.globalCommand === "help" ||
    input.globalCommand === "menu" ||
    input.globalCommand === "cancel" ||
    input.globalCommand === "back"
  ) {
    return result({
      origin,
      classification: "EMPLOYEE_LIMITED",
      category: "GLOBAL_COMMAND",
      reasonCode: "GLOBAL_COMMAND_WITHOUT_CRITICAL_SESSION",
      relatedOperationId: input.relatedOperationId ?? null,
      systemInteractionId: null,
    });
  }

  if (input.messageType === "LOCATION" && !input.resolvedHandler) {
    return result({
      origin,
      classification: "AMBIGUOUS",
      category: "LOCATION_UNRESOLVED",
      reasonCode: "LOCATION_WITHOUT_RESOLVED_HANDLER",
      relatedOperationId: input.relatedOperationId ?? null,
      systemInteractionId: null,
    });
  }

  return result({
    origin,
    classification: "AMBIGUOUS",
    category: "UNCLASSIFIED",
    reasonCode: "INSUFFICIENT_EVIDENCE",
    relatedOperationId: input.relatedOperationId ?? null,
    systemInteractionId: null,
  });
};

export const whatsappTurnClassificationService = {
  classify: classifyWhatsAppTurn,
};
