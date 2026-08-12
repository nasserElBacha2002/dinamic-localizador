import type { CompanyModuleKey } from "../constants/company-modules";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { employeeRepository } from "../repositories/employee.repository";
import { whatsappMessageRepository } from "../repositories/whatsapp-message.repository";
import {
  hashWebhookPayload,
  whatsappWebhookEventRepository,
} from "../repositories/whatsapp-webhook-event.repository";
import type { TwilioWebhookInput } from "../schemas/twilio-webhook.schema";
import { botSessionService } from "./bot-session.service";
import type { WhatsAppInboundContext } from "../types/whatsapp-company-context";
import { isWithinOperationWindow } from "../utils/attendance-validation";
import { normalizeWhatsAppPhone, tryNormalizeWhatsAppPhone } from "../utils/phone";
import { extractMessageFromTwiml } from "../utils/twiml-message";
import { runWithBotRuntimeSettings } from "../utils/bot-runtime-settings-scope";
import {
  getObservabilityFlowResult,
  getObservabilityTrace,
  runWithObservabilityTrace,
} from "../utils/whatsapp-observability-scope";
import { WHATSAPP_RESULT_CODES } from "../constants/whatsapp-observability";
import { companyModuleService } from "./company-module.service";
import { whatsappFlowTraceService } from "./whatsapp-flow-trace.service";
import { botRuntimeSettingsService } from "./bot-runtime-settings.service";
import {
  DUPLICATE_MESSAGE_SID_RESPONSE,
  GENERIC_ERROR_MESSAGE,
} from "./bot/bot-response.builder";
import { processDirectLocationAttendance as runDirectLocationAttendance } from "./bot/direct-attendance-location.service";
import { buildTwiml, respond } from "./bot/bot-outbound-response";
import {
  handleOperationSelection as handleOperationSelectionFlow,
  processLocationCheckIn as processLocationCheckInFlow,
  startCheckIn as startCheckInFlow,
} from "./bot/check-in-attendance.flow";
import {
  handleCheckoutOperationSelection as handleCheckoutOperationSelectionFlow,
  processCheckoutWithoutLocation as processCheckoutWithoutLocationFlow,
  processLocationCheckout as processLocationCheckoutFlow,
  startCheckout as startCheckoutFlow,
} from "./bot/checkout-attendance.flow";
import { whatsappRouterService } from "./whatsapp-router/whatsapp-router.service";
import type { WhatsAppRouterHandlers } from "./whatsapp-router/whatsapp-router.types";
import {
  appendSimulatorMessage,
  getBotNow,
  getBotRuntimeContext,
  isSimulationActive,
  setLastBotResponse,
  setLastTwilioPayload,
  setTechnicalDetail,
} from "../utils/bot-runtime-context";

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
  startCheckIn: startCheckInFlow,
  startCheckout: startCheckoutFlow,
  handleOperationSelection: handleOperationSelectionFlow,
  handleCheckoutOperationSelection: handleCheckoutOperationSelectionFlow,
  processLocationCheckIn: processLocationCheckInFlow,
  processLocationCheckout: processLocationCheckoutFlow,
  processDirectLocationAttendance: (input) => whatsappBotService.processDirectLocationAttendance(input),
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

    const maskPhone = (phone: string): string =>
      phone.length <= 6 ? "***" : `${phone.slice(0, 4)}***${phone.slice(-3)}`;

    console.info("[whatsapp-bot] webhook received", {
      messageSid: payload.MessageSid,
      from: maskPhone(phoneFrom),
      type: getMessageType(payload),
      companyId,
      resolutionSource: inbound.resolutionSource,
    });

    let webhookEventId: string | null = null;
    let webhookProcessingVersion = 0;
    let activeTrace: Awaited<ReturnType<typeof whatsappFlowTraceService.startExecution>> = null;

    try {
      setLastTwilioPayload(payload as unknown as Record<string, string>);

      if (!simulationContext) {
        const payloadRecord = payload as unknown as Record<string, unknown>;
        const payloadHash = hashWebhookPayload(payloadRecord);
        const claim = await whatsappWebhookEventRepository.claimInboundMessage({
          companyId,
          messageSid: payload.MessageSid,
          payloadHash,
        });
        // Invariant: MessageSid claim MUST complete before resolveAttendanceLocationIntent /
        // processDirectLocationAttendance so retries never re-infer CHECK_OUT after CHECK_IN.
        if (claim.outcome === "PAYLOAD_ANOMALY") {
          throw new AppError(
            409,
            "WEBHOOK_PAYLOAD_ANOMALY",
            "MessageSid reutilizado con payload distinto",
          );
        }
        if (claim.outcome === "IDEMPOTENT_REPLAY") {
          console.info("[whatsapp-bot] idempotent webhook replay", {
            messageSid: payload.MessageSid,
          });
          const prior =
            claim.event.responseBody?.trim() ||
            DUPLICATE_MESSAGE_SID_RESPONSE;
          return prior.startsWith("<?xml") ? prior : buildTwiml(prior);
        }
        if (claim.outcome === "IN_PROGRESS" || claim.outcome === "EXHAUSTED") {
          console.info("[whatsapp-bot] webhook claim not acquired", {
            messageSid: payload.MessageSid,
            outcome: claim.outcome,
          });
          return buildTwiml(DUPLICATE_MESSAGE_SID_RESPONSE);
        }
        webhookEventId = claim.event.id;
        webhookProcessingVersion = claim.event.processingVersion;

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
          const duplicateTwiml = buildTwiml(DUPLICATE_MESSAGE_SID_RESPONSE);
          await whatsappWebhookEventRepository.markProcessed({
            companyId,
            eventId: webhookEventId,
            processingVersion: webhookProcessingVersion,
            responseBody: DUPLICATE_MESSAGE_SID_RESPONSE,
            responseType: "DUPLICATE",
            responseReference: "DUPLICATE_MESSAGE_SID",
          });
          return duplicateTwiml;
        }
      }

      const employeeId = await resolveInboundEmployeeId(companyId, phoneFrom, inbound.employeeId);
      const moduleStates = await companyModuleService.getModuleStates(companyId);

      let inboundMessageId: string | null = null;
      if (!simulationContext) {
        const inboundMessage = await whatsappMessageRepository.create({
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
        inboundMessageId = inboundMessage?.id ?? null;
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

      const conversation = !simulationContext
        ? await whatsappFlowTraceService.resolveOrCreateConversation({
            phoneNormalized: phoneFrom,
            companyId,
            employeeId,
          })
        : null;

      const trace = !simulationContext
        ? await whatsappFlowTraceService.startExecution({
            conversationId: conversation?.id ?? null,
            sourceMessageId: inboundMessageId,
            companyId,
            employeeId,
            flowType: isLocationMessage(payload) ? "INBOUND_LOCATION" : "INBOUND_TEXT",
            metadata: {
              messageSid: payload.MessageSid,
              resolutionSource: inbound.resolutionSource,
            },
          })
        : null;
      activeTrace = trace;

      if (trace && inboundMessageId) {
        await whatsappFlowTraceService.linkMessageObservability({
          messageId: inboundMessageId,
          conversationId: conversation?.id ?? null,
          correlationId: trace.correlationId,
          provider: "TWILIO",
          providerMessageSid: payload.MessageSid,
          providerStatus: "received",
        });
        await trace.addStep({
          stepType: "WEBHOOK_RECEIVED",
          status: "SUCCESS",
          output: { messageSid: payload.MessageSid, messageType: getMessageType(payload) },
        });
        await trace.addStep({
          stepType: "COMPANY_RESOLUTION",
          status: "SUCCESS",
          output: { companyId, resolutionSource: inbound.resolutionSource },
        });
        await trace.addStep({
          stepType: "EMPLOYEE_RESOLUTION",
          status: employeeId ? "SUCCESS" : "WARNING",
          output: { employeeId },
          reasonCode: employeeId ? null : WHATSAPP_RESULT_CODES.UNKNOWN_EMPLOYEE,
        });
      }

      const processInbound = async (): Promise<string> => {
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
          if (webhookEventId) {
            const outboundText = extractMessageFromTwiml(response) || response;
            await whatsappWebhookEventRepository.markProcessed({
              companyId,
              eventId: webhookEventId,
              processingVersion: webhookProcessingVersion,
              responseBody: outboundText,
              responseType: "TwiML",
              responseReference: payload.MessageSid,
            });
          }
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

        const runtimeTrace = getObservabilityTrace();
        if (runtimeTrace) {
          const intent = getBotRuntimeContext()?.lastDetectedIntent ?? null;
          if (intent) {
            await runtimeTrace.addStep({
              stepType: "INTENT_DETECTION",
              status: "SUCCESS",
              output: { intent },
            });
          }
          const flowResult = getObservabilityFlowResult();
          await runtimeTrace.addStep({
            stepType: "FLOW_COMPLETED",
            status: "SUCCESS",
            output: {
              resultCode: flowResult?.resultCode ?? WHATSAPP_RESULT_CODES.FLOW_COMPLETED,
              flowType: flowResult?.flowType ?? null,
            },
          });
          await runtimeTrace.complete({
            status: "COMPLETED",
            resultCode: flowResult?.resultCode ?? WHATSAPP_RESULT_CODES.FLOW_COMPLETED,
            employeeId: flowResult?.relatedEntities?.employeeId ?? employeeId,
            sessionId: flowResult?.relatedEntities?.sessionId ?? null,
            attendanceId: flowResult?.relatedEntities?.attendanceId ?? null,
            operationId: flowResult?.relatedEntities?.operationId ?? null,
            workdayId: flowResult?.relatedEntities?.workdayId ?? null,
            sourceMessageId: inboundMessageId,
          });
        }

        return response;
      };

      if (trace) {
        return runWithObservabilityTrace(trace, processInbound);
      }
      return processInbound();
    } catch (error) {
      console.error("[whatsapp-bot] unexpected webhook error", {
        messageSid: payload.MessageSid,
        companyId,
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      });

      const failedTrace = activeTrace ?? getObservabilityTrace();
      if (failedTrace) {
        await failedTrace.addStep({
          stepType: "ERROR",
          status: "FAILED",
          errorCode: error instanceof AppError ? error.code : "UNKNOWN_ERROR",
          errorMessage: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        });
        await failedTrace.complete({
          status: "FAILED",
          resultCode: WHATSAPP_RESULT_CODES.GENERIC_ERROR,
          errorCode: error instanceof AppError ? error.code : "UNKNOWN_ERROR",
          errorMessage: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        });
      }

      if (isSimulationActive()) {
        setTechnicalDetail("error", error instanceof Error ? error.message : "UNKNOWN_ERROR");
        setLastBotResponse(GENERIC_ERROR_MESSAGE);
        return buildTwiml(GENERIC_ERROR_MESSAGE);
      }

      if (error instanceof AppError && error.code === "WEBHOOK_PAYLOAD_ANOMALY") {
        throw error;
      }

      if (webhookEventId) {
        try {
          await whatsappWebhookEventRepository.markFailed({
            companyId,
            eventId: webhookEventId,
            processingVersion: webhookProcessingVersion,
            error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
          });
        } catch (markFailedError) {
          console.error("[whatsapp-bot] failed to mark webhook event failed", {
            messageSid: payload.MessageSid,
            error:
              markFailedError instanceof Error
                ? markFailedError.message
                : "UNKNOWN_ERROR",
          });
        }
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

  /**
   * PUBLIC_API_REQUIRED — bot simulator and module-gating tests exercise direct location
   * without going through Twilio webhook claim.
   */
  async processDirectLocationAttendance(input: {
    companyId: string;
    employeeId: string;
    latitude: number;
    longitude: number;
    messageSid: string;
    phoneFrom: string;
    phoneTo: string;
    moduleStates: ReadonlyMap<CompanyModuleKey, boolean>;
  }): Promise<string> {
    return runDirectLocationAttendance(input, {
      processLocationCheckIn: processLocationCheckInFlow,
      processLocationCheckout: processLocationCheckoutFlow,
      processCheckoutWithoutLocation: processCheckoutWithoutLocationFlow,
      respond,
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

};

export const isOperationCompatibleAt = isWithinOperationWindow;
