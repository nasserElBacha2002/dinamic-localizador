import { EXPIRED_SESSION_USER_MESSAGE } from "../../utils/bot-session-expiration";
import { isCheckoutSessionState } from "../../utils/bot-session-states";
import { InvalidCoordinatesError } from "../../utils/haversine";
import { parseInventorySelection } from "../../utils/intent";
import { maskPhoneNumberForLog } from "../../utils/phone";
import { parseBotIntent } from "../bot/bot-intent.parser";
import {
  GENERIC_ERROR_MESSAGE,
  INVALID_COORDINATES_MESSAGE,
  LOCATION_WITHOUT_CHECKOUT_SESSION_MESSAGE,
  LOCATION_WITHOUT_SESSION_MESSAGE,
  UNPARSEABLE_MESSAGE,
  UNKNOWN_EMPLOYEE_MESSAGE,
} from "../bot/bot-response.builder";
import {
  handleActiveAbsenceSession,
  handleAbsenceIntent,
  isAbsenceFlowSession,
} from "./absence.handler";
import {
  handleActiveAssignmentSelectionSession,
  handleConfirmAttendanceIntent,
  handleUnavailabilityIntent,
} from "./assignment-confirmation.handler";
import {
  handleActiveCheckInTextSession,
  handleArrivalIntent,
  handleCheckInLocation,
} from "./attendance.handler";
import {
  handleActiveCheckoutTextSession,
  handleCheckoutIntent,
  handleCheckoutLocation,
} from "./checkout.handler";
import { tryHandleGlobalCommand } from "./global-command.handler";
import { handleMenuFallback, handleNumericMenuSelection } from "./menu.handler";
import { respondIfActiveSessionModuleBlocked } from "./module-session-gate";
import { handleUpcomingAssignmentsIntent } from "./upcoming-assignments.handler";
import { handleWorkdayIntent } from "./workday.handler";
import type { WhatsAppRouterContext, WhatsAppRouterHandlers } from "./whatsapp-router.types";
import { isAssignmentSelectionSessionState } from "../../utils/bot-session-states";

const EXPIRED_SESSION_MESSAGE = EXPIRED_SESSION_USER_MESSAGE;

export const whatsappRouterService = {
  async routeTextMessage(
    ctx: WhatsAppRouterContext,
    handlers: WhatsAppRouterHandlers,
  ): Promise<string> {
    const { companyId } = ctx;

    if (!ctx.employeeId) {
      console.info("[whatsapp-bot] employee not identified", {
        phone: maskPhoneNumberForLog(ctx.phoneFrom),
      });
      return handlers.respond(companyId, {
        message: UNKNOWN_EMPLOYEE_MESSAGE,
        employeeId: null,
        phoneFrom: ctx.phoneTo,
        phoneTo: ctx.phoneFrom,
      });
    }

    if (!ctx.session && ctx.recentlyExpired && parseInventorySelection(ctx.body)) {
      console.info("[whatsapp-bot] inventory selection after expired session", {
        phone: maskPhoneNumberForLog(ctx.phoneFrom),
      });
      return handlers.respond(companyId, {
        message: EXPIRED_SESSION_MESSAGE,
        employeeId: ctx.employeeId,
        phoneFrom: ctx.phoneTo,
        phoneTo: ctx.phoneFrom,
      });
    }

    const globalResponse = await tryHandleGlobalCommand(ctx, handlers);
    if (globalResponse) {
      return globalResponse;
    }

    if (ctx.session) {
      const blockedResponse = await respondIfActiveSessionModuleBlocked(
        companyId,
        ctx.session,
        ctx.moduleStates,
        ctx.employeeId,
        ctx.phoneTo,
        ctx.phoneFrom,
        handlers.respond,
      );
      if (blockedResponse) {
        return blockedResponse;
      }
    }

    if (ctx.session) {
      const checkInResponse = await handleActiveCheckInTextSession(ctx, ctx.session, handlers);
      if (checkInResponse) {
        return checkInResponse;
      }

      const checkoutResponse = await handleActiveCheckoutTextSession(ctx, ctx.session, handlers);
      if (checkoutResponse) {
        return checkoutResponse;
      }

      if (isAssignmentSelectionSessionState(ctx.session.state)) {
        const assignmentSelectionResponse = await handleActiveAssignmentSelectionSession(
          ctx,
          ctx.session,
          handlers,
        );
        if (assignmentSelectionResponse) {
          return assignmentSelectionResponse;
        }
      }

      if (isAbsenceFlowSession(ctx.session)) {
        return handleActiveAbsenceSession(ctx, ctx.session, handlers);
      }
    }

    if (!ctx.body) {
      return handlers.respond(companyId, {
        message: UNPARSEABLE_MESSAGE,
        employeeId: ctx.employeeId,
        phoneFrom: ctx.phoneTo,
        phoneTo: ctx.phoneFrom,
      });
    }

    if (!ctx.session) {
      const menuNumberResponse = await handleNumericMenuSelection(ctx, handlers);
      if (menuNumberResponse) {
        return menuNumberResponse;
      }
    }

    const intent = parseBotIntent({ body: ctx.body });

    if (intent === "checkout") {
      return handleCheckoutIntent(ctx, handlers, ctx.session);
    }

    if (intent === "arrival") {
      return handleArrivalIntent(ctx, handlers, ctx.session);
    }

    if (intent === "absence") {
      return handleAbsenceIntent(ctx, handlers, ctx.session);
    }

    if (intent === "workday") {
      return handleWorkdayIntent(ctx, handlers);
    }

    if (intent === "upcoming_assignments") {
      return handleUpcomingAssignmentsIntent(ctx, handlers);
    }

    if (intent === "confirm_attendance") {
      return handleConfirmAttendanceIntent(ctx, handlers);
    }

    if (intent === "report_unavailability") {
      return handleUnavailabilityIntent(ctx, handlers);
    }

    if (intent === "menu") {
      return handleMenuFallback(ctx, handlers);
    }

    return handleMenuFallback(ctx, handlers);
  },

  async routeLocationMessage(
    ctx: WhatsAppRouterContext,
    handlers: WhatsAppRouterHandlers,
  ): Promise<string> {
    const { companyId } = ctx;

    if (!ctx.employeeId) {
      return handlers.respond(companyId, {
        message: UNKNOWN_EMPLOYEE_MESSAGE,
        employeeId: null,
        phoneFrom: ctx.phoneTo,
        phoneTo: ctx.phoneFrom,
      });
    }

    if (!ctx.session) {
      return handlers.respond(companyId, {
        message: ctx.recentlyExpired ? EXPIRED_SESSION_MESSAGE : LOCATION_WITHOUT_SESSION_MESSAGE,
        employeeId: ctx.employeeId,
        phoneFrom: ctx.phoneTo,
        phoneTo: ctx.phoneFrom,
      });
    }

    const blockedResponse = await respondIfActiveSessionModuleBlocked(
      companyId,
      ctx.session,
      ctx.moduleStates,
      ctx.employeeId,
      ctx.phoneTo,
      ctx.phoneFrom,
      handlers.respond,
    );
    if (blockedResponse) {
      return blockedResponse;
    }

    try {
      const checkoutLocationResponse = await handleCheckoutLocation(ctx, ctx.session, handlers);
      if (checkoutLocationResponse) {
        return checkoutLocationResponse;
      }

      const checkInLocationResponse = await handleCheckInLocation(ctx, ctx.session, handlers);
      if (checkInLocationResponse) {
        return checkInLocationResponse;
      }

      return handlers.respond(companyId, {
        message: isCheckoutSessionState(ctx.session.state)
          ? LOCATION_WITHOUT_CHECKOUT_SESSION_MESSAGE
          : LOCATION_WITHOUT_SESSION_MESSAGE,
        employeeId: ctx.employeeId,
        phoneFrom: ctx.phoneTo,
        phoneTo: ctx.phoneFrom,
      });
    } catch (error) {
      if (error instanceof InvalidCoordinatesError) {
        return handlers.respond(companyId, {
          message: INVALID_COORDINATES_MESSAGE,
          employeeId: ctx.employeeId,
          phoneFrom: ctx.phoneTo,
          phoneTo: ctx.phoneFrom,
        });
      }

      console.error("[whatsapp-bot] unexpected location processing error", error);
      return handlers.respond(companyId, {
        message: GENERIC_ERROR_MESSAGE,
        employeeId: ctx.employeeId,
        phoneFrom: ctx.phoneTo,
        phoneTo: ctx.phoneFrom,
      });
    }
  },
};
