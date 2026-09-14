import {
  CRITICAL_FLOW_TYPES,
  CRITICAL_RESOLVED_INTENTS,
  CRITICAL_SESSION_STATES,
  LIMITED_FLOW_TYPES,
  LIMITED_RESOLVED_INTENTS,
  LIMITED_SESSION_STATES,
} from "../constants/whatsapp-turn-classification";
import type { BotSession } from "../types/twilio.types";
import type { PlannedTurnDestination } from "../types/whatsapp-usage-quota";
import { parseBotIntent } from "./bot/bot-intent.parser";
import {
  buildAvailableMenuOptions,
  resolveMenuSnapshot,
  resolveMenuSnapshotSelection,
  type BotMenuOptionKey,
} from "./bot/bot-menu.builder";
import { botSessionService } from "./bot-session.service";
import {
  isGlobalBackCommand,
  isGlobalCancelCommand,
  isGlobalHelpCommand,
  isGlobalMenuCommand,
} from "../utils/intent";
import type { CompanyModuleKey } from "../constants/company-modules";

const CRITICAL_MENU_OPTIONS = new Set<BotMenuOptionKey>([
  "check_in",
  "checkout",
  "confirm_attendance",
  "report_unavailability",
]);

const MENU_OPTION_TO_HANDLER: Record<BotMenuOptionKey, string> = {
  check_in: "CHECKIN",
  checkout: "CHECKOUT",
  absence: "ABSENCE",
  workday: "WORKDAY_QUERY",
  upcoming_assignments: "UPCOMING_ASSIGNMENTS",
  confirm_attendance: "CONFIRMATION",
  report_unavailability: "CONFIRMATION",
  payroll_receipt: "PAYROLL_RECEIPT_QUERY",
};

const MENU_OPTION_TO_INTENT: Record<BotMenuOptionKey, string> = {
  check_in: "arrival",
  checkout: "checkout",
  absence: "absence",
  workday: "workday",
  upcoming_assignments: "upcoming_assignments",
  confirm_attendance: "confirm_attendance",
  report_unavailability: "report_unavailability",
  payroll_receipt: "payroll_receipt",
};

const isIn = (value: string | null | undefined, list: readonly string[]): boolean =>
  Boolean(value && list.includes(value));

/**
 * Resolve destination for classification/admission WITHOUT executing handlers
 * (no session cancel, no Twilio, no document send).
 * Mirrors router precedence: session continuation / explicit switch / free intent.
 */
export const planWhatsAppTextDestination = (input: {
  body: string;
  session: BotSession | null;
  moduleStates: ReadonlyMap<CompanyModuleKey, boolean>;
}): PlannedTurnDestination => {
  const body = input.body.trim();
  const globalCommand = isGlobalCancelCommand(body)
    ? ("cancel" as const)
    : isGlobalBackCommand(body)
      ? ("back" as const)
      : isGlobalHelpCommand(body)
        ? ("help" as const)
        : isGlobalMenuCommand(body)
          ? ("menu" as const)
          : null;

  if (globalCommand === "help" || globalCommand === "menu") {
    return {
      resolvedHandler: "MENU",
      resolvedIntent: globalCommand === "help" ? "help" : "menu",
      relatedOperationId: input.session?.operationId ?? null,
      globalCommand,
    };
  }

  if (globalCommand === "cancel" || globalCommand === "back") {
    const state = input.session?.state ?? null;
    if (isIn(state, CRITICAL_SESSION_STATES)) {
      return {
        resolvedHandler: null,
        resolvedIntent: null,
        relatedOperationId: input.session?.operationId ?? null,
        globalCommand,
      };
    }
    return {
      resolvedHandler: "MENU",
      resolvedIntent: null,
      relatedOperationId: null,
      globalCommand,
    };
  }

  if (input.session?.state === "WAITING_MENU_SELECTION") {
    const context = botSessionService.parseContext(input.session.contextJson);
    const snapshot = resolveMenuSnapshot(context.menuOptions);
    const currentlyAllowed = new Set(
      buildAvailableMenuOptions(input.moduleStates).map((option) => option.key),
    );
    if (snapshot && !snapshot.some((option) => !currentlyAllowed.has(option.key))) {
      const optionKey = body
        ? resolveMenuSnapshotSelection(
            body,
            snapshot.map((option) => option.key),
          )
        : null;
      if (optionKey) {
        return {
          resolvedHandler: MENU_OPTION_TO_HANDLER[optionKey],
          resolvedIntent: MENU_OPTION_TO_INTENT[optionKey],
          relatedOperationId: input.session.operationId ?? null,
          globalCommand: null,
          menuOptionKey: optionKey,
        };
      }
      return {
        resolvedHandler: "MENU",
        resolvedIntent: "unknown",
        relatedOperationId: input.session.operationId ?? null,
        globalCommand: null,
      };
    }
  }

  if (input.session && isIn(input.session.state, CRITICAL_SESSION_STATES)) {
    return {
      resolvedHandler: null,
      resolvedIntent: null,
      relatedOperationId: input.session.operationId ?? null,
      globalCommand: null,
    };
  }

  if (input.session && isIn(input.session.state, LIMITED_SESSION_STATES)) {
    return {
      resolvedHandler: null,
      resolvedIntent: null,
      relatedOperationId: input.session.operationId ?? null,
      globalCommand: null,
    };
  }

  if (!body) {
    return {
      resolvedHandler: null,
      resolvedIntent: "unknown",
      relatedOperationId: null,
      globalCommand: null,
    };
  }

  const intent = parseBotIntent({ body });
  if (isIn(intent, CRITICAL_RESOLVED_INTENTS)) {
    const handler =
      intent === "arrival"
        ? "CHECKIN"
        : intent === "checkout"
          ? "CHECKOUT"
          : "CONFIRMATION";
    return {
      resolvedHandler: handler,
      resolvedIntent: intent,
      relatedOperationId: input.session?.operationId ?? null,
      globalCommand: null,
    };
  }

  if (isIn(intent, LIMITED_RESOLVED_INTENTS)) {
    let handler: string | null = null;
    if (intent === "absence") handler = "ABSENCE";
    else if (intent === "payroll_receipt") handler = "PAYROLL_RECEIPT_QUERY";
    else if (intent === "workday") handler = "WORKDAY_QUERY";
    else if (intent === "upcoming_assignments") handler = "UPCOMING_ASSIGNMENTS";
    else if (intent === "menu") handler = "MENU";
    return {
      resolvedHandler: handler,
      resolvedIntent: intent,
      relatedOperationId: null,
      globalCommand: null,
    };
  }

  return {
    resolvedHandler: "MENU",
    resolvedIntent: intent,
    relatedOperationId: null,
    globalCommand: null,
  };
};

export const planWhatsAppLocationDestination = (input: {
  session: BotSession | null;
}): PlannedTurnDestination => {
  if (input.session && isIn(input.session.state, CRITICAL_SESSION_STATES)) {
    const checkout = String(input.session.state).includes("CHECKOUT");
    return {
      resolvedHandler: checkout ? "CHECKOUT" : "CHECKIN",
      resolvedIntent: checkout ? "checkout" : "arrival",
      relatedOperationId: input.session.operationId ?? null,
      globalCommand: null,
    };
  }
  // Bare location without session — attendance inference (critical path).
  return {
    resolvedHandler: "CHECKIN",
    resolvedIntent: null,
    relatedOperationId: null,
    globalCommand: null,
  };
};

export const isPlannedCriticalDestination = (plan: PlannedTurnDestination): boolean =>
  isIn(plan.resolvedHandler, CRITICAL_FLOW_TYPES) ||
  isIn(plan.resolvedIntent, CRITICAL_RESOLVED_INTENTS) ||
  Boolean(plan.menuOptionKey && CRITICAL_MENU_OPTIONS.has(plan.menuOptionKey as BotMenuOptionKey));

export const isPlannedLimitedDestination = (plan: PlannedTurnDestination): boolean =>
  !isPlannedCriticalDestination(plan) &&
  (isIn(plan.resolvedHandler, LIMITED_FLOW_TYPES) ||
    isIn(plan.resolvedIntent, LIMITED_RESOLVED_INTENTS) ||
    plan.globalCommand === "help" ||
    plan.globalCommand === "menu");
