import sql from "mssql";
import twilio from "twilio";
import type { CompanyModuleKey } from "../constants/company-modules";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { getPool } from "../database/connection";
import { attendanceRepository } from "../repositories/attendance.repository";
import { botSessionRepository } from "../repositories/bot-session.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { whatsappMessageRepository } from "../repositories/whatsapp-message.repository";
import type { TwilioWebhookInput } from "../schemas/twilio-webhook.schema";
import { resolveWorkdayOptionsFromSessionContext } from "../utils/legacy-operation-session-context";
import { botSessionService } from "./bot-session.service";
import type { BotSession } from "../types/twilio.types";
import type { WhatsAppInboundContext } from "../types/whatsapp-company-context";
import type { AttendanceRecord } from "../types/domain";
import { EXPIRED_SESSION_USER_MESSAGE } from "../utils/bot-session-expiration";
import {
  formatLocalTime,
  isWithinOperationWindow,
} from "../utils/attendance-validation";
import { normalizeWhatsAppPhone, tryNormalizeWhatsAppPhone } from "../utils/phone";
import { extractMessageFromTwiml } from "../utils/twiml-message";
import {
  getBotOperationTimezone,
  getBotRuntimeSettings,
  getRequireCheckoutLocation,
  runWithBotRuntimeSettings,
} from "../utils/bot-runtime-settings-scope";
import { companyModuleService } from "./company-module.service";
import {
  buildCheckInValidation,
  buildCheckoutValidation,
  buildCheckoutValidationWithoutLocation,
} from "./bot/bot-attendance-runtime";
import { botRuntimeSettingsService } from "./bot-runtime-settings.service";
import { employeeWorkdayAttendanceCommand } from "./employee-workday-attendance.command";
import { employeeWorkdayAvailabilityService } from "./employee-workday-availability.service";
import {
  buildArrivalRegisteredMessage,
  buildCheckoutWorkdaySelectionPrompt,
  buildCheckoutLocationRequestMessage,
  buildCheckoutRegisteredMessage,
  buildWorkdaySelectionPrompt,
  buildLocationRequestMessage,
  DUPLICATE_ATTENDANCE_MESSAGE,
  DUPLICATE_CHECKOUT_MESSAGE,
  DUPLICATE_MESSAGE_SID_RESPONSE,
  GENERIC_ERROR_MESSAGE,
  INVALID_SELECTION_MESSAGE,
  NO_CHECK_IN_FOR_CHECKOUT_MESSAGE,
  NO_CHECKOUT_OPERATION_MESSAGE,
  PENDING_CHECKOUT_EXPIRED_MESSAGE,
  NO_JUSTIFIED_ONLY_MESSAGE,
  NO_OPERATION_MESSAGE,
  WORKDAY_NO_LONGER_AVAILABLE_MESSAGE,
} from "./bot/bot-response.builder";
import {
  findCheckInCandidateByWorkdayId,
  isValidWorkdaySelection,
  listAvailableCheckInWorkdays,
  listOpenCheckoutWorkdays,
  mapCheckInCandidatesToSessionOptions,
  mapCheckoutCandidatesToSessionOptions,
  parseWorkdaySelectionIndex,
  resolveWorkdayOptionFromSession,
  revalidateCheckoutCandidateByAttendanceId,
} from "./bot/bot-workday.selector";
import type { CheckoutCandidateRevalidationResult } from "./bot/bot-workday.selector";
import { whatsappRouterService } from "./whatsapp-router/whatsapp-router.service";
import type { WhatsAppRouterHandlers } from "./whatsapp-router/whatsapp-router.types";
import {
  addVirtualCheckIn,
  appendSimulatorMessage,
  completeVirtualCheckOut,
  findVirtualCheckInForCheckout,
  getBotNow,
  getBotRuntimeContext,
  getSimulationSessionId,
  hasVirtualActiveRecord,
  isSimulationActive,
  isSimulationDryRun,
  recordSimulationArtifact,
  setLastBotResponse,
  setLastTwilioPayload,
  setTechnicalDetail,
} from "../utils/bot-runtime-context";

const EXPIRED_SESSION_MESSAGE = EXPIRED_SESSION_USER_MESSAGE;

const messageForCheckoutRevalidationFailure = (
  result: CheckoutCandidateRevalidationResult,
): string =>
  result.kind === "expired"
    ? PENDING_CHECKOUT_EXPIRED_MESSAGE
    : NO_CHECKOUT_OPERATION_MESSAGE;

const buildTwiml = (message: string): string => {
  const response = new twilio.twiml.MessagingResponse();
  response.message(message);
  return response.toString();
};

const isLocationMessage = (payload: TwilioWebhookInput): boolean =>
  Boolean(payload.Latitude && payload.Longitude);

const getMessageType = (payload: TwilioWebhookInput): "TEXT" | "LOCATION" | "UNKNOWN" => {
  if (isLocationMessage(payload)) {
    return "LOCATION";
  }

  if (payload.Body && payload.Body.trim().length > 0) {
    return "TEXT";
  }

  return "UNKNOWN";
};

const saveOutboundMessage = async (
  companyId: string,
  input: {
  employeeId: string | null;
  phoneFrom: string;
  phoneTo: string;
  body: string;
}): Promise<void> => {
  if (isSimulationActive()) {
    setLastBotResponse(input.body);
    return;
  }

  await whatsappMessageRepository.create({
    companyId,
    messageSid: null,
    direction: "OUTBOUND",
    employeeId: input.employeeId,
    phoneFrom: input.phoneFrom,
    phoneTo: input.phoneTo,
    messageType: "TEXT",
    body: input.body,
    latitude: null,
    longitude: null,
    status: "SENT",
    rawPayload: null,
  });
};

const respond = async (
  companyId: string,
  input: {
  message: string;
  employeeId: string | null;
  phoneFrom: string;
  phoneTo: string;
}): Promise<string> => {
  setLastBotResponse(input.message);

  await saveOutboundMessage(companyId, {
    employeeId: input.employeeId,
    phoneFrom: input.phoneFrom,
    phoneTo: input.phoneTo,
    body: input.message,
  });

  return buildTwiml(input.message);
};

const resolveInboundEmployeeId = async (
  companyId: string,
  phoneFrom: string,
  resolvedEmployeeId: string | null,
): Promise<string | null> => {
  const simulationContext = getBotRuntimeContext();
  if (simulationContext?.employeeIdOverride) {
    return simulationContext.employeeIdOverride;
  }

  if (resolvedEmployeeId) {
    const employee = await employeeRepository.findById(companyId, resolvedEmployeeId);
    return employee?.active ? employee.id : null;
  }

  const employee = await employeeRepository.findByPhone(companyId, phoneFrom);
  return employee?.active ? employee.id : null;
};

const createRouterHandlers = (): WhatsAppRouterHandlers => ({
  respond,
  startCheckIn: (input) => whatsappBotService.startCheckIn(input),
  startCheckout: (input) => whatsappBotService.startCheckout(input),
  handleOperationSelection: (input) => whatsappBotService.handleOperationSelection(input),
  handleCheckoutOperationSelection: (input) =>
    whatsappBotService.handleCheckoutOperationSelection(input),
  processLocationCheckIn: (input) => whatsappBotService.processLocationCheckIn(input),
  processLocationCheckout: (input) => whatsappBotService.processLocationCheckout(input),
});

export const whatsappBotService = {
  buildTwiml,

  async handleWebhook(inbound: WhatsAppInboundContext, payload: TwilioWebhookInput): Promise<string> {
    const runtimeSettings = await botRuntimeSettingsService.getBotRuntimeSettings(inbound.companyId);
    return runWithBotRuntimeSettings(runtimeSettings, async () =>
      this.handleWebhookWithSettings(inbound, payload),
    );
  },

  async handleWebhookWithSettings(
    inbound: WhatsAppInboundContext,
    payload: TwilioWebhookInput,
  ): Promise<string> {
    const companyId = inbound.companyId;
    const phoneFrom = normalizeWhatsAppPhone(payload.From);
    const phoneTo = tryNormalizeWhatsAppPhone(payload.To) ?? payload.To;
    const simulationContext = getBotRuntimeContext();
    const botNumber =
      env.TWILIO_WHATSAPP_NUMBER ?? (simulationContext ? "whatsapp:+10000000000" : undefined);
    if (!botNumber) {
      throw new AppError(
        503,
        "TWILIO_NOT_CONFIGURED",
        "El número de WhatsApp de Twilio no está configurado.",
      );
    }

    console.info("[whatsapp-bot] webhook received", {
      messageSid: payload.MessageSid,
      from: phoneFrom,
      type: getMessageType(payload),
      companyId,
      resolutionSource: inbound.resolutionSource,
    });

    try {
      setLastTwilioPayload(payload as unknown as Record<string, string>);

      if (!simulationContext) {
        const existingMessage = await whatsappMessageRepository.findByMessageSid(
          companyId,
          payload.MessageSid,
        );
        if (existingMessage) {
          console.info("[whatsapp-bot] duplicate MessageSid", { messageSid: payload.MessageSid });
          await whatsappMessageRepository.updateProcessingStatus(companyId, payload.MessageSid, {
            processingStatus: "DUPLICATE",
            processingErrorCode: "DUPLICATE_MESSAGE_SID",
          });
          return buildTwiml(DUPLICATE_MESSAGE_SID_RESPONSE);
        }
      }

      const employeeId = await resolveInboundEmployeeId(companyId, phoneFrom, inbound.employeeId);
      const moduleStates = await companyModuleService.getModuleStates(companyId);

      if (!simulationContext) {
        await whatsappMessageRepository.create({
          companyId,
          messageSid: payload.MessageSid,
          direction: "INBOUND",
          employeeId,
          phoneFrom,
          phoneTo,
          messageType: getMessageType(payload),
          body: payload.Body ?? null,
          latitude: payload.Latitude ? Number(payload.Latitude) : null,
          longitude: payload.Longitude ? Number(payload.Longitude) : null,
          status: "RECEIVED",
          rawPayload: payload as unknown as Record<string, string>,
        });
      } else {
        appendSimulatorMessage({
          id: payload.MessageSid,
          direction: "INBOUND",
          messageType: isLocationMessage(payload) ? "LOCATION" : "TEXT",
          body: payload.Body ?? null,
          latitude: payload.Latitude ? Number(payload.Latitude) : null,
          longitude: payload.Longitude ? Number(payload.Longitude) : null,
          createdAt: getBotNow().toISOString(),
        });
      }

      let response: string;

      if (isLocationMessage(payload)) {
        response = await this.handleLocationMessage({
          companyId,
          payload,
          phoneFrom,
          phoneTo: botNumber,
          employeeId,
          moduleStates,
        });
      } else {
        response = await this.handleTextMessage({
          companyId,
          payload,
          phoneFrom,
          phoneTo: botNumber,
          employeeId,
          moduleStates,
        });
      }

      if (!simulationContext) {
        await whatsappMessageRepository.updateProcessingStatus(companyId, payload.MessageSid, {
          processingStatus: "PROCESSED",
        });
      } else if (response) {
        const outboundText = extractMessageFromTwiml(response);
        appendSimulatorMessage({
          id: `SIM-OUT-${payload.MessageSid}`,
          direction: "OUTBOUND",
          messageType: "TEXT",
          body: outboundText,
          latitude: null,
          longitude: null,
          createdAt: getBotNow().toISOString(),
        });
      }

      return response;
    } catch (error) {
      console.error("[whatsapp-bot] unexpected webhook error", error);

      if (isSimulationActive()) {
        setTechnicalDetail("error", error instanceof Error ? error.message : "UNKNOWN_ERROR");
        setLastBotResponse(GENERIC_ERROR_MESSAGE);
        return buildTwiml(GENERIC_ERROR_MESSAGE);
      }

      try {
        await whatsappMessageRepository.updateProcessingStatus(companyId, payload.MessageSid, {
          processingStatus: "FAILED",
          processingErrorCode:
            error instanceof Error ? error.message.slice(0, 100) : "UNKNOWN_ERROR",
        });
      } catch (updateError) {
        console.error("[whatsapp-bot] failed to update processing status", updateError);
      }

      return buildTwiml(GENERIC_ERROR_MESSAGE);
    }
  },

  async handleTextMessage(input: {
    companyId: string;
    payload: TwilioWebhookInput;
    phoneFrom: string;
    phoneTo: string;
    employeeId: string | null;
    moduleStates: ReadonlyMap<CompanyModuleKey, boolean>;
  }): Promise<string> {
    const { activeSession: session, recentlyExpired } =
      await botSessionService.getSessionResolutionByPhone(input.companyId, input.phoneFrom);

    return whatsappRouterService.routeTextMessage(
      {
        companyId: input.companyId,
        employeeId: input.employeeId,
        payload: input.payload,
        messageType: "TEXT",
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
        moduleStates: input.moduleStates,
        session,
        recentlyExpired,
        body: input.payload.Body?.trim() ?? "",
      },
      createRouterHandlers(),
    );
  },

  async startCheckout(input: {
    companyId: string;
    employeeId: string;
    phoneFrom: string;
    phoneTo: string;
    messageSid: string;
  }): Promise<string> {
    const { companyId } = input;
    const eligible = await listOpenCheckoutWorkdays(
      companyId,
      input.employeeId,
      getBotNow(),
    );

    if (eligible.length === 0) {
      return respond(companyId, {
        message: NO_CHECK_IN_FOR_CHECKOUT_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const finalizeWithoutLocation = async (candidate: (typeof eligible)[number]) =>
      this.processCheckoutWithoutLocation({
        companyId,
        employeeId: input.employeeId,
        employeeWorkdayId: candidate.employeeWorkdayId,
        attendanceRecordId: candidate.attendanceRecordId,
        operationId: candidate.operationId,
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
        messageSid: input.messageSid,
      });

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
      });

      return respond(companyId, {
        message: buildCheckoutLocationRequestMessage(candidate),
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
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
  },

  async handleCheckoutOperationSelection(input: {
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
      });
    }

    const selected = resolveWorkdayOptionFromSession(options, selection);
    if (!selected?.attendanceRecordId) {
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
      return this.processCheckoutWithoutLocation({
        companyId,
        employeeId: input.employeeId,
        employeeWorkdayId: eligible.employeeWorkdayId,
        attendanceRecordId: eligible.attendanceRecordId,
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
      });
    }

    if (selectionResult.kind !== "ok") {
      return respond(companyId, {
        message: INVALID_SELECTION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    return respond(companyId, {
      message: buildCheckoutLocationRequestMessage(eligible),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  },

  async startCheckIn(input: {
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
      console.info("[whatsapp-bot] no available employee workday", { employeeId: input.employeeId });
      return respond(companyId, {
        message: hasJustifiedWorkdayInWindow ? NO_JUSTIFIED_ONLY_MESSAGE : NO_OPERATION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
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
  },

  async handleOperationSelection(input: {
    companyId: string;
    session: BotSession;
    body: string;
    employeeId: string;
    phoneFrom: string;
    phoneTo: string;
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
      });
    }

    if (selectionResult.kind !== "ok") {
      return respond(companyId, {
        message: INVALID_SELECTION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    return respond(companyId, {
      message: buildLocationRequestMessage(workday),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  },

  async handleLocationMessage(input: {
    companyId: string;
    payload: TwilioWebhookInput;
    phoneFrom: string;
    phoneTo: string;
    employeeId: string | null;
    moduleStates: ReadonlyMap<CompanyModuleKey, boolean>;
  }): Promise<string> {
    const { activeSession: session, recentlyExpired } =
      await botSessionService.getSessionResolutionByPhone(input.companyId, input.phoneFrom);

    return whatsappRouterService.routeLocationMessage(
      {
        companyId: input.companyId,
        employeeId: input.employeeId,
        payload: input.payload,
        messageType: "LOCATION",
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
        moduleStates: input.moduleStates,
        session,
        recentlyExpired,
        body: input.payload.Body?.trim() ?? "",
      },
      createRouterHandlers(),
    );
  },

  async processLocationCheckIn(input: {
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
  }): Promise<string> {
    const { companyId } = input;
    const receivedAt = getBotNow();
    const workday = await employeeWorkdayAvailabilityService.revalidateCheckInCandidate(
      companyId,
      input.employeeId,
      input.employeeWorkdayId,
      receivedAt,
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
      receivedAt,
      scheduledStart: new Date(workday.expectedStartAt),
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

    if (isSimulationDryRun()) {
      const responseMessage = buildArrivalRegisteredMessage({
        compatible: workday,
        distanceMeters: geoDistance,
        validationStatus: validation.validationStatus,
        punctualityStatus: validation.punctualityStatus,
        validationReason: validation.validationReason,
        receivedAt,
      });

      const virtualRecord = addVirtualCheckIn({
        operationId: workday.operationId,
        employeeId: input.employeeId,
        employeeWorkdayId: input.employeeWorkdayId,
        receivedAt: receivedAt.toISOString(),
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
        receivedAt: receivedAt.toISOString(),
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
        receivedAt,
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
          attendanceId: created.id,
          employeeWorkdayId: input.employeeWorkdayId,
          operationId: workday.operationId,
          employeeId: input.employeeId,
          validationStatus: validation.validationStatus,
          locationStatus: validation.locationStatus,
          punctualityStatus: validation.punctualityStatus,
          distanceMeters: Math.round(geoDistance * 100) / 100,
          receivedAt: receivedAt.toISOString(),
        });
      }

      console.info("[whatsapp-bot] attendance created", {
        employeeId: input.employeeId,
        employeeWorkdayId: input.employeeWorkdayId,
        operationId: workday.operationId,
        validationStatus: validation.validationStatus,
      });

      const responseMessage = buildArrivalRegisteredMessage({
        compatible: workday,
        distanceMeters: geoDistance,
        validationStatus: validation.validationStatus,
        punctualityStatus: validation.punctualityStatus,
        validationReason: validation.validationReason,
        receivedAt,
      });

      return respond(companyId, {
        message: responseMessage,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
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
      });
    }
  },

  async processLocationCheckout(input: {
    companyId: string;
    session: BotSession;
    employeeId: string;
    employeeWorkdayId: string;
    attendanceRecordId: string;
    operationId: string;
    latitude: number;
    longitude: number;
    messageSid: string;
    phoneFrom: string;
    phoneTo: string;
  }): Promise<string> {
    const { companyId } = input;
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
      checkoutAt,
      scheduledEnd: eligible.expectedEndAt ? new Date(eligible.expectedEndAt) : null,
      runtimeSettings,
    });

    setTechnicalDetail("employeeWorkdayId", input.employeeWorkdayId);
    setTechnicalDetail("attendanceRecordId", input.attendanceRecordId);
    setTechnicalDetail("checkoutDistanceMeters", Math.round(checkoutDistance * 100) / 100);
    setTechnicalDetail("allowedRadiusMeters", effectiveRadiusMeters);
    setTechnicalDetail("reviewMarginMeters", runtimeSettings.geofenceReviewMarginMeters);
    setTechnicalDetail("checkoutValidation", validation);

    if (isSimulationDryRun()) {
      const responseMessage = buildCheckoutRegisteredMessage({
        eligible,
        checkInAt: attendance.receivedAt,
        checkoutAt,
        distanceMeters: checkoutDistance,
        checkoutStatus: validation.checkoutStatus,
        extraWorkedMinutes: validation.extraWorkedMinutes,
      });

      completeVirtualCheckOut(attendance.id, {
        checkoutAt: checkoutAt.toISOString(),
        checkoutStatus: validation.checkoutStatus,
      });

      recordSimulationArtifact({
        type: "check-out",
        persisted: false,
        virtualAttendanceId: attendance.id,
        employeeWorkdayId: input.employeeWorkdayId,
        checkoutStatus: validation.checkoutStatus,
        distanceMeters: Math.round(checkoutDistance * 100) / 100,
        checkoutAt: checkoutAt.toISOString(),
      });

      await botSessionService.completeSession(companyId, input.session.id);

      return respond(companyId, {
        message: `${responseMessage}\n\n[Simulación] Se habría registrado el check-out.`,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      const activeSession = await botSessionRepository.findValidActiveById(
        companyId,
        input.session.id,
        transaction,
      );

      if (!activeSession || activeSession.state !== "WAITING_CHECKOUT_LOCATION") {
        await transaction.rollback();
        return respond(companyId, {
          message: EXPIRED_SESSION_MESSAGE,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      const refreshed = await revalidateCheckoutCandidateByAttendanceId(
        companyId,
        input.employeeId,
        input.attendanceRecordId,
        checkoutAt,
      );
      if (
        refreshed.kind !== "eligible" ||
        refreshed.candidate.employeeWorkdayId !== input.employeeWorkdayId
      ) {
        await transaction.rollback();
        return respond(companyId, {
          message: messageForCheckoutRevalidationFailure(refreshed),
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      const updated = await attendanceRepository.registerCheckoutInTransaction(companyId, transaction, {
        attendanceId: attendance.id,
        checkoutLatitude: input.latitude,
        checkoutLongitude: input.longitude,
        checkoutDistanceMeters: Math.round(checkoutDistance * 100) / 100,
        checkoutStatus: validation.checkoutStatus,
        checkoutReviewReason: validation.checkoutReviewReason,
        earlyDepartureMinutes: validation.earlyDepartureMinutes,
        extraWorkedMinutes: validation.extraWorkedMinutes,
        checkoutMessageSid: input.messageSid,
        checkoutAt: checkoutAt.toISOString(),
      });

      if (!updated) {
        await transaction.rollback();
        await botSessionService.completeSession(companyId, input.session.id);
        return respond(companyId, {
          message: DUPLICATE_CHECKOUT_MESSAGE,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
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
          checkoutAt: checkoutAt.toISOString(),
        });
      }

      await botSessionRepository.updateSession(
        companyId,
        input.session.id,
        { state: "COMPLETED" },
        transaction,
      );

      await transaction.commit();

      const responseMessage = buildCheckoutRegisteredMessage({
        eligible,
        checkInAt: attendance.receivedAt,
        checkoutAt,
        distanceMeters: updated.checkoutDistanceMeters ?? 0,
        checkoutStatus: validation.checkoutStatus,
        extraWorkedMinutes: validation.extraWorkedMinutes,
      });

      return respond(companyId, {
        message: responseMessage,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    } catch (error) {
      await transaction.rollback();

      if (error instanceof Error) {
        if (error.message.includes("UQ_attendance_records_checkout_message_sid")) {
          await botSessionService.completeSession(companyId, input.session.id);
          return respond(companyId, {
            message: DUPLICATE_CHECKOUT_MESSAGE,
            employeeId: input.employeeId,
            phoneFrom: input.phoneTo,
            phoneTo: input.phoneFrom,
          });
        }
      }

      console.error("[whatsapp-bot] checkout transaction failed", error);
      return respond(companyId, {
        message: GENERIC_ERROR_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }
  },

  async processCheckoutWithoutLocation(input: {
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
      });
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      const updated = await attendanceRepository.registerCheckoutInTransaction(companyId, transaction, {
        attendanceId: attendance.id,
        checkoutLatitude: null,
        checkoutLongitude: null,
        checkoutDistanceMeters: null,
        checkoutStatus: validation.checkoutStatus,
        checkoutReviewReason: validation.checkoutReviewReason,
        earlyDepartureMinutes: validation.earlyDepartureMinutes,
        extraWorkedMinutes: validation.extraWorkedMinutes,
        checkoutMessageSid: input.messageSid,
        checkoutAt: checkoutAt.toISOString(),
      });

      if (!updated) {
        await transaction.rollback();
        await completeSessionIfNeeded();
        return respond(companyId, {
          message: DUPLICATE_CHECKOUT_MESSAGE,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      await transaction.commit();
      await completeSessionIfNeeded();

      const responseMessage = buildCheckoutRegisteredMessage(checkoutMessageInput);

      return respond(companyId, {
        message: responseMessage,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    } catch (error) {
      await transaction.rollback();
      console.error("[whatsapp-bot] checkout without location failed", error);
      return respond(companyId, {
        message: GENERIC_ERROR_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }
  },
};

export const isOperationCompatibleAt = isWithinOperationWindow;
