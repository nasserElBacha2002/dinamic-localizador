/**
 * Checkout conversation flows for WhatsApp (selection, location, without-location).
 * Durable checkout + session completion live in employeeWorkdayCheckoutCommand;
 * this module only orchestrates chat (selection, validation, simulation, responses).
 */
import { attendanceRepository } from "../../repositories/attendance.repository";
import { EXPIRED_SESSION_USER_MESSAGE } from "../../utils/bot-session-expiration";
import { formatLocalTime } from "../../utils/attendance-validation";
import {
  getBotOperationTimezone,
  getBotRuntimeSettings,
  getRequireCheckoutLocation,
} from "../../utils/bot-runtime-settings-scope";
import { WHATSAPP_RESULT_CODES } from "../../constants/whatsapp-observability";
import { logWhatsAppAttendanceEvent } from "../../utils/whatsapp-notification-observability";
import {
  buildCheckoutValidation,
  buildCheckoutValidationWithoutLocation,
} from "./bot-attendance-runtime";
import { botSessionService } from "../bot-session.service";
import {
  CheckoutCommandError,
  employeeWorkdayCheckoutCommand,
} from "../employee-workday-checkout.command";
import {
  buildCheckoutWorkdaySelectionPrompt,
  buildCheckoutLocationRequestMessage,
  buildCheckoutRegisteredMessage,
  DUPLICATE_CHECKOUT_MESSAGE,
  GENERIC_ERROR_MESSAGE,
  INVALID_SELECTION_MESSAGE,
  NO_CHECK_IN_FOR_CHECKOUT_MESSAGE,
  NO_CHECKOUT_ASSIGNMENT_MESSAGE,
  NO_CHECKOUT_OPERATION_MESSAGE,
  PENDING_CHECKOUT_EXPIRED_MESSAGE,
} from "./bot-response.builder";
import {
  isValidWorkdaySelection,
  listExitWithoutArrivalCheckoutWorkdays,
  listOpenCheckoutWorkdays,
  mapCheckoutCandidatesToSessionOptions,
  parseWorkdaySelectionIndex,
  resolvePendingLocationEventAt,
  resolveWorkdayOptionFromSession,
  revalidateCheckoutCandidateByAttendanceId,
  revalidateExitWithoutArrivalCandidateByWorkdayId,
  type CheckoutCandidateRevalidationResult,
} from "./bot-workday.selector";
import { resolveWorkdayOptionsFromSessionContext } from "../../utils/legacy-operation-session-context";
import type { BotSession } from "../../types/twilio.types";
import type { AttendanceRecord } from "../../types/domain";
import {
  completeVirtualCheckOut,
  findVirtualCheckInForCheckout,
  getBotNow,
  getSimulationSessionId,
  isSimulationDryRun,
  recordSimulationArtifact,
  setTechnicalDetail,
} from "../../utils/bot-runtime-context";
import { respond } from "./bot-outbound-response";

const EXPIRED_SESSION_MESSAGE = EXPIRED_SESSION_USER_MESSAGE;

const messageForCheckoutRevalidationFailure = (
  result: CheckoutCandidateRevalidationResult,
): string =>
  result.kind === "expired"
    ? PENDING_CHECKOUT_EXPIRED_MESSAGE
    : NO_CHECKOUT_OPERATION_MESSAGE;

/**
 * Canonical exit-without-arrival signal: no open attendance id.
 * Session/candidate `checkoutWithoutArrival` must stay aligned:
 *   checkoutWithoutArrival === true  ⇒  attendanceRecordId == null
 */
const isExitWithoutArrivalCheckout = (input: {
  attendanceRecordId?: string | null;
  checkoutWithoutArrival?: boolean;
}): boolean => {
  if (input.checkoutWithoutArrival) {
    return true;
  }
  return !input.attendanceRecordId;
};

const respondCheckoutCommandError = async (input: {
  companyId: string;
  employeeId: string;
  phoneFrom: string;
  phoneTo: string;
  error: CheckoutCommandError;
  sessionId?: string;
  /** Copy when candidate is unavailable (exit-without-arrival vs open attendance). */
  unavailableMessage?: string;
}): Promise<string | null> => {
  const { error } = input;
  if (error.code === "BOT_SESSION_STALE") {
    return respond(input.companyId, {
      message: EXPIRED_SESSION_MESSAGE,
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  }
  if (
    error.code === "CHECKOUT_CANDIDATE_EXPIRED" ||
    error.code === "CHECKOUT_CANDIDATE_UNAVAILABLE"
  ) {
    return respond(input.companyId, {
      message:
        error.code === "CHECKOUT_CANDIDATE_EXPIRED"
          ? PENDING_CHECKOUT_EXPIRED_MESSAGE
          : (input.unavailableMessage ?? NO_CHECKOUT_OPERATION_MESSAGE),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  }
  if (
    error.code === "CHECKOUT_DUPLICATE" ||
    error.code === "CHECKOUT_MESSAGE_SID_DUPLICATE"
  ) {
    if (input.sessionId) {
      await botSessionService.completeSession(input.companyId, input.sessionId);
    }
    return respond(input.companyId, {
      message: DUPLICATE_CHECKOUT_MESSAGE,
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  }
  return null;
};

export async function processCheckoutWithoutLocation(input: {
    companyId: string;
    employeeId: string;
    employeeWorkdayId: string;
    attendanceRecordId: string;
    operationId: string;
    phoneFrom: string;
    phoneTo: string;
    messageSid: string;
    sessionId?: string;
  }): Promise<string> {
    const { companyId } = input;

    const completeSessionIfNeeded = async (): Promise<void> => {
      if (input.sessionId) {
        await botSessionService.completeSession(companyId, input.sessionId);
      }
    };
    const checkoutAt = getBotNow();
    const revalidation = await revalidateCheckoutCandidateByAttendanceId(
      companyId,
      input.employeeId,
      input.attendanceRecordId,
      checkoutAt,
    );

    if (
      revalidation.kind !== "eligible" ||
      revalidation.candidate.employeeWorkdayId !== input.employeeWorkdayId ||
      revalidation.candidate.operationId !== input.operationId
    ) {
      await completeSessionIfNeeded();
      return respond(companyId, {
        message: messageForCheckoutRevalidationFailure(revalidation),
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const eligible = revalidation.candidate;

    const runtimeSettings = getBotRuntimeSettings();
    if (!runtimeSettings) {
      throw new Error("Bot runtime settings are not loaded");
    }

    const simulationSessionId = getSimulationSessionId();
    let attendance: AttendanceRecord | null = null;

    if (!isSimulationDryRun()) {
      attendance = await attendanceRepository.findCheckInForEmployeeWorkday(
        companyId,
        input.employeeWorkdayId,
        { simulationSessionId },
      );
      if (attendance && attendance.id !== input.attendanceRecordId) {
        attendance = null;
      }
    }

    if (isSimulationDryRun()) {
      const virtual = findVirtualCheckInForCheckout(input.employeeWorkdayId);
      if (virtual) {
        attendance = {
          id: virtual.id,
          operationId: virtual.operationId,
          employeeId: virtual.employeeId,
          employeeWorkdayId: virtual.employeeWorkdayId,
          receivedLatitude: 0,
          receivedLongitude: 0,
          distanceMeters: virtual.distanceMeters,
          validationStatus: virtual.validationStatus as AttendanceRecord["validationStatus"],
          locationStatus: virtual.locationStatus as AttendanceRecord["locationStatus"],
          punctualityStatus: virtual.punctualityStatus as AttendanceRecord["punctualityStatus"],
          sourceMessageSid: null,
          validationReason: null,
          reviewedBy: null,
          reviewedAt: null,
          reviewReason: null,
          receivedAt: virtual.receivedAt,
          checkoutAt: virtual.checkoutAt,
          checkoutLatitude: null,
          checkoutLongitude: null,
          checkoutDistanceMeters: null,
          checkoutStatus: null,
          checkoutReviewReason: null,
          earlyDepartureMinutes: null,
          extraWorkedMinutes: null,
          checkoutMessageSid: null,
          isSimulation: true,
          simulationSessionId,
          createdAt: virtual.receivedAt,
        };
      }
    }

    if (!attendance) {
      await completeSessionIfNeeded();
      return respond(companyId, {
        message: NO_CHECK_IN_FOR_CHECKOUT_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (attendance.checkoutAt) {
      await completeSessionIfNeeded();
      const checkoutTime = formatLocalTime(attendance.checkoutAt, getBotOperationTimezone());
      return respond(companyId, {
        message: `${DUPLICATE_CHECKOUT_MESSAGE}\nHora registrada: ${checkoutTime}.`,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const validation = buildCheckoutValidationWithoutLocation({
      checkoutAt,
      scheduledEnd: eligible.expectedEndAt ? new Date(eligible.expectedEndAt) : null,
      runtimeSettings,
    });

    setTechnicalDetail("checkoutValidation", validation);
    setTechnicalDetail("checkoutLocationProvided", false);

    const checkoutMessageInput = {
      eligible,
      checkInAt: attendance.receivedAt,
      checkoutAt,
      distanceMeters: null,
      checkoutStatus: validation.checkoutStatus,
      extraWorkedMinutes: validation.extraWorkedMinutes,
      locationProvided: false,
    } as const;

    if (isSimulationDryRun()) {
      const responseMessage = buildCheckoutRegisteredMessage(checkoutMessageInput);

      completeVirtualCheckOut(attendance.id, {
        checkoutAt: checkoutAt.toISOString(),
        checkoutStatus: validation.checkoutStatus,
      });

      recordSimulationArtifact({
        type: "check-out",
        persisted: false,
        virtualAttendanceId: attendance.id,
        checkoutStatus: validation.checkoutStatus,
        checkoutLocationProvided: false,
        checkoutAt: checkoutAt.toISOString(),
      });

      await completeSessionIfNeeded();

      return respond(companyId, {
        message: `${responseMessage}\n\n[Simulación] Se habría registrado el check-out sin ubicación.`,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
        resultCode: WHATSAPP_RESULT_CODES.CHECKOUT_COMPLETED,
        flowType: "CHECKOUT",
      });
    }

    try {
      await employeeWorkdayCheckoutCommand.registerCheckoutWithoutLocation({
        companyId,
        attendanceId: attendance.id,
        sessionId: input.sessionId,
        fields: {
          checkoutLatitude: null,
          checkoutLongitude: null,
          checkoutDistanceMeters: null,
          checkoutStatus: validation.checkoutStatus,
          checkoutReviewReason: validation.checkoutReviewReason,
          earlyDepartureMinutes: validation.earlyDepartureMinutes,
          extraWorkedMinutes: validation.extraWorkedMinutes,
          checkoutMessageSid: input.messageSid,
          checkoutAt: checkoutAt.toISOString(),
        },
      });
    } catch (error) {
      if (error instanceof CheckoutCommandError) {
        if (
          error.code === "CHECKOUT_DUPLICATE" ||
          error.code === "CHECKOUT_MESSAGE_SID_DUPLICATE"
        ) {
          await completeSessionIfNeeded();
          return respond(companyId, {
            message: DUPLICATE_CHECKOUT_MESSAGE,
            employeeId: input.employeeId,
            phoneFrom: input.phoneTo,
            phoneTo: input.phoneFrom,
          });
        }
      }

      console.error("[whatsapp-bot] checkout without location failed", error);
      return respond(companyId, {
        message: GENERIC_ERROR_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
        resultCode: WHATSAPP_RESULT_CODES.GENERIC_ERROR,
        flowType: "CHECKOUT",
      });
    }

    // Outbound after durable commit — failures here must not imply checkout failure.
    const responseMessage = buildCheckoutRegisteredMessage(checkoutMessageInput);
    return respond(companyId, {
      message: responseMessage,
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.CHECKOUT_COMPLETED,
      flowType: "CHECKOUT",
    });
}

async function processLocationCheckoutWithoutArrival(input: {
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
  eventAt: Date;
  eligibilityAt: Date;
}): Promise<string> {
  const { companyId } = input;
  const revalidation = await revalidateExitWithoutArrivalCandidateByWorkdayId(
    companyId,
    input.employeeId,
    input.employeeWorkdayId,
    input.eligibilityAt,
  );

  if (
    revalidation.kind !== "eligible" ||
    revalidation.candidate.operationId !== input.operationId
  ) {
    const message =
      revalidation.kind === "expired"
        ? PENDING_CHECKOUT_EXPIRED_MESSAGE
        : NO_CHECKOUT_ASSIGNMENT_MESSAGE;
    return respond(companyId, {
      message,
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.NO_OPERATION_ASSIGNED,
      flowType: "CHECKOUT",
    });
  }

  const eligible = revalidation.candidate;
  const runtimeSettings = getBotRuntimeSettings();
  if (!runtimeSettings) {
    throw new Error("Bot runtime settings are not loaded");
  }

  const { validation, distanceMeters: checkoutDistance, effectiveRadiusMeters } =
    buildCheckoutValidation({
      employeeLatitude: input.latitude,
      employeeLongitude: input.longitude,
      serviceLatitude: eligible.serviceLatitude,
      serviceLongitude: eligible.serviceLongitude,
      serviceAllowedRadiusMeters: eligible.allowedRadiusMeters,
      checkoutAt: input.eventAt,
      scheduledEnd: eligible.expectedEndAt ? new Date(eligible.expectedEndAt) : null,
      runtimeSettings,
    });

  setTechnicalDetail("employeeWorkdayId", input.employeeWorkdayId);
  setTechnicalDetail("operationId", input.operationId);
  setTechnicalDetail("checkoutWithoutArrival", true);
  setTechnicalDetail("checkoutDistanceMeters", Math.round(checkoutDistance * 100) / 100);
  setTechnicalDetail("allowedRadiusMeters", effectiveRadiusMeters);
  setTechnicalDetail("checkoutValidation", validation);
  setTechnicalDetail("locationEventAt", input.eventAt.toISOString());

  if (isSimulationDryRun()) {
    const responseMessage = buildCheckoutRegisteredMessage({
      eligible,
      checkInAt: null,
      checkoutAt: input.eventAt,
      distanceMeters: checkoutDistance,
      checkoutStatus: validation.checkoutStatus,
      extraWorkedMinutes: validation.extraWorkedMinutes,
    });
    await botSessionService.completeSession(companyId, input.session.id);
    return respond(companyId, {
      message: `${responseMessage}\n\n[Simulación] Se habría registrado el check-out sin llegada previa.`,
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.CHECKOUT_WITHOUT_ARRIVAL,
      flowType: "CHECKOUT",
    });
  }

  let created: AttendanceRecord;
  try {
    created = await employeeWorkdayCheckoutCommand.registerExitWithoutArrival({
      companyId,
      employeeId: input.employeeId,
      operationId: input.operationId,
      employeeWorkdayId: input.employeeWorkdayId,
      sessionId: input.session.id,
      eligibilityAt: input.eligibilityAt,
      expectedSessionState: "WAITING_CHECKOUT_LOCATION",
      fields: {
        checkoutLatitude: input.latitude,
        checkoutLongitude: input.longitude,
        checkoutDistanceMeters: Math.round(checkoutDistance * 100) / 100,
        checkoutStatus: validation.checkoutStatus,
        checkoutReviewReason: validation.checkoutReviewReason,
        earlyDepartureMinutes: validation.earlyDepartureMinutes,
        extraWorkedMinutes: validation.extraWorkedMinutes,
        checkoutMessageSid: input.messageSid,
        checkoutAt: input.eventAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof CheckoutCommandError) {
      const mapped = await respondCheckoutCommandError({
        companyId,
        employeeId: input.employeeId,
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
        error,
        sessionId: input.session.id,
        unavailableMessage: NO_CHECKOUT_ASSIGNMENT_MESSAGE,
      });
      if (mapped) {
        return mapped;
      }
    }

    console.error("[whatsapp-bot] exit-without-arrival checkout failed", error);
    return respond(companyId, {
      message: GENERIC_ERROR_MESSAGE,
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.GENERIC_ERROR,
      flowType: "CHECKOUT",
    });
  }

  const responseMessage = buildCheckoutRegisteredMessage({
    eligible,
    checkInAt: null,
    checkoutAt: input.eventAt,
    distanceMeters: created.checkoutDistanceMeters ?? 0,
    checkoutStatus: validation.checkoutStatus,
    extraWorkedMinutes: validation.extraWorkedMinutes,
  });

  logWhatsAppAttendanceEvent("LOCATION_ATTENDANCE_RECORDED", {
    producer: "BOT_CHECK_OUT",
    companyId: input.companyId,
    employeeId: input.employeeId,
    operationId: input.operationId,
    messageSid: input.messageSid,
    checkoutStatus: validation.checkoutStatus,
    checkoutWithoutArrival: true,
    attendanceId: created.id,
    resultCode:
      validation.checkoutStatus === "CHECKOUT_REJECTED"
        ? WHATSAPP_RESULT_CODES.LOCATION_OUTSIDE_ALLOWED_RADIUS
        : WHATSAPP_RESULT_CODES.CHECKOUT_WITHOUT_ARRIVAL,
  });

  return respond(companyId, {
    message: responseMessage,
    employeeId: input.employeeId,
    phoneFrom: input.phoneTo,
    phoneTo: input.phoneFrom,
    resultCode:
      validation.checkoutStatus === "CHECKOUT_REJECTED"
        ? WHATSAPP_RESULT_CODES.LOCATION_OUTSIDE_ALLOWED_RADIUS
        : WHATSAPP_RESULT_CODES.CHECKOUT_WITHOUT_ARRIVAL,
    flowType: "CHECKOUT",
  });
}

export async function processLocationCheckout(input: {
    companyId: string;
    session: BotSession;
    employeeId: string;
    employeeWorkdayId: string;
    attendanceRecordId?: string | null;
    operationId: string;
    latitude: number;
    longitude: number;
    messageSid: string;
    phoneFrom: string;
    phoneTo: string;
    /** Instant of the LOCATION WhatsApp event (defaults to now). */
    eventAt?: Date;
    checkoutWithoutArrival?: boolean;
  }): Promise<string> {
    const { companyId } = input;
    const eventAt = input.eventAt ?? getBotNow();
    const eligibilityAt = getBotNow();
    const exitWithoutArrival = isExitWithoutArrivalCheckout({
      attendanceRecordId: input.attendanceRecordId,
      checkoutWithoutArrival: input.checkoutWithoutArrival,
    });

    if (exitWithoutArrival) {
      return processLocationCheckoutWithoutArrival({
        ...input,
        eventAt,
        eligibilityAt,
      });
    }

    const revalidation = await revalidateCheckoutCandidateByAttendanceId(
      companyId,
      input.employeeId,
      input.attendanceRecordId!,
      eligibilityAt,
    );

    if (
      revalidation.kind !== "eligible" ||
      revalidation.candidate.employeeWorkdayId !== input.employeeWorkdayId ||
      revalidation.candidate.operationId !== input.operationId
    ) {
      const message =
        revalidation.kind === "expired"
          ? PENDING_CHECKOUT_EXPIRED_MESSAGE
          : NO_CHECKOUT_OPERATION_MESSAGE;
      return respond(companyId, {
        message,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const eligible = revalidation.candidate;

    const simulationSessionId = getSimulationSessionId();
    let attendance: AttendanceRecord | null = null;

    if (!isSimulationDryRun()) {
      attendance = await attendanceRepository.findCheckInForEmployeeWorkday(
        companyId,
        input.employeeWorkdayId,
        { simulationSessionId },
      );
      if (attendance && attendance.id !== input.attendanceRecordId) {
        attendance = null;
      }
    }

    if (isSimulationDryRun()) {
      const virtual = findVirtualCheckInForCheckout(input.employeeWorkdayId);
      if (virtual) {
        attendance = {
          id: virtual.id,
          operationId: virtual.operationId,
          employeeId: virtual.employeeId,
          employeeWorkdayId: virtual.employeeWorkdayId,
          receivedLatitude: input.latitude,
          receivedLongitude: input.longitude,
          distanceMeters: virtual.distanceMeters,
          validationStatus: virtual.validationStatus as AttendanceRecord["validationStatus"],
          locationStatus: virtual.locationStatus as AttendanceRecord["locationStatus"],
          punctualityStatus: virtual.punctualityStatus as AttendanceRecord["punctualityStatus"],
          sourceMessageSid: null,
          validationReason: null,
          reviewedBy: null,
          reviewedAt: null,
          reviewReason: null,
          receivedAt: virtual.receivedAt,
          checkoutAt: virtual.checkoutAt,
          checkoutLatitude: null,
          checkoutLongitude: null,
          checkoutDistanceMeters: null,
          checkoutStatus: null,
          checkoutReviewReason: null,
          earlyDepartureMinutes: null,
          extraWorkedMinutes: null,
          checkoutMessageSid: null,
          isSimulation: true,
          simulationSessionId,
          createdAt: virtual.receivedAt,
        };
      }
    }

    if (!attendance) {
      return respond(companyId, {
        message: NO_CHECK_IN_FOR_CHECKOUT_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (attendance.checkoutAt) {
      await botSessionService.completeSession(companyId, input.session.id);
      const checkoutTime = formatLocalTime(attendance.checkoutAt, getBotOperationTimezone());
      return respond(companyId, {
        message: `${DUPLICATE_CHECKOUT_MESSAGE}\nHora registrada: ${checkoutTime}.`,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const runtimeSettings = getBotRuntimeSettings();
    if (!runtimeSettings) {
      throw new Error("Bot runtime settings are not loaded");
    }

    const { validation, distanceMeters: checkoutDistance, effectiveRadiusMeters } = buildCheckoutValidation({
      employeeLatitude: input.latitude,
      employeeLongitude: input.longitude,
      serviceLatitude: eligible.serviceLatitude,
      serviceLongitude: eligible.serviceLongitude,
      serviceAllowedRadiusMeters: eligible.allowedRadiusMeters,
      checkoutAt: eventAt,
      scheduledEnd: eligible.expectedEndAt ? new Date(eligible.expectedEndAt) : null,
      runtimeSettings,
    });

    setTechnicalDetail("employeeWorkdayId", input.employeeWorkdayId);
    setTechnicalDetail("attendanceRecordId", input.attendanceRecordId);
    setTechnicalDetail("checkoutDistanceMeters", Math.round(checkoutDistance * 100) / 100);
    setTechnicalDetail("allowedRadiusMeters", effectiveRadiusMeters);
    setTechnicalDetail("reviewMarginMeters", runtimeSettings.geofenceReviewMarginMeters);
    setTechnicalDetail("checkoutValidation", validation);
    setTechnicalDetail("locationEventAt", eventAt.toISOString());

    if (isSimulationDryRun()) {
      const responseMessage = buildCheckoutRegisteredMessage({
        eligible,
        checkInAt: attendance.receivedAt,
        checkoutAt: eventAt,
        distanceMeters: checkoutDistance,
        checkoutStatus: validation.checkoutStatus,
        extraWorkedMinutes: validation.extraWorkedMinutes,
      });

      completeVirtualCheckOut(attendance.id, {
        checkoutAt: eventAt.toISOString(),
        checkoutStatus: validation.checkoutStatus,
      });

      recordSimulationArtifact({
        type: "check-out",
        persisted: false,
        virtualAttendanceId: attendance.id,
        employeeWorkdayId: input.employeeWorkdayId,
        checkoutStatus: validation.checkoutStatus,
        distanceMeters: Math.round(checkoutDistance * 100) / 100,
        checkoutAt: eventAt.toISOString(),
      });

      await botSessionService.completeSession(companyId, input.session.id);

      return respond(companyId, {
        message: `${responseMessage}\n\n[Simulación] Se habría registrado el check-out.`,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    let updated: AttendanceRecord;
    try {
      updated = await employeeWorkdayCheckoutCommand.registerCheckoutWithLocation({
        companyId,
        employeeId: input.employeeId,
        attendanceId: attendance.id,
        sessionId: input.session.id,
        employeeWorkdayId: input.employeeWorkdayId,
        attendanceRecordId: input.attendanceRecordId!,
        eligibilityAt,
        expectedSessionState: "WAITING_CHECKOUT_LOCATION",
        fields: {
          checkoutLatitude: input.latitude,
          checkoutLongitude: input.longitude,
          checkoutDistanceMeters: Math.round(checkoutDistance * 100) / 100,
          checkoutStatus: validation.checkoutStatus,
          checkoutReviewReason: validation.checkoutReviewReason,
          earlyDepartureMinutes: validation.earlyDepartureMinutes,
          extraWorkedMinutes: validation.extraWorkedMinutes,
          checkoutMessageSid: input.messageSid,
          checkoutAt: eventAt.toISOString(),
        },
      });
    } catch (error) {
      if (error instanceof CheckoutCommandError) {
        const mapped = await respondCheckoutCommandError({
          companyId,
          employeeId: input.employeeId,
          phoneFrom: input.phoneFrom,
          phoneTo: input.phoneTo,
          error,
          sessionId: input.session.id,
        });
        if (mapped) {
          return mapped;
        }
      }

      console.error("[whatsapp-bot] checkout transaction failed", error);
      return respond(companyId, {
        message: GENERIC_ERROR_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
        resultCode: WHATSAPP_RESULT_CODES.GENERIC_ERROR,
        flowType: "CHECKOUT",
      });
    }

    if (getSimulationSessionId()) {
      recordSimulationArtifact({
        type: "check-out",
        persisted: true,
        attendanceId: updated.id,
        employeeWorkdayId: input.employeeWorkdayId,
        checkoutStatus: validation.checkoutStatus,
        distanceMeters: Math.round(checkoutDistance * 100) / 100,
        checkoutAt: eventAt.toISOString(),
      });
    }

    // Outbound after durable commit — failures here must not imply checkout failure.
    const responseMessage = buildCheckoutRegisteredMessage({
      eligible,
      checkInAt: attendance.receivedAt,
      checkoutAt: eventAt,
      distanceMeters: updated.checkoutDistanceMeters ?? 0,
      checkoutStatus: validation.checkoutStatus,
      extraWorkedMinutes: validation.extraWorkedMinutes,
    });

    logWhatsAppAttendanceEvent("LOCATION_ATTENDANCE_RECORDED", {
      producer: "BOT_CHECK_OUT",
      companyId: input.companyId,
      employeeId: input.employeeId,
      operationId: input.operationId,
      messageSid: input.messageSid,
      checkoutStatus: validation.checkoutStatus,
      resultCode:
        validation.checkoutStatus === "CHECKOUT_REJECTED"
          ? WHATSAPP_RESULT_CODES.LOCATION_OUTSIDE_ALLOWED_RADIUS
          : WHATSAPP_RESULT_CODES.CHECKOUT_COMPLETED,
    });

    return respond(companyId, {
      message: responseMessage,
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
      resultCode:
        validation.checkoutStatus === "CHECKOUT_REJECTED"
          ? WHATSAPP_RESULT_CODES.LOCATION_OUTSIDE_ALLOWED_RADIUS
          : WHATSAPP_RESULT_CODES.CHECKOUT_COMPLETED,
      flowType: "CHECKOUT",
    });
}

export async function startCheckout(input: {
    companyId: string;
    employeeId: string;
    phoneFrom: string;
    phoneTo: string;
    messageSid: string;
  }): Promise<string> {
    const { companyId } = input;
    const now = getBotNow();
    let eligible = await listOpenCheckoutWorkdays(companyId, input.employeeId, now);
    let withoutArrival = false;

    if (eligible.length === 0) {
      eligible = await listExitWithoutArrivalCheckoutWorkdays(
        companyId,
        input.employeeId,
        now,
      );
      withoutArrival = eligible.length > 0;
    }

    if (eligible.length === 0) {
      return respond(companyId, {
        message: NO_CHECKOUT_ASSIGNMENT_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
        resultCode: WHATSAPP_RESULT_CODES.NO_OPERATION_ASSIGNED,
        flowType: "CHECKOUT",
      });
    }

    const finalizeWithoutLocation = async (candidate: (typeof eligible)[number]) => {
      if (candidate.checkoutWithoutArrival || withoutArrival) {
        return processCheckoutWithoutArrivalWithoutLocation({
          companyId,
          employeeId: input.employeeId,
          employeeWorkdayId: candidate.employeeWorkdayId,
          operationId: candidate.operationId,
          phoneFrom: input.phoneFrom,
          phoneTo: input.phoneTo,
          messageSid: input.messageSid,
        });
      }

      return processCheckoutWithoutLocation({
        companyId,
        employeeId: input.employeeId,
        employeeWorkdayId: candidate.employeeWorkdayId,
        attendanceRecordId: candidate.attendanceRecordId!,
        operationId: candidate.operationId,
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
        messageSid: input.messageSid,
      });
    };

    if (eligible.length === 1) {
      const candidate = eligible[0];
      if (!getRequireCheckoutLocation()) {
        return finalizeWithoutLocation(candidate);
      }

      await botSessionService.createWaitingCheckoutLocationSession(companyId, {
        employeeId: input.employeeId,
        phoneNumber: input.phoneFrom,
        operationId: candidate.operationId,
        employeeWorkdayId: candidate.employeeWorkdayId,
        attendanceRecordId: candidate.attendanceRecordId,
        checkoutWithoutArrival: candidate.checkoutWithoutArrival || withoutArrival,
      });

      return respond(companyId, {
        message: buildCheckoutLocationRequestMessage(candidate),
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
        resultCode: WHATSAPP_RESULT_CODES.LOCATION_REQUIRED,
        flowType: "CHECKOUT",
      });
    }

    if (!getRequireCheckoutLocation()) {
      const options = mapCheckoutCandidatesToSessionOptions(eligible);
      await botSessionService.createCheckoutOperationSelectionSession(companyId, {
        employeeId: input.employeeId,
        phoneNumber: input.phoneFrom,
        options,
      });

      return respond(companyId, {
        message: `${buildCheckoutWorkdaySelectionPrompt(eligible)}\n\nNo se requiere ubicación para registrar la salida.`,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const options = mapCheckoutCandidatesToSessionOptions(eligible);

    await botSessionService.createCheckoutOperationSelectionSession(companyId, {
      employeeId: input.employeeId,
      phoneNumber: input.phoneFrom,
      options,
    });

    return respond(companyId, {
      message: buildCheckoutWorkdaySelectionPrompt(eligible),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
}

async function processCheckoutWithoutArrivalWithoutLocation(input: {
  companyId: string;
  employeeId: string;
  employeeWorkdayId: string;
  operationId: string;
  phoneFrom: string;
  phoneTo: string;
  messageSid: string;
  sessionId?: string;
}): Promise<string> {
  const { companyId } = input;
  const checkoutAt = getBotNow();
  const revalidation = await revalidateExitWithoutArrivalCandidateByWorkdayId(
    companyId,
    input.employeeId,
    input.employeeWorkdayId,
    checkoutAt,
  );

  if (
    revalidation.kind !== "eligible" ||
    revalidation.candidate.operationId !== input.operationId
  ) {
    if (input.sessionId) {
      await botSessionService.completeSession(companyId, input.sessionId);
    }
    return respond(companyId, {
      message:
        revalidation.kind === "expired"
          ? PENDING_CHECKOUT_EXPIRED_MESSAGE
          : NO_CHECKOUT_ASSIGNMENT_MESSAGE,
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.NO_OPERATION_ASSIGNED,
      flowType: "CHECKOUT",
    });
  }

  const eligible = revalidation.candidate;
  const runtimeSettings = getBotRuntimeSettings();
  if (!runtimeSettings) {
    throw new Error("Bot runtime settings are not loaded");
  }

  const validation = buildCheckoutValidationWithoutLocation({
    checkoutAt,
    scheduledEnd: eligible.expectedEndAt ? new Date(eligible.expectedEndAt) : null,
    runtimeSettings,
  });

  try {
    await employeeWorkdayCheckoutCommand.registerExitWithoutArrival({
      companyId,
      employeeId: input.employeeId,
      operationId: input.operationId,
      employeeWorkdayId: input.employeeWorkdayId,
      sessionId: input.sessionId,
      eligibilityAt: checkoutAt,
      fields: {
        checkoutLatitude: null,
        checkoutLongitude: null,
        checkoutDistanceMeters: null,
        checkoutStatus: validation.checkoutStatus,
        checkoutReviewReason: validation.checkoutReviewReason,
        earlyDepartureMinutes: validation.earlyDepartureMinutes,
        extraWorkedMinutes: validation.extraWorkedMinutes,
        checkoutMessageSid: input.messageSid,
        checkoutAt: checkoutAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof CheckoutCommandError) {
      const mapped = await respondCheckoutCommandError({
        companyId,
        employeeId: input.employeeId,
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
        error,
        sessionId: input.sessionId,
        unavailableMessage: NO_CHECKOUT_ASSIGNMENT_MESSAGE,
      });
      if (mapped) {
        return mapped;
      }
    }
    console.error("[whatsapp-bot] exit-without-arrival without location failed", error);
    return respond(companyId, {
      message: GENERIC_ERROR_MESSAGE,
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.GENERIC_ERROR,
      flowType: "CHECKOUT",
    });
  }

  const responseMessage = buildCheckoutRegisteredMessage({
    eligible,
    checkInAt: null,
    checkoutAt,
    distanceMeters: null,
    checkoutStatus: validation.checkoutStatus,
    extraWorkedMinutes: validation.extraWorkedMinutes,
    locationProvided: false,
  });

  return respond(companyId, {
    message: responseMessage,
    employeeId: input.employeeId,
    phoneFrom: input.phoneTo,
    phoneTo: input.phoneFrom,
    resultCode: WHATSAPP_RESULT_CODES.CHECKOUT_WITHOUT_ARRIVAL,
    flowType: "CHECKOUT",
  });
}

export async function handleCheckoutOperationSelection(input: {
    companyId: string;
    session: BotSession;
    body: string;
    employeeId: string;
    phoneFrom: string;
    phoneTo: string;
    messageSid: string;
  }): Promise<string> {
    const { companyId } = input;
    const selection = parseWorkdaySelectionIndex(input.body);
    const context = botSessionService.parseContext(input.session.contextJson);
    const options = resolveWorkdayOptionsFromSessionContext(context) ?? [];

    if (!isValidWorkdaySelection(selection, options.length)) {
      return respond(companyId, {
        message: INVALID_SELECTION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
        resultCode: WHATSAPP_RESULT_CODES.INVALID_SELECTION,
        flowType: "CHECKOUT",
      });
    }

    const selected = resolveWorkdayOptionFromSession(options, selection);
    if (!selected) {
      return respond(companyId, {
        message: NO_CHECKOUT_OPERATION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const exitWithoutArrival = isExitWithoutArrivalCheckout({
      attendanceRecordId: selected.attendanceRecordId,
      checkoutWithoutArrival: selected.checkoutWithoutArrival,
    });

    if (exitWithoutArrival) {
      const revalidation = await revalidateExitWithoutArrivalCandidateByWorkdayId(
        companyId,
        input.employeeId,
        selected.employeeWorkdayId,
        getBotNow(),
      );

      if (revalidation.kind !== "eligible") {
        return respond(companyId, {
          message: messageForCheckoutRevalidationFailure(revalidation),
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      const eligible = revalidation.candidate;

      if (!getRequireCheckoutLocation()) {
        return processCheckoutWithoutArrivalWithoutLocation({
          companyId,
          employeeId: input.employeeId,
          employeeWorkdayId: eligible.employeeWorkdayId,
          operationId: eligible.operationId,
          phoneFrom: input.phoneFrom,
          phoneTo: input.phoneTo,
          messageSid: input.messageSid,
          sessionId: input.session.id,
        });
      }

      const selectionResult = await botSessionService.selectCheckoutOperationAndRenewExpiration(
        companyId,
        input.session.id,
        {
          operationId: eligible.operationId,
          employeeWorkdayId: eligible.employeeWorkdayId,
          attendanceRecordId: null,
          checkoutWithoutArrival: true,
        },
      );

      if (selectionResult.kind === "expired") {
        return respond(companyId, {
          message: EXPIRED_SESSION_MESSAGE,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
          resultCode: WHATSAPP_RESULT_CODES.SESSION_EXPIRED,
          flowType: "CHECKOUT",
        });
      }

      if (selectionResult.kind !== "ok") {
        return respond(companyId, {
          message: INVALID_SELECTION_MESSAGE,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
          resultCode: WHATSAPP_RESULT_CODES.INVALID_SELECTION,
          flowType: "CHECKOUT",
        });
      }

      const pendingLocation = context.pendingLocation;
      if (pendingLocation) {
        return processLocationCheckout({
          companyId,
          session: selectionResult.session,
          employeeId: input.employeeId,
          employeeWorkdayId: eligible.employeeWorkdayId,
          attendanceRecordId: null,
          operationId: eligible.operationId,
          latitude: pendingLocation.latitude,
          longitude: pendingLocation.longitude,
          messageSid: pendingLocation.messageSid,
          phoneFrom: input.phoneFrom,
          phoneTo: input.phoneTo,
          eventAt: resolvePendingLocationEventAt(pendingLocation),
          checkoutWithoutArrival: true,
        });
      }

      return respond(companyId, {
        message: buildCheckoutLocationRequestMessage(eligible),
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
        resultCode: WHATSAPP_RESULT_CODES.LOCATION_REQUIRED,
        flowType: "CHECKOUT",
      });
    }

    if (!selected.attendanceRecordId) {
      return respond(companyId, {
        message: NO_CHECKOUT_OPERATION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const revalidation = await revalidateCheckoutCandidateByAttendanceId(
      companyId,
      input.employeeId,
      selected.attendanceRecordId,
      getBotNow(),
    );

    if (revalidation.kind !== "eligible") {
      return respond(companyId, {
        message: messageForCheckoutRevalidationFailure(revalidation),
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const eligible = revalidation.candidate;

    if (!getRequireCheckoutLocation()) {
      return processCheckoutWithoutLocation({
        companyId,
        employeeId: input.employeeId,
        employeeWorkdayId: eligible.employeeWorkdayId,
        attendanceRecordId: eligible.attendanceRecordId!,
        operationId: eligible.operationId,
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
        messageSid: input.messageSid,
        sessionId: input.session.id,
      });
    }

    const selectionResult = await botSessionService.selectCheckoutOperationAndRenewExpiration(
      companyId,
      input.session.id,
      {
        operationId: eligible.operationId,
        employeeWorkdayId: eligible.employeeWorkdayId,
        attendanceRecordId: eligible.attendanceRecordId,
      },
    );

    if (selectionResult.kind === "expired") {
      return respond(companyId, {
        message: EXPIRED_SESSION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
        resultCode: WHATSAPP_RESULT_CODES.SESSION_EXPIRED,
        flowType: "CHECKOUT",
      });
    }

    if (selectionResult.kind !== "ok") {
      return respond(companyId, {
        message: INVALID_SELECTION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
        resultCode: WHATSAPP_RESULT_CODES.INVALID_SELECTION,
        flowType: "CHECKOUT",
      });
    }

    const pendingLocation = context.pendingLocation;
    if (pendingLocation) {
      return processLocationCheckout({
        companyId,
        session: selectionResult.session,
        employeeId: input.employeeId,
        employeeWorkdayId: eligible.employeeWorkdayId,
        attendanceRecordId: eligible.attendanceRecordId,
        operationId: eligible.operationId,
        latitude: pendingLocation.latitude,
        longitude: pendingLocation.longitude,
        messageSid: pendingLocation.messageSid,
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
        eventAt: resolvePendingLocationEventAt(pendingLocation),
      });
    }

    return respond(companyId, {
      message: buildCheckoutLocationRequestMessage(eligible),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.LOCATION_REQUIRED,
      flowType: "CHECKOUT",
    });
}
