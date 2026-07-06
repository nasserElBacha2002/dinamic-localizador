import sql from "mssql";
import twilio from "twilio";
import type { CompanyModuleKey } from "../constants/company-modules";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { getPool } from "../database/connection";
import { attendanceRepository } from "../repositories/attendance.repository";
import { botSessionRepository } from "../repositories/bot-session.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { whatsappMessageRepository } from "../repositories/whatsapp-message.repository";
import type { TwilioWebhookInput } from "../schemas/twilio-webhook.schema";
import { resolveOperationOptionsFromSessionContext } from "../utils/legacy-operation-session-context";
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
import { operationWorkDateService } from "./operation-work-date.service";
import { workdayMaterializationService } from "./workday-materialization.service";
import {
  buildArrivalRegisteredMessage,
  buildCheckoutOperationSelectionPrompt,
  buildCheckoutLocationRequestMessage,
  buildCheckoutRegisteredMessage,
  buildOperationSelectionPrompt,
  buildLocationRequestMessage,
  DUPLICATE_ATTENDANCE_MESSAGE,
  DUPLICATE_CHECKOUT_MESSAGE,
  DUPLICATE_MESSAGE_SID_RESPONSE,
  GENERIC_ERROR_MESSAGE,
  INVALID_SELECTION_MESSAGE,
  NO_CHECK_IN_FOR_CHECKOUT_MESSAGE,
  NO_CHECKOUT_OPERATION_MESSAGE,
  NO_OPERATION_MESSAGE,
} from "./bot/bot-response.builder";
import {
  findCheckoutEligibleOperationById,
  findCompatibleOperationById,
  isValidOperationSelection,
  listCheckoutEligibleOperations,
  listCompatibleOperations,
  mapCheckoutOperationsToSessionOptions,
  mapCompatibleOperationsToSessionOptions,
  parseOperationSelectionIndex,
} from "./bot/bot-operation.selector";
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
    const eligible = await listCheckoutEligibleOperations(companyId, input.employeeId);

    if (eligible.length === 0) {
      return respond(companyId, {
        message: NO_CHECK_IN_FOR_CHECKOUT_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const finalizeWithoutLocation = async (operationId: string) =>
      this.processCheckoutWithoutLocation({
        companyId,
        employeeId: input.employeeId,
        operationId,
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
        messageSid: input.messageSid,
      });

    if (eligible.length === 1) {
      const operation = eligible[0];
      if (!getRequireCheckoutLocation()) {
        return finalizeWithoutLocation(operation.id);
      }

      await botSessionService.createWaitingCheckoutLocationSession(companyId, {
        employeeId: input.employeeId,
        phoneNumber: input.phoneFrom,
        operationId: operation.id,
      });

      return respond(companyId, {
        message: buildCheckoutLocationRequestMessage(operation),
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (!getRequireCheckoutLocation()) {
      const options = mapCheckoutOperationsToSessionOptions(eligible);
      await botSessionService.createCheckoutOperationSelectionSession(companyId, {
        employeeId: input.employeeId,
        phoneNumber: input.phoneFrom,
        options,
      });

      return respond(companyId, {
        message: `${buildCheckoutOperationSelectionPrompt(eligible)}\n\nNo se requiere ubicación para registrar la salida.`,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const options = mapCheckoutOperationsToSessionOptions(eligible);

    await botSessionService.createCheckoutOperationSelectionSession(companyId, {
      employeeId: input.employeeId,
      phoneNumber: input.phoneFrom,
      options,
    });

    return respond(companyId, {
      message: buildCheckoutOperationSelectionPrompt(eligible),
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
    const selection = parseOperationSelectionIndex(input.body);
    const context = botSessionService.parseContext(input.session.contextJson);
    const options = resolveOperationOptionsFromSessionContext(context) ?? [];

    if (!isValidOperationSelection(selection, options.length)) {
      return respond(companyId, {
        message: INVALID_SELECTION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const selected = options[selection - 1];
    const eligible = await findCheckoutEligibleOperationById(companyId, input.employeeId, selected.operationId);

    if (!eligible) {
      return respond(companyId, {
        message: NO_CHECKOUT_OPERATION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (!getRequireCheckoutLocation()) {
      return this.processCheckoutWithoutLocation({
        companyId,
        employeeId: input.employeeId,
        operationId: eligible.id,
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
        messageSid: input.messageSid,
        sessionId: input.session.id,
      });
    }

    const selectionResult = await botSessionService.selectCheckoutOperationAndRenewExpiration(companyId, 
      input.session.id,
      eligible.id,
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
    const operations = await listCompatibleOperations(companyId, input.employeeId, now);

    if (operations.length === 0) {
      console.info("[whatsapp-bot] no compatible operation", { employeeId: input.employeeId });
      return respond(companyId, {
        message: NO_OPERATION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (operations.length === 1) {
      const operation = operations[0];
      await botSessionService.createWaitingLocationSession(companyId, {
        employeeId: input.employeeId,
        phoneNumber: input.phoneFrom,
        operationId: operation.id,
      });

      console.info("[whatsapp-bot] session created WAITING_LOCATION", {
        employeeId: input.employeeId,
        operationId: operation.id,
      });

      return respond(companyId, {
        message: buildLocationRequestMessage(operation),
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const options = mapCompatibleOperationsToSessionOptions(operations);

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
      message: buildOperationSelectionPrompt(operations),
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
    const selection = parseOperationSelectionIndex(input.body);
    const context = botSessionService.parseContext(input.session.contextJson);
    const options = resolveOperationOptionsFromSessionContext(context) ?? [];

    if (!isValidOperationSelection(selection, options.length)) {
      return respond(companyId, {
        message: INVALID_SELECTION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const selected = options[selection - 1];
    const now = getBotNow();
    const compatible = await findCompatibleOperationById(companyId, 
      input.employeeId,
      selected.operationId,
      now,
    );

    if (!compatible) {
      return respond(companyId, {
        message: NO_OPERATION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const selectionResult = await botSessionService.selectOperationAndRenewExpiration(companyId, 
      input.session.id,
      compatible.id,
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
      message: buildLocationRequestMessage(compatible),
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
    operationId: string;
    latitude: number;
    longitude: number;
    messageSid: string;
    phoneFrom: string;
    phoneTo: string;
  }): Promise<string> {
    const { companyId } = input;
    const receivedAt = getBotNow();
    const compatible = await findCompatibleOperationById(companyId, 
      input.employeeId,
      input.operationId,
      receivedAt,
    );

    if (!compatible) {
      return respond(companyId, {
        message: NO_OPERATION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const workDate = await operationWorkDateService.resolveOperationWorkDate(
      companyId,
      input.operationId,
    );

    const isAssigned = await operationEmployeeRepository.exists(
      companyId,
      input.operationId,
      input.employeeId,
      workDate,
    );
    if (!isAssigned) {
      return respond(companyId, {
        message: NO_OPERATION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const employeeWorkdayPreview = isSimulationDryRun()
      ? null
      : await workdayMaterializationService.ensureEmployeeWorkday(
          companyId,
          input.operationId,
          input.employeeId,
        );

    const hasActiveRecord = isSimulationDryRun()
      ? hasVirtualActiveRecord(input.operationId, input.employeeId)
      : await attendanceRepository.hasActiveRecordByEmployeeWorkday(
          companyId,
          employeeWorkdayPreview!.id,
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
      serviceLatitude: compatible.serviceLatitude,
      serviceLongitude: compatible.serviceLongitude,
      serviceAllowedRadiusMeters: compatible.allowedRadiusMeters,
      receivedAt,
      scheduledStart: new Date(compatible.scheduledStart),
      earlyToleranceMinutes: compatible.earlyToleranceMinutes,
      lateToleranceMinutes: compatible.lateToleranceMinutes,
      runtimeSettings,
    });

    setTechnicalDetail("distanceMeters", Math.round(geoDistance * 100) / 100);
    setTechnicalDetail("allowedRadiusMeters", effectiveRadiusMeters);
    setTechnicalDetail("reviewMarginMeters", runtimeSettings.geofenceReviewMarginMeters);
    setTechnicalDetail("locationValidation", validation);
    setTechnicalDetail("runtimeSettingsSource", runtimeSettings.companyId);

    if (isSimulationDryRun()) {
      const responseMessage = buildArrivalRegisteredMessage({
        compatible,
        distanceMeters: geoDistance,
        validationStatus: validation.validationStatus,
        punctualityStatus: validation.punctualityStatus,
        validationReason: validation.validationReason,
        receivedAt,
      });

      const virtualRecord = addVirtualCheckIn({
        operationId: input.operationId,
        employeeId: input.employeeId,
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
        operationId: input.operationId,
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

    const pool = getPool();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      const activeSession = await botSessionRepository.findValidActiveById(companyId, 
        input.session.id,
        transaction,
      );

      if (!activeSession || activeSession.state !== "WAITING_LOCATION") {
        await transaction.rollback();
        await botSessionService.getActiveSessionByPhone(companyId, input.phoneFrom);
        console.info("[whatsapp-bot] location received for expired or invalid session", {
          sessionId: input.session.id,
        });
        return respond(companyId, {
          message: EXPIRED_SESSION_MESSAGE,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      const employeeWorkday = await workdayMaterializationService.ensureEmployeeWorkdayInTransaction(
        companyId,
        transaction,
        input.operationId,
        input.employeeId,
      );

      const hasDuplicate = await attendanceRepository.hasActiveRecordByEmployeeWorkdayInTransaction(
        companyId,
        transaction,
        employeeWorkday.id,
        getSimulationSessionId(),
      );

      if (hasDuplicate) {
        await transaction.rollback();
        await botSessionService.completeSession(companyId, input.session.id);
        return respond(companyId, {
          message: DUPLICATE_ATTENDANCE_MESSAGE,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      const created = await attendanceRepository.createInTransaction(companyId, transaction, {
        operationId: input.operationId,
        employeeId: input.employeeId,
        employeeWorkdayId: employeeWorkday.id,
        receivedLatitude: input.latitude,
        receivedLongitude: input.longitude,
        distanceMeters: Math.round(geoDistance * 100) / 100,
        validationStatus: validation.validationStatus,
        locationStatus: validation.locationStatus,
        punctualityStatus: validation.punctualityStatus,
        sourceMessageSid: input.messageSid,
        validationReason: validation.validationReason,
        receivedAt: receivedAt.toISOString(),
        isSimulation: Boolean(getSimulationSessionId()),
        simulationSessionId: getSimulationSessionId(),
      });

      if (getSimulationSessionId()) {
        recordSimulationArtifact({
          type: "check-in",
          persisted: true,
          attendanceId: created.id,
          operationId: input.operationId,
          employeeId: input.employeeId,
          validationStatus: validation.validationStatus,
          locationStatus: validation.locationStatus,
          punctualityStatus: validation.punctualityStatus,
          distanceMeters: Math.round(geoDistance * 100) / 100,
          receivedAt: receivedAt.toISOString(),
        });
      }

      await botSessionRepository.updateSession(companyId, 
        input.session.id,
        { state: "COMPLETED" },
        transaction,
      );

      await transaction.commit();

      console.info("[whatsapp-bot] attendance created", {
        employeeId: input.employeeId,
        operationId: input.operationId,
        validationStatus: validation.validationStatus,
      });

      const responseMessage = buildArrivalRegisteredMessage({
        compatible,
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
      await transaction.rollback();

      if (error instanceof Error) {
        if (error.message.includes("UQ_attendance_records_source_message_sid")) {
          await botSessionService.completeSession(companyId, input.session.id);
          return respond(companyId, {
            message: DUPLICATE_ATTENDANCE_MESSAGE,
            employeeId: input.employeeId,
            phoneFrom: input.phoneTo,
            phoneTo: input.phoneFrom,
          });
        }

        if (error.message.includes("UX_attendance_records_inventory_employee_active")) {
          await botSessionService.completeSession(companyId, input.session.id);
          return respond(companyId, {
            message: DUPLICATE_ATTENDANCE_MESSAGE,
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
    operationId: string;
    latitude: number;
    longitude: number;
    messageSid: string;
    phoneFrom: string;
    phoneTo: string;
  }): Promise<string> {
    const { companyId } = input;
    const checkoutAt = getBotNow();
    const eligible = await findCheckoutEligibleOperationById(companyId, input.employeeId, input.operationId);

    if (!eligible) {
      return respond(companyId, {
        message: NO_CHECK_IN_FOR_CHECKOUT_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const simulationSessionId = getSimulationSessionId();
    let attendance: AttendanceRecord | null = isSimulationDryRun() ? null : null;

    if (!isSimulationDryRun()) {
      const employeeWorkday = await workdayMaterializationService.ensureEmployeeWorkday(
        companyId,
        input.operationId,
        input.employeeId,
      );
      attendance = await attendanceRepository.findCheckInForEmployeeWorkday(
        companyId,
        employeeWorkday.id,
        { simulationSessionId },
      );
    }

    if (isSimulationDryRun()) {
      const virtual = findVirtualCheckInForCheckout(input.operationId, input.employeeId);
      if (virtual) {
        attendance = {
          id: virtual.id,
          operationId: virtual.operationId,
          employeeId: virtual.employeeId,
          employeeWorkdayId: null,
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
      scheduledEnd: eligible.scheduledEnd ? new Date(eligible.scheduledEnd) : null,
      runtimeSettings,
    });

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

      const activeSession = await botSessionRepository.findValidActiveById(companyId, 
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
          checkoutStatus: validation.checkoutStatus,
          distanceMeters: Math.round(checkoutDistance * 100) / 100,
          checkoutAt: checkoutAt.toISOString(),
        });
      }

      await botSessionRepository.updateSession(companyId, 
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
    const eligible = await findCheckoutEligibleOperationById(
      companyId,
      input.employeeId,
      input.operationId,
    );

    if (!eligible) {
      await completeSessionIfNeeded();
      return respond(companyId, {
        message: NO_CHECK_IN_FOR_CHECKOUT_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const runtimeSettings = getBotRuntimeSettings();
    if (!runtimeSettings) {
      throw new Error("Bot runtime settings are not loaded");
    }

    const simulationSessionId = getSimulationSessionId();
    let attendance: AttendanceRecord | null = isSimulationDryRun() ? null : null;

    if (!isSimulationDryRun()) {
      const employeeWorkday = await workdayMaterializationService.ensureEmployeeWorkday(
        companyId,
        input.operationId,
        input.employeeId,
      );
      attendance = await attendanceRepository.findCheckInForEmployeeWorkday(
        companyId,
        employeeWorkday.id,
        { simulationSessionId },
      );
    }

    if (isSimulationDryRun()) {
      const virtual = findVirtualCheckInForCheckout(input.operationId, input.employeeId);
      if (virtual) {
        attendance = {
          id: virtual.id,
          operationId: virtual.operationId,
          employeeId: virtual.employeeId,
          employeeWorkdayId: null,
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
      scheduledEnd: eligible.scheduledEnd ? new Date(eligible.scheduledEnd) : null,
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
