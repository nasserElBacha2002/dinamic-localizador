import { EXPIRED_SESSION_USER_MESSAGE } from "../../utils/bot-session-expiration";
import { isCheckoutSessionState } from "../../utils/bot-session-states";
import { InvalidCoordinatesError } from "../../utils/haversine";
import { parseOperationSelection } from "../../utils/intent";
import { maskPhoneNumberForLog } from "../../utils/phone";
import { WHATSAPP_RESULT_CODES } from "../../constants/whatsapp-observability";
import { employeeRepository } from "../../repositories/employee.repository";
import { buildForwardedLocationDedupKey } from "../../utils/admin-alert/dedup-keys";
import {
  extractLocationMessageMetadata,
  isExplicitlyForwardedLocation,
} from "../../utils/location-message-metadata";
import { emitAdminAlertSafely } from "../admin-alert-emit.helpers";
import { parseBotIntent } from "../bot/bot-intent.parser";
import {
  FORWARDED_LOCATION_REJECTED_MESSAGE,
  GENERIC_ERROR_MESSAGE,
  INVALID_COORDINATES_MESSAGE,
  LOCATION_WITHOUT_CHECKOUT_SESSION_MESSAGE,
  LOCATION_WITHOUT_SESSION_MESSAGE,
  UNPARSEABLE_MESSAGE,
  UNKNOWN_EMPLOYEE_MESSAGE,
} from "../bot/bot-response.builder";
import { logWhatsAppAttendanceEvent } from "../../utils/whatsapp-notification-observability";
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
import { handleActiveAttendanceConfirmationResponseSession, handleDurableAttendanceConfirmationReply } from "./attendance-confirmation-response.handler";
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
import {
  handleActivePayrollReceiptSession,
  handlePayrollReceiptIntent,
} from "./payroll-receipt.handler";
import type { WhatsAppRouterContext, WhatsAppRouterHandlers } from "./whatsapp-router.types";
import {
  isAssignmentSelectionSessionState,
  isPayrollReceiptSessionState,
} from "../../utils/bot-session-states";

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
        resultCode: WHATSAPP_RESULT_CODES.UNKNOWN_EMPLOYEE,
        flowType: "EMPLOYEE_RESOLUTION",
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

      const confirmationResponse = await handleActiveAttendanceConfirmationResponseSession(
        ctx,
        ctx.session,
        handlers,
      );
      if (confirmationResponse) {
        return confirmationResponse;
      }

      if (isPayrollReceiptSessionState(ctx.session.state)) {
        const payrollResponse = await handleActivePayrollReceiptSession(
          ctx,
          ctx.session,
          handlers,
        );
        if (payrollResponse) {
          return payrollResponse;
        }
      }

      if (isAbsenceFlowSession(ctx.session)) {
        return handleActiveAbsenceSession(ctx, ctx.session, handlers);
      }
    }

    // Free-text intents before durable "1"/"2" so Llegué / Me voy never get stolen.
    if (!ctx.body) {
      return handlers.respond(companyId, {
        message: UNPARSEABLE_MESSAGE,
        employeeId: ctx.employeeId,
        phoneFrom: ctx.phoneTo,
        phoneTo: ctx.phoneFrom,
      });
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

    if (intent === "payroll_receipt") {
      return handlePayrollReceiptIntent(ctx, handlers);
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

    // Durable confirmation only for bare "1"/"2" after free-text intents.
    // Open-window targets only; expired needs confirmation-session context.
    if (!ctx.session) {
      const durableConfirmation = await handleDurableAttendanceConfirmationReply(ctx, handlers);
      if (durableConfirmation) {
        return durableConfirmation;
      }
    }

    if (!ctx.session && ctx.recentlyExpired && parseOperationSelection(ctx.body)) {
      console.info("[whatsapp-bot] operation selection after expired session", {
        phone: maskPhoneNumberForLog(ctx.phoneFrom),
      });
      return handlers.respond(companyId, {
        message: EXPIRED_SESSION_MESSAGE,
        employeeId: ctx.employeeId,
        phoneFrom: ctx.phoneTo,
        phoneTo: ctx.phoneFrom,
        resultCode: WHATSAPP_RESULT_CODES.SESSION_EXPIRED,
        flowType: "SESSION_RESOLUTION",
      });
    }

    if (!ctx.session) {
      const menuNumberResponse = await handleNumericMenuSelection(ctx, handlers);
      if (menuNumberResponse) {
        return menuNumberResponse;
      }
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

    // Best-effort anti-forward: Twilio Forwarded / FrequentlyForwarded only, before geofence/attendance.
    const locationMetadata = extractLocationMessageMetadata(
      ctx.payload as unknown as Record<string, unknown>,
    );
    const hasCoordinates = Boolean(ctx.payload.Latitude && ctx.payload.Longitude);
    const flowHint = !ctx.session
      ? "DIRECT"
      : isCheckoutSessionState(ctx.session.state)
        ? "CHECK_OUT"
        : ctx.session.state === "WAITING_LOCATION" || ctx.session.state === "WAITING_OPERATION_SELECTION"
          ? "CHECK_IN"
          : "LOCATION";

    logWhatsAppAttendanceEvent("LOCATION_RECEIVED", {
      companyId,
      employeeId: ctx.employeeId,
      messageSid: locationMetadata.sourceMessageSid,
      hasCoordinates,
      sessionState: ctx.session?.state ?? null,
      isForwarded: locationMetadata.isForwarded,
      isFrequentlyForwarded: locationMetadata.isFrequentlyForwarded,
    });
    logWhatsAppAttendanceEvent("LOCATION_FORWARD_STATUS", {
      companyId,
      employeeId: ctx.employeeId,
      messageSid: locationMetadata.sourceMessageSid,
      isForwarded: locationMetadata.isForwarded,
      isFrequentlyForwarded: locationMetadata.isFrequentlyForwarded,
    });

    if (isExplicitlyForwardedLocation(locationMetadata)) {
      logWhatsAppAttendanceEvent("FORWARDED_LOCATION_REJECTED", {
        companyId,
        employeeId: ctx.employeeId,
        messageSid: locationMetadata.sourceMessageSid,
        resultCode: WHATSAPP_RESULT_CODES.FORWARDED_LOCATION_REJECTED,
        sessionState: ctx.session?.state ?? null,
        isForwarded: locationMetadata.isForwarded,
        isFrequentlyForwarded: locationMetadata.isFrequentlyForwarded,
      });
      const employee = await employeeRepository.findById(companyId, ctx.employeeId);
      if (employee) {
        const occurredAt = new Date();
        await emitAdminAlertSafely(
          {
            companyId,
            type: "FORWARDED_LOCATION_REJECTED",
            employeeId: ctx.employeeId,
            operationId: ctx.session?.operationId ?? null,
            deduplicationKey: buildForwardedLocationDedupKey(
              ctx.employeeId,
              locationMetadata.sourceMessageSid || `missing-sid:${occurredAt.toISOString()}`,
            ),
            occurredAt,
            payload: {
              employeeName: employee.name,
              forwardedLocationDetail: [
                "Ubicación marcada como reenviada por el proveedor.",
                `Flujo: ${flowHint}.`,
                `MessageSid: ${locationMetadata.sourceMessageSid || "—"}.`,
                `Forwarded=${locationMetadata.isForwarded}.`,
                `FrequentlyForwarded=${locationMetadata.isFrequentlyForwarded}.`,
                `Fecha/hora UTC: ${occurredAt.toISOString()}.`,
              ].join(" "),
            },
          },
          "whatsapp-forwarded-location",
        );
      }
      return handlers.respond(companyId, {
        message: FORWARDED_LOCATION_REJECTED_MESSAGE,
        employeeId: ctx.employeeId,
        phoneFrom: ctx.phoneTo,
        phoneTo: ctx.phoneFrom,
        resultCode: WHATSAPP_RESULT_CODES.FORWARDED_LOCATION_REJECTED,
        flowType: "LOCATION_SECURITY",
      });
    }

    if (!ctx.session) {
      try {
        return await handlers.processDirectLocationAttendance({
          companyId,
          employeeId: ctx.employeeId,
          latitude: Number(ctx.payload.Latitude),
          longitude: Number(ctx.payload.Longitude),
          messageSid: ctx.payload.MessageSid,
          phoneFrom: ctx.phoneFrom,
          phoneTo: ctx.phoneTo,
          moduleStates: ctx.moduleStates,
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

        console.error("[whatsapp-bot] unexpected direct location processing error", error);
        return handlers.respond(companyId, {
          message: GENERIC_ERROR_MESSAGE,
          employeeId: ctx.employeeId,
          phoneFrom: ctx.phoneTo,
          phoneTo: ctx.phoneFrom,
        });
      }
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
