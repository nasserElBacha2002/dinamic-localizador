/**
 * Authoritative pure routing resolution for WhatsApp text/location turns.
 *
 * Precedence (text):
 * 1. Global help / menu → MENU (limited); no session cancel planned here
 *    (router global handler may still create menu session — side effect only after admit path N/A for critical).
 * 2. Global cancel / back → critical-session navigation stays critical (null handler);
 *    otherwise MENU limited.
 * 3. Explicit flow-switch intent incompatible with active session → resolve free-intent
 *    destination as if session were cleared; set cancelSessionBeforeDispatch (router
 *    applies cancel only after limited admission / immediately for critical).
 * 4. WAITING_MENU_SELECTION with valid snapshot selection → option handler + continue session.
 * 5. Active session continuation (any remaining session) → null handler, continueActiveSession.
 * 6. Free-text intents / empty / menu fallback.
 *
 * Critical explicit intents beat limited session continuity.
 * Limited explicit intents beat critical session continuity when switch is allowed.
 * Invalid input inside a critical session remains critical continuation (step 5).
 *
 * No side effects: no cancelSession, no Twilio, no DB writes.
 */

import {
  CRITICAL_FLOW_TYPES,
  CRITICAL_RESOLVED_INTENTS,
  CRITICAL_SESSION_STATES,
  LIMITED_FLOW_TYPES,
  LIMITED_RESOLVED_INTENTS,
} from "../constants/whatsapp-turn-classification";
import type { CompanyModuleKey } from "../constants/company-modules";
import type { BotSession } from "../types/twilio.types";
import type { PlannedTurnDestination } from "../types/whatsapp-usage-quota";
import { isExplicitIntentCompatibleWithSession } from "../utils/bot-session-intent";
import {
  isGlobalBackCommand,
  isGlobalCancelCommand,
  isGlobalHelpCommand,
  isGlobalMenuCommand,
} from "../utils/intent";
import { parseBotIntent, type BotIntent } from "./bot/bot-intent.parser";
import {
  buildAvailableMenuOptions,
  resolveMenuSnapshot,
  resolveMenuSnapshotSelection,
  type BotMenuOptionKey,
} from "./bot/bot-menu.builder";
import { botSessionService } from "./bot-session.service";

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

export const isExplicitSwitchIntent = (intent: BotIntent): boolean =>
  intent === "arrival" ||
  intent === "checkout" ||
  intent === "absence" ||
  intent === "payroll_receipt" ||
  intent === "workday" ||
  intent === "upcoming_assignments" ||
  intent === "confirm_attendance" ||
  intent === "report_unavailability";

export type WhatsAppTextTurnResolution = PlannedTurnDestination & {
  /** Dispatch active-session handlers with the current session. */
  continueActiveSession: boolean;
  /**
   * Router must cancel the active session before free-intent dispatch.
   * For EMPLOYEE_LIMITED turns, cancel only after quota admission succeeds.
   */
  cancelSessionBeforeDispatch: boolean;
  parsedIntent: BotIntent | null;
  /** Same family as resolvedHandler (telemetry / router flowType). */
  flowType: string | null;
};

const destinationFromFreeIntent = (
  intent: BotIntent,
  relatedOperationId: string | null,
): Pick<
  WhatsAppTextTurnResolution,
  "resolvedHandler" | "resolvedIntent" | "relatedOperationId" | "flowType" | "parsedIntent"
> => {
  if (isIn(intent, CRITICAL_RESOLVED_INTENTS)) {
    const handler =
      intent === "arrival" ? "CHECKIN" : intent === "checkout" ? "CHECKOUT" : "CONFIRMATION";
    return {
      resolvedHandler: handler,
      resolvedIntent: intent,
      relatedOperationId,
      flowType: handler,
      parsedIntent: intent,
    };
  }
  if (intent === "absence") {
    return {
      resolvedHandler: "ABSENCE",
      resolvedIntent: intent,
      relatedOperationId: null,
      flowType: "ABSENCE",
      parsedIntent: intent,
    };
  }
  if (intent === "payroll_receipt") {
    return {
      resolvedHandler: "PAYROLL_RECEIPT_QUERY",
      resolvedIntent: intent,
      relatedOperationId: null,
      flowType: "PAYROLL_RECEIPT_QUERY",
      parsedIntent: intent,
    };
  }
  if (intent === "workday") {
    return {
      resolvedHandler: "WORKDAY_QUERY",
      resolvedIntent: intent,
      relatedOperationId: null,
      flowType: "WORKDAY_QUERY",
      parsedIntent: intent,
    };
  }
  if (intent === "upcoming_assignments") {
    return {
      resolvedHandler: "UPCOMING_ASSIGNMENTS",
      resolvedIntent: intent,
      relatedOperationId: null,
      flowType: "UPCOMING_ASSIGNMENTS",
      parsedIntent: intent,
    };
  }
  if (intent === "menu") {
    return {
      resolvedHandler: "MENU",
      resolvedIntent: intent,
      relatedOperationId: null,
      flowType: "MENU",
      parsedIntent: intent,
    };
  }
  return {
    resolvedHandler: "MENU",
    resolvedIntent: intent,
    relatedOperationId: null,
    flowType: "MENU",
    parsedIntent: intent,
  };
};

export const resolveWhatsAppTextTurn = (input: {
  body: string;
  session: BotSession | null;
  moduleStates: ReadonlyMap<CompanyModuleKey, boolean>;
}): WhatsAppTextTurnResolution => {
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
      continueActiveSession: false,
      cancelSessionBeforeDispatch: false,
      parsedIntent: null,
      flowType: "MENU",
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
        continueActiveSession: false,
        cancelSessionBeforeDispatch: false,
        parsedIntent: null,
        flowType: null,
      };
    }
    return {
      resolvedHandler: "MENU",
      resolvedIntent: null,
      relatedOperationId: null,
      globalCommand,
      continueActiveSession: false,
      cancelSessionBeforeDispatch: false,
      parsedIntent: null,
      flowType: "MENU",
    };
  }

  if (input.session) {
    const explicitIntent = body ? parseBotIntent({ body }) : ("unknown" as BotIntent);
    if (
      body &&
      isExplicitSwitchIntent(explicitIntent) &&
      !isExplicitIntentCompatibleWithSession(explicitIntent, input.session.intent)
    ) {
      const free = destinationFromFreeIntent(explicitIntent, null);
      return {
        ...free,
        globalCommand: null,
        continueActiveSession: false,
        cancelSessionBeforeDispatch: true,
        menuOptionKey: null,
      };
    }
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
        const handler = MENU_OPTION_TO_HANDLER[optionKey];
        return {
          resolvedHandler: handler,
          resolvedIntent: MENU_OPTION_TO_INTENT[optionKey],
          relatedOperationId: input.session.operationId ?? null,
          globalCommand: null,
          menuOptionKey: optionKey,
          continueActiveSession: true,
          cancelSessionBeforeDispatch: false,
          parsedIntent: null,
          flowType: handler,
        };
      }
      return {
        resolvedHandler: "MENU",
        resolvedIntent: "unknown",
        relatedOperationId: input.session.operationId ?? null,
        globalCommand: null,
        continueActiveSession: true,
        cancelSessionBeforeDispatch: false,
        parsedIntent: null,
        flowType: "MENU",
      };
    }
  }

  if (input.session) {
    return {
      resolvedHandler: null,
      resolvedIntent: null,
      relatedOperationId: input.session.operationId ?? null,
      globalCommand: null,
      continueActiveSession: true,
      cancelSessionBeforeDispatch: false,
      parsedIntent: null,
      flowType: null,
    };
  }

  if (!body) {
    return {
      resolvedHandler: null,
      resolvedIntent: "unknown",
      relatedOperationId: null,
      globalCommand: null,
      continueActiveSession: false,
      cancelSessionBeforeDispatch: false,
      parsedIntent: null,
      flowType: null,
    };
  }

  const intent = parseBotIntent({ body });
  const free = destinationFromFreeIntent(intent, null);
  return {
    ...free,
    globalCommand: null,
    continueActiveSession: false,
    cancelSessionBeforeDispatch: false,
    menuOptionKey: null,
  };
};

export const resolveWhatsAppLocationTurn = (input: {
  session: BotSession | null;
}): WhatsAppTextTurnResolution => {
  if (input.session && isIn(input.session.state, CRITICAL_SESSION_STATES)) {
    const checkout = String(input.session.state).includes("CHECKOUT");
    const handler = checkout ? "CHECKOUT" : "CHECKIN";
    return {
      resolvedHandler: handler,
      resolvedIntent: checkout ? "checkout" : "arrival",
      relatedOperationId: input.session.operationId ?? null,
      globalCommand: null,
      continueActiveSession: true,
      cancelSessionBeforeDispatch: false,
      parsedIntent: null,
      flowType: handler,
    };
  }
  return {
    resolvedHandler: "CHECKIN",
    resolvedIntent: null,
    relatedOperationId: null,
    globalCommand: null,
    continueActiveSession: false,
    cancelSessionBeforeDispatch: false,
    parsedIntent: null,
    flowType: "CHECKIN",
  };
};

/** @deprecated Prefer resolveWhatsAppTextTurn — thin adapter for PlannedTurnDestination. */
export const planWhatsAppTextDestination = (input: {
  body: string;
  session: BotSession | null;
  moduleStates: ReadonlyMap<CompanyModuleKey, boolean>;
}): PlannedTurnDestination => {
  const r = resolveWhatsAppTextTurn(input);
  return {
    resolvedHandler: r.resolvedHandler,
    resolvedIntent: r.resolvedIntent,
    relatedOperationId: r.relatedOperationId,
    globalCommand: r.globalCommand,
    menuOptionKey: r.menuOptionKey,
  };
};

/** @deprecated Prefer resolveWhatsAppLocationTurn. */
export const planWhatsAppLocationDestination = (input: {
  session: BotSession | null;
}): PlannedTurnDestination => {
  const r = resolveWhatsAppLocationTurn(input);
  return {
    resolvedHandler: r.resolvedHandler,
    resolvedIntent: r.resolvedIntent,
    relatedOperationId: r.relatedOperationId,
    globalCommand: r.globalCommand,
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
