/**
 * Check-in conversation flows for WhatsApp (start, workday selection, location).
 * Mixed selection sessions may hand off to checkout flow processors.
 */
import { attendanceRepository } from "../../repositories/attendance.repository";
import { EXPIRED_SESSION_USER_MESSAGE } from "../../utils/bot-session-expiration";
import { getBotRuntimeSettings, getRequireCheckoutLocation } from "../../utils/bot-runtime-settings-scope";
import { getObservabilityTrace } from "../../utils/whatsapp-observability-scope";
import { WHATSAPP_RESULT_CODES } from "../../constants/whatsapp-observability";
import { logWhatsAppAttendanceEvent } from "../../utils/whatsapp-notification-observability";
import { companyModuleService } from "../company-module.service";
import {
  getAttendanceModuleBlockedMessage,
  getCheckInModuleBlockedMessage,
} from "../whatsapp-module-gate";
import { buildCheckInValidation } from "./bot-attendance-runtime";
import { botSessionService } from "../bot-session.service";
import { employeeWorkdayAttendanceCommand } from "../employee-workday-attendance.command";
import { employeeWorkdayAvailabilityService } from "../employee-workday-availability.service";
import {
  buildArrivalRegisteredMessage,
  buildCheckoutLocationRequestMessage,
  buildLocationRequestMessage,
  buildWorkdaySelectionPrompt,
  DUPLICATE_ATTENDANCE_MESSAGE,
  GENERIC_ERROR_MESSAGE,
  INVALID_SELECTION_MESSAGE,
  NO_CHECKOUT_OPERATION_MESSAGE,
  PENDING_CHECKOUT_EXPIRED_MESSAGE,
  ARRIVAL_DURING_APPROVED_ABSENCE_MESSAGE,
  NO_JUSTIFIED_ONLY_MESSAGE,
  NO_OPERATION_MESSAGE,
  WORKDAY_NO_LONGER_AVAILABLE_MESSAGE,
} from "./bot-response.builder";
import {
  findCheckInCandidateByWorkdayId,
  isValidWorkdaySelection,
  listAvailableCheckInWorkdays,
  mapCheckInCandidatesToSessionOptions,
  parseWorkdaySelectionIndex,
  resolvePendingLocationEventAt,
  resolveWorkdayOptionFromSession,
  revalidateCheckoutCandidateByAttendanceId,
  type CheckoutCandidateRevalidationResult,
} from "./bot-workday.selector";
import { resolveWorkdayOptionsFromSessionContext } from "../../utils/legacy-operation-session-context";
import type { BotSession } from "../../types/twilio.types";
import {
  addVirtualCheckIn,
  getBotNow,
  getSimulationSessionId,
  hasVirtualActiveRecord,
  isSimulationDryRun,
  recordSimulationArtifact,
  setTechnicalDetail,
} from "../../utils/bot-runtime-context";
import { respond } from "./bot-outbound-response";
import {
  processCheckoutWithoutLocation,
  processLocationCheckout,
} from "./checkout-attendance.flow";

const EXPIRED_SESSION_MESSAGE = EXPIRED_SESSION_USER_MESSAGE;

const messageForCheckoutRevalidationFailure = (
  result: CheckoutCandidateRevalidationResult,
): string =>
  result.kind === "expired"
    ? PENDING_CHECKOUT_EXPIRED_MESSAGE
    : NO_CHECKOUT_OPERATION_MESSAGE;

export async function processLocationCheckIn(input: {
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
    /** Instant of the LOCATION WhatsApp event (defaults to now). */
    eventAt?: Date;
  }): Promise<string> {
    const { companyId } = input;
    const eventAt = input.eventAt ?? getBotNow();
    const eligibilityAt = getBotNow();
    const workday = await employeeWorkdayAvailabilityService.revalidateCheckInCandidate(
      companyId,
      input.employeeId,
      input.employeeWorkdayId,
      eligibilityAt,
    );

    if (!workday || workday.operationId !== input.operationId) {
      return respond(companyId, {
        message: WORKDAY_NO_LONGER_AVAILABLE_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const hasActiveRecord = isSimulationDryRun()
      ? hasVirtualActiveRecord(input.employeeWorkdayId)
      : await attendanceRepository.hasActiveRecordByEmployeeWorkday(
          companyId,
          input.employeeWorkdayId,
          { simulationSessionId: getSimulationSessionId() },
        );
    if (hasActiveRecord) {
      await botSessionService.completeSession(companyId, input.session.id);
      return respond(companyId, {
        message: DUPLICATE_ATTENDANCE_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const runtimeSettings = getBotRuntimeSettings();
    if (!runtimeSettings) {
      throw new Error("Bot runtime settings are not loaded");
    }

    const { validation, distanceMeters: geoDistance, effectiveRadiusMeters } = buildCheckInValidation({
      employeeLatitude: input.latitude,
      employeeLongitude: input.longitude,
      serviceLatitude: workday.serviceLatitude,
      serviceLongitude: workday.serviceLongitude,
      serviceAllowedRadiusMeters: workday.allowedRadiusMeters,
      receivedAt: eventAt,
      scheduledStart: new Date(workday.expectedStartAt),
      expectedEndAt: workday.expectedEndAt ? new Date(workday.expectedEndAt) : null,
      earlyToleranceMinutes: workday.earlyToleranceMinutes,
      lateToleranceMinutes: workday.lateToleranceMinutes,
      runtimeSettings,
    });

    setTechnicalDetail("employeeWorkdayId", input.employeeWorkdayId);
    setTechnicalDetail("distanceMeters", Math.round(geoDistance * 100) / 100);
    setTechnicalDetail("allowedRadiusMeters", effectiveRadiusMeters);
    setTechnicalDetail("reviewMarginMeters", runtimeSettings.geofenceReviewMarginMeters);
    setTechnicalDetail("locationValidation", validation);
    setTechnicalDetail("runtimeSettingsSource", runtimeSettings.companyId);
    setTechnicalDetail("locationEventAt", eventAt.toISOString());

    if (isSimulationDryRun()) {
      const responseMessage = buildArrivalRegisteredMessage({
        compatible: workday,
        distanceMeters: geoDistance,
        validationStatus: validation.validationStatus,
        punctualityStatus: validation.punctualityStatus,
        validationReason: validation.validationReason,
        receivedAt: eventAt,
      });

      const virtualRecord = addVirtualCheckIn({
        operationId: workday.operationId,
        employeeId: input.employeeId,
        employeeWorkdayId: input.employeeWorkdayId,
        receivedAt: eventAt.toISOString(),
        validationStatus: validation.validationStatus,
        locationStatus: validation.locationStatus,
        punctualityStatus: validation.punctualityStatus,
        distanceMeters: Math.round(geoDistance * 100) / 100,
      });

      recordSimulationArtifact({
        type: "check-in",
        persisted: false,
        virtualAttendanceId: virtualRecord.id,
        employeeWorkdayId: input.employeeWorkdayId,
        operationId: workday.operationId,
        employeeId: input.employeeId,
        validationStatus: validation.validationStatus,
        locationStatus: validation.locationStatus,
        punctualityStatus: validation.punctualityStatus,
        distanceMeters: Math.round(geoDistance * 100) / 100,
        receivedAt: eventAt.toISOString(),
      });

      await botSessionService.completeSession(companyId, input.session.id);

      return respond(companyId, {
        message: `${responseMessage}\n\n[Simulación] Se habría creado un registro de asistencia.`,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    try {
      const created = await employeeWorkdayAttendanceCommand.createAttendanceForEmployeeWorkday({
        companyId,
        employeeId: input.employeeId,
        employeeWorkdayId: input.employeeWorkdayId,
        sessionId: input.session.id,
        receivedAt: eventAt,
        eligibilityAt,
        latitude: input.latitude,
        longitude: input.longitude,
        distanceMeters: Math.round(geoDistance * 100) / 100,
        validation,
        messageSid: input.messageSid,
      });

      if (getSimulationSessionId()) {
        recordSimulationArtifact({
          type: "check-in",
          persisted: true,
          attendanceId: created.attendance.id,
          employeeWorkdayId: input.employeeWorkdayId,
          operationId: workday.operationId,
          employeeId: input.employeeId,
          validationStatus: validation.validationStatus,
          locationStatus: validation.locationStatus,
          punctualityStatus: validation.punctualityStatus,
          distanceMeters: Math.round(geoDistance * 100) / 100,
          receivedAt: eventAt.toISOString(),
        });
      }

      console.info("[whatsapp-bot] attendance created", {
        employeeId: input.employeeId,
        employeeWorkdayId: input.employeeWorkdayId,
        operationId: workday.operationId,
        validationStatus: validation.validationStatus,
        recordedDuringApprovedAbsence: created.recordedDuringApprovedAbsence,
        locationEventAt: eventAt.toISOString(),
      });
      logWhatsAppAttendanceEvent("LOCATION_ATTENDANCE_RECORDED", {
        producer: "BOT_CHECK_IN",
        companyId,
        employeeId: input.employeeId,
        operationId: workday.operationId,
        messageSid: input.messageSid,
        validationStatus: validation.validationStatus,
        locationStatus: validation.locationStatus,
        punctualityStatus: validation.punctualityStatus,
        resultCode:
          validation.locationStatus === "OUTSIDE_GEOFENCE"
            ? WHATSAPP_RESULT_CODES.LOCATION_OUTSIDE_ALLOWED_RADIUS
            : WHATSAPP_RESULT_CODES.CHECKIN_COMPLETED,
      });

      const responseMessage = created.recordedDuringApprovedAbsence
        ? ARRIVAL_DURING_APPROVED_ABSENCE_MESSAGE
        : buildArrivalRegisteredMessage({
            compatible: workday,
            distanceMeters: geoDistance,
            validationStatus: validation.validationStatus,
            punctualityStatus: validation.punctualityStatus,
            validationReason: validation.validationReason,
            receivedAt: eventAt,
          });

      return respond(companyId, {
        message: responseMessage,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
        resultCode:
          validation.locationStatus === "OUTSIDE_GEOFENCE"
            ? WHATSAPP_RESULT_CODES.LOCATION_OUTSIDE_ALLOWED_RADIUS
            : WHATSAPP_RESULT_CODES.CHECKIN_COMPLETED,
        flowType: "CHECKIN",
      });
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.message === "EMPLOYEE_WORKDAY_ALREADY_ATTENDED" ||
          error.message.includes("UQ_attendance_records_source_message_sid") ||
          error.message.includes("UX_attendance_records_inventory_employee_active") ||
          error.message.includes("UX_attendance_records_employee_workday_active")
        ) {
          await botSessionService.completeSession(companyId, input.session.id);
          return respond(companyId, {
            message: DUPLICATE_ATTENDANCE_MESSAGE,
            employeeId: input.employeeId,
            phoneFrom: input.phoneTo,
            phoneTo: input.phoneFrom,
          });
        }

        if (
          error.message === "EMPLOYEE_WORKDAY_NOT_AVAILABLE" ||
          error.message === "BOT_SESSION_STALE"
        ) {
          return respond(companyId, {
            message: WORKDAY_NO_LONGER_AVAILABLE_MESSAGE,
            employeeId: input.employeeId,
            phoneFrom: input.phoneTo,
            phoneTo: input.phoneFrom,
          });
        }
      }

      console.error("[whatsapp-bot] transaction failed", error);
      return respond(companyId, {
        message: GENERIC_ERROR_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
        resultCode: WHATSAPP_RESULT_CODES.GENERIC_ERROR,
        flowType: "CHECKIN",
      });
    }
}

export async function startCheckIn(input: {
    companyId: string;
    employeeId: string;
    phoneFrom: string;
    phoneTo: string;
  }): Promise<string> {
    const { companyId } = input;
    const now = getBotNow();
    const { candidates, hasJustifiedWorkdayInWindow } = await listAvailableCheckInWorkdays(
      companyId,
      input.employeeId,
      now,
    );

    if (candidates.length === 0) {
      try {
        const diagnosis = await employeeWorkdayAvailabilityService.diagnoseCheckInUnavailability(
          companyId,
          input.employeeId,
          now,
          {
            hasJustifiedWorkdayInWindow,
            eligibleCandidateCount: 0,
          },
        );
        console.info("[whatsapp-bot] no available employee workday", {
          companyId,
          employeeId: input.employeeId,
          at: now.toISOString(),
          candidateFrom: diagnosis.candidateFrom,
          candidateTo: diagnosis.candidateTo,
          rawCandidateCount: diagnosis.rawCandidateCount,
          eligibleCandidateCount: diagnosis.eligibleCandidateCount,
          hasJustifiedWorkdayInWindow: diagnosis.hasJustifiedWorkdayInWindow,
          reasonCodes: diagnosis.reasonCodes,
          candidateRejections: diagnosis.candidateEvaluations
            .filter((evaluation) => !evaluation.eligible)
            .map((evaluation) => ({
              employeeWorkdayId: evaluation.employeeWorkdayId,
              operationWorkdayId: evaluation.operationWorkdayId,
              operationId: evaluation.operationId,
              rejectionReasons: evaluation.rejectionReasons,
              priorAttendanceId: evaluation.priorAttendanceId,
            })),
          nearbyWorkdayCount: diagnosis.nearbyWorkdayCount,
          assignedOperationCount: diagnosis.assignedOperationCount,
          operationIds: diagnosis.operationIds,
          workdayIds: diagnosis.workdayIds,
          timezone: diagnosis.timezone,
        });

        const obsTrace = getObservabilityTrace();
        if (obsTrace) {
          await obsTrace.addStep({
            stepType: "CANDIDATE_LOOKUP",
            status: "REJECTED",
            reasonCode: WHATSAPP_RESULT_CODES.NO_AVAILABLE_EMPLOYEE_WORKDAY,
            output: {
              reasonCodes: diagnosis.reasonCodes,
              rawCandidateCount: diagnosis.rawCandidateCount,
              eligibleCandidateCount: diagnosis.eligibleCandidateCount,
            },
          });
          await obsTrace.addCandidates(
            diagnosis.candidateEvaluations.map((evaluation) => ({
              candidateType: "EMPLOYEE_WORKDAY",
              entityId: evaluation.employeeWorkdayId,
              companyId,
              accepted: evaluation.eligible,
              reasonCode: evaluation.eligible
                ? null
                : evaluation.rejectionReasons[0] ?? "REJECTED",
              reasonDetail: evaluation.rejectionReasons.join(", ") || null,
              snapshot: {
                operationWorkdayId: evaluation.operationWorkdayId,
                operationId: evaluation.operationId,
                rejectionReasons: evaluation.rejectionReasons,
                priorAttendanceId: evaluation.priorAttendanceId,
              },
            })),
          );
        }
      } catch (error) {
        console.warn("[whatsapp-bot] CHECKIN_UNAVAILABILITY_DIAGNOSIS_FAILED", {
          companyId,
          employeeId: input.employeeId,
          at: now.toISOString(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return respond(companyId, {
        message: hasJustifiedWorkdayInWindow ? NO_JUSTIFIED_ONLY_MESSAGE : NO_OPERATION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
        resultCode: WHATSAPP_RESULT_CODES.NO_AVAILABLE_EMPLOYEE_WORKDAY,
        flowType: "CHECKIN",
      });
    }

    if (candidates.length === 1) {
      const workday = candidates[0];
      await botSessionService.createWaitingLocationSession(companyId, {
        employeeId: input.employeeId,
        phoneNumber: input.phoneFrom,
        operationId: workday.operationId,
        employeeWorkdayId: workday.employeeWorkdayId,
      });

      console.info("[whatsapp-bot] session created WAITING_LOCATION", {
        employeeId: input.employeeId,
        employeeWorkdayId: workday.employeeWorkdayId,
        operationId: workday.operationId,
      });

      return respond(companyId, {
        message: buildLocationRequestMessage(workday),
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
        resultCode: WHATSAPP_RESULT_CODES.CHECKIN_LOCATION_REQUIRED,
        flowType: "CHECKIN",
      });
    }

    const options = mapCheckInCandidatesToSessionOptions(candidates);

    await botSessionService.createOperationSelectionSession(companyId, {
      employeeId: input.employeeId,
      phoneNumber: input.phoneFrom,
      options,
    });

    console.info("[whatsapp-bot] session created WAITING_OPERATION_SELECTION", {
      employeeId: input.employeeId,
      options: options.length,
    });

    return respond(companyId, {
      message: buildWorkdaySelectionPrompt(candidates),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
}

export async function handleOperationSelection(input: {
    companyId: string;
    session: BotSession;
    body: string;
    employeeId: string;
    phoneFrom: string;
    phoneTo: string;
    messageSid?: string;
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
        flowType: "CHECKIN",
      });
    }

    const selected = resolveWorkdayOptionFromSession(options, selection);
    if (!selected) {
      return respond(companyId, {
        message: NO_OPERATION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const pendingLocation = context.pendingLocation;
    const eventAt = resolvePendingLocationEventAt(pendingLocation);

    if (selected.attendanceAction === "CHECK_OUT") {
      if (!selected.attendanceRecordId) {
        return respond(companyId, {
          message: NO_CHECKOUT_OPERATION_MESSAGE,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      const attendanceBlocked = getAttendanceModuleBlockedMessage(
        await companyModuleService.getModuleStates(companyId),
      );
      if (attendanceBlocked) {
        return respond(companyId, {
          message: attendanceBlocked,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
          resultCode: WHATSAPP_RESULT_CODES.MODULE_DISABLED,
          flowType: "CHECKOUT",
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
      const selectionMessageSid =
        pendingLocation?.messageSid ?? input.messageSid ?? `selection-${input.session.id}`;

      if (!getRequireCheckoutLocation()) {
        return processCheckoutWithoutLocation({
          companyId,
          employeeId: input.employeeId,
          employeeWorkdayId: eligible.employeeWorkdayId,
          attendanceRecordId: eligible.attendanceRecordId,
          operationId: eligible.operationId,
          phoneFrom: input.phoneFrom,
          phoneTo: input.phoneTo,
          messageSid: selectionMessageSid,
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
          eventAt,
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

    const checkInBlocked = getCheckInModuleBlockedMessage(
      await companyModuleService.getModuleStates(companyId),
    );
    if (checkInBlocked) {
      return respond(companyId, {
        message: checkInBlocked,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
        resultCode: WHATSAPP_RESULT_CODES.MODULE_DISABLED,
        flowType: "CHECKIN",
      });
    }

    const now = getBotNow();
    const workday = await findCheckInCandidateByWorkdayId(
      companyId,
      input.employeeId,
      selected.employeeWorkdayId,
      now,
    );

    if (!workday) {
      return respond(companyId, {
        message: WORKDAY_NO_LONGER_AVAILABLE_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const selectionResult = await botSessionService.selectOperationAndRenewExpiration(
      companyId,
      input.session.id,
      {
        operationId: workday.operationId,
        employeeWorkdayId: workday.employeeWorkdayId,
      },
    );

    if (selectionResult.kind === "expired") {
      return respond(companyId, {
        message: EXPIRED_SESSION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
        resultCode: WHATSAPP_RESULT_CODES.SESSION_EXPIRED,
        flowType: "CHECKIN",
      });
    }

    if (selectionResult.kind !== "ok") {
      return respond(companyId, {
        message: INVALID_SELECTION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
        resultCode: WHATSAPP_RESULT_CODES.INVALID_SELECTION,
        flowType: "CHECKIN",
      });
    }

    if (pendingLocation) {
      return processLocationCheckIn({
        companyId,
        session: selectionResult.session,
        employeeId: input.employeeId,
        employeeWorkdayId: workday.employeeWorkdayId,
        operationId: workday.operationId,
        latitude: pendingLocation.latitude,
        longitude: pendingLocation.longitude,
        messageSid: pendingLocation.messageSid,
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
        eventAt,
      });
    }

    return respond(companyId, {
      message: buildLocationRequestMessage(workday),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
      resultCode: WHATSAPP_RESULT_CODES.CHECKIN_LOCATION_REQUIRED,
      flowType: "CHECKIN",
    });
}
