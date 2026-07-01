import sql from "mssql";
import twilio from "twilio";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { getPool } from "../database/connection";
import { attendanceRepository } from "../repositories/attendance.repository";
import { botSessionRepository } from "../repositories/bot-session.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { inventoryEmployeeRepository } from "../repositories/inventory-employee.repository";
import { whatsappMessageRepository } from "../repositories/whatsapp-message.repository";
import type { TwilioWebhookInput } from "../schemas/twilio-webhook.schema";
import { botSessionService } from "./bot-session.service";
import type { BotSession } from "../types/twilio.types";
import type { AttendanceRecord } from "../types/domain";
import { EXPIRED_SESSION_USER_MESSAGE } from "../utils/bot-session-expiration";
import {
  combineAttendanceValidation,
  evaluatePunctuality,
  formatLocalTime,
  isWithinInventoryWindow,
} from "../utils/attendance-validation";
import {
  combineCheckoutValidation,
  evaluateCheckoutTime,
} from "../utils/checkout-validation";
import { isCheckoutSessionState, isAbsenceSessionState } from "../utils/bot-session-states";
import { InvalidCoordinatesError } from "../utils/haversine";
import { isAbsenceCancelIntent } from "../utils/absence-intent";
import { parseInventorySelection } from "../utils/intent";
import { normalizeWhatsAppPhone, tryNormalizeWhatsAppPhone } from "../utils/phone";
import { extractMessageFromTwiml } from "../utils/twiml-message";
import { absenceBotService } from "./absence-bot.service";
import { evaluateAttendanceGeofence } from "./bot/bot-geofence.validator";
import { parseBotIntent } from "./bot/bot-intent.parser";
import {
  buildArrivalRegisteredMessage,
  buildCheckoutInventorySelectionPrompt,
  buildCheckoutLocationRequestMessage,
  buildCheckoutRegisteredMessage,
  buildInventorySelectionPrompt,
  buildLocationRequestMessage,
  DUPLICATE_ATTENDANCE_MESSAGE,
  DUPLICATE_CHECKOUT_MESSAGE,
  DUPLICATE_MESSAGE_SID_RESPONSE,
  GENERIC_ERROR_MESSAGE,
  GLOBAL_CANCEL_MESSAGE,
  GREETING_MESSAGE,
  ACTIVE_ATTENDANCE_FLOW_MESSAGE,
  INVALID_COORDINATES_MESSAGE,
  INVALID_SELECTION_MESSAGE,
  LOCATION_DURING_CHECKOUT_SELECTION_MESSAGE,
  LOCATION_DURING_SELECTION_MESSAGE,
  LOCATION_WITHOUT_CHECKOUT_SESSION_MESSAGE,
  LOCATION_WITHOUT_SESSION_MESSAGE,
  NO_CHECK_IN_FOR_CHECKOUT_MESSAGE,
  NO_CHECKOUT_INVENTORY_MESSAGE,
  NO_INVENTORY_MESSAGE,
  UNPARSEABLE_MESSAGE,
  UNKNOWN_EMPLOYEE_MESSAGE,
  WAITING_CHECKOUT_LOCATION_TEXT_MESSAGE,
  WAITING_LOCATION_TEXT_MESSAGE,
} from "./bot/bot-response.builder";
import {
  findCheckoutEligibleInventoryById,
  findCompatibleInventoryById,
  isValidInventorySelection,
  listCheckoutEligibleInventories,
  listCompatibleInventories,
  mapCheckoutInventoriesToSessionOptions,
  mapCompatibleInventoriesToSessionOptions,
  parseInventorySelectionIndex,
} from "./bot/bot-inventory.selector";
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
  setLastDetectedIntent,
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

export const whatsappBotService = {
  buildTwiml,

  async handleWebhook(companyId: string, payload: TwilioWebhookInput): Promise<string> {
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

      const employee = simulationContext
        ? null
        : await employeeRepository.findByPhone(companyId, phoneFrom);
      const employeeId =
        simulationContext?.employeeIdOverride ?? (employee?.active ? employee.id : null);

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
        });
      } else {
        response = await this.handleTextMessage({
          companyId,
          payload,
          phoneFrom,
          phoneTo: botNumber,
          employeeId,
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
  }): Promise<string> {
    const body = input.payload.Body?.trim() ?? "";
    const { companyId } = input;

    if (!input.employeeId) {
      console.info("[whatsapp-bot] employee not identified", { phone: input.phoneFrom });
      return respond(companyId, {
        message: UNKNOWN_EMPLOYEE_MESSAGE,
        employeeId: null,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const { activeSession: session, recentlyExpired } =
      await botSessionService.getSessionResolutionByPhone(companyId, input.phoneFrom);

    if (!session && recentlyExpired && parseInventorySelection(body)) {
      console.info("[whatsapp-bot] inventory selection after expired session", {
        phone: input.phoneFrom,
      });
      return respond(companyId, {
        message: EXPIRED_SESSION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (session && isAbsenceCancelIntent(body)) {
      await botSessionService.cancelSession(companyId, session.id);
      return respond(companyId, {
        message: GLOBAL_CANCEL_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (session?.state === "WAITING_INVENTORY_SELECTION") {
      return this.handleInventorySelection({
        companyId,
        session,
        body,
        employeeId: input.employeeId,
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
      });
    }

    if (session?.state === "WAITING_CHECKOUT_INVENTORY_SELECTION") {
      return this.handleCheckoutInventorySelection({
        companyId,
        session,
        body,
        employeeId: input.employeeId,
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
      });
    }

    if (session?.state === "WAITING_LOCATION") {
      return respond(companyId, {
        message: WAITING_LOCATION_TEXT_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (session?.state === "WAITING_CHECKOUT_LOCATION") {
      return respond(companyId, {
        message: WAITING_CHECKOUT_LOCATION_TEXT_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (session && isAbsenceSessionState(session.state)) {
      const boundRespond = (msg: Parameters<typeof respond>[1]) => respond(companyId, msg);
      return absenceBotService.handleAbsenceSession(companyId, {
        session,
        body,
        employeeId: input.employeeId,
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
        messageSid: input.payload.MessageSid,
        respond: boundRespond,
      });
    }

    if (!body) {
      return respond(companyId, {
        message: UNPARSEABLE_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const intent = parseBotIntent({ body });

    if (intent === "checkout") {
      setLastDetectedIntent("checkout");
      if (session && isAbsenceSessionState(session.state)) {
        return respond(companyId, {
          message: ACTIVE_ATTENDANCE_FLOW_MESSAGE,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }
      return this.startCheckout({
        companyId,
        employeeId: input.employeeId,
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
      });
    }

    if (intent === "arrival") {
      setLastDetectedIntent("check-in");
      if (session && isAbsenceSessionState(session.state)) {
        return respond(companyId, {
          message: ACTIVE_ATTENDANCE_FLOW_MESSAGE,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }
      return this.startCheckIn({
        companyId,
        employeeId: input.employeeId,
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
      });
    }

    if (intent === "absence") {
      setLastDetectedIntent("absence");
      if (absenceBotService.hasActiveAttendanceSession(session)) {
        return respond(companyId, {
          message: ACTIVE_ATTENDANCE_FLOW_MESSAGE,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      const boundRespond = (msg: Parameters<typeof respond>[1]) => respond(companyId, msg);
      return absenceBotService.startAbsenceFlow(companyId, {
        employeeId: input.employeeId,
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
        body,
        respond: boundRespond,
      });
    }

    if (intent === "menu") {
      setLastDetectedIntent("greeting");
      return respond(companyId, {
        message: GREETING_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    return respond(companyId, {
      message: GREETING_MESSAGE,
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  },

  async startCheckout(input: {
    companyId: string;
    employeeId: string;
    phoneFrom: string;
    phoneTo: string;
  }): Promise<string> {
    const { companyId } = input;
    const eligible = await listCheckoutEligibleInventories(companyId, input.employeeId);

    if (eligible.length === 0) {
      return respond(companyId, {
        message: NO_CHECK_IN_FOR_CHECKOUT_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (eligible.length === 1) {
      const inventory = eligible[0];
      await botSessionService.createWaitingCheckoutLocationSession(companyId, {
        employeeId: input.employeeId,
        phoneNumber: input.phoneFrom,
        inventoryId: inventory.id,
      });

      return respond(companyId, {
        message: buildCheckoutLocationRequestMessage(inventory),
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const options = mapCheckoutInventoriesToSessionOptions(eligible);

    await botSessionService.createCheckoutInventorySelectionSession(companyId, {
      employeeId: input.employeeId,
      phoneNumber: input.phoneFrom,
      options,
    });

    return respond(companyId, {
      message: buildCheckoutInventorySelectionPrompt(eligible),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  },

  async handleCheckoutInventorySelection(input: {
    companyId: string;
    session: BotSession;
    body: string;
    employeeId: string;
    phoneFrom: string;
    phoneTo: string;
  }): Promise<string> {
    const { companyId } = input;
    const selection = parseInventorySelectionIndex(input.body);
    const context = botSessionService.parseContext(input.session.contextJson);
    const options = context.inventoryOptions ?? [];

    if (!isValidInventorySelection(selection, options.length)) {
      return respond(companyId, {
        message: INVALID_SELECTION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const selected = options[selection - 1];
    const eligible = await findCheckoutEligibleInventoryById(companyId, input.employeeId, selected.inventoryId);

    if (!eligible) {
      return respond(companyId, {
        message: NO_CHECKOUT_INVENTORY_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const selectionResult = await botSessionService.selectCheckoutInventoryAndRenewExpiration(companyId, 
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
    const inventories = await listCompatibleInventories(companyId, input.employeeId, now);

    if (inventories.length === 0) {
      console.info("[whatsapp-bot] no compatible inventory", { employeeId: input.employeeId });
      return respond(companyId, {
        message: NO_INVENTORY_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (inventories.length === 1) {
      const inventory = inventories[0];
      await botSessionService.createWaitingLocationSession(companyId, {
        employeeId: input.employeeId,
        phoneNumber: input.phoneFrom,
        inventoryId: inventory.id,
      });

      console.info("[whatsapp-bot] session created WAITING_LOCATION", {
        employeeId: input.employeeId,
        inventoryId: inventory.id,
      });

      return respond(companyId, {
        message: buildLocationRequestMessage(inventory),
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const options = mapCompatibleInventoriesToSessionOptions(inventories);

    await botSessionService.createInventorySelectionSession(companyId, {
      employeeId: input.employeeId,
      phoneNumber: input.phoneFrom,
      options,
    });

    console.info("[whatsapp-bot] session created WAITING_INVENTORY_SELECTION", {
      employeeId: input.employeeId,
      options: options.length,
    });

    return respond(companyId, {
      message: buildInventorySelectionPrompt(inventories),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  },

  async handleInventorySelection(input: {
    companyId: string;
    session: BotSession;
    body: string;
    employeeId: string;
    phoneFrom: string;
    phoneTo: string;
  }): Promise<string> {
    const { companyId } = input;
    const selection = parseInventorySelectionIndex(input.body);
    const context = botSessionService.parseContext(input.session.contextJson);
    const options = context.inventoryOptions ?? [];

    if (!isValidInventorySelection(selection, options.length)) {
      return respond(companyId, {
        message: INVALID_SELECTION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const selected = options[selection - 1];
    const now = getBotNow();
    const compatible = await findCompatibleInventoryById(companyId, 
      input.employeeId,
      selected.inventoryId,
      now,
    );

    if (!compatible) {
      return respond(companyId, {
        message: NO_INVENTORY_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const selectionResult = await botSessionService.selectInventoryAndRenewExpiration(companyId, 
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
  }): Promise<string> {
    const { companyId } = input;
    if (!input.employeeId) {
      return respond(companyId, {
        message: UNKNOWN_EMPLOYEE_MESSAGE,
        employeeId: null,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const { activeSession: session, recentlyExpired } =
      await botSessionService.getSessionResolutionByPhone(companyId, input.phoneFrom);

    if (!session) {
      return respond(companyId, {
        message: recentlyExpired ? EXPIRED_SESSION_MESSAGE : LOCATION_WITHOUT_SESSION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (session.state === "WAITING_INVENTORY_SELECTION") {
      return respond(companyId, {
        message: LOCATION_DURING_SELECTION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (session.state === "WAITING_CHECKOUT_INVENTORY_SELECTION") {
      return respond(companyId, {
        message: LOCATION_DURING_CHECKOUT_SELECTION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (session.state === "WAITING_CHECKOUT_LOCATION" && session.inventoryId) {
      try {
        const latitude = Number(input.payload.Latitude);
        const longitude = Number(input.payload.Longitude);

        return await this.processLocationCheckout({
          companyId,
          session,
          employeeId: input.employeeId,
          inventoryId: session.inventoryId,
          latitude,
          longitude,
          messageSid: input.payload.MessageSid,
          phoneFrom: input.phoneFrom,
          phoneTo: input.phoneTo,
        });
      } catch (error) {
        if (error instanceof InvalidCoordinatesError) {
          return respond(companyId, {
            message: INVALID_COORDINATES_MESSAGE,
            employeeId: input.employeeId,
            phoneFrom: input.phoneTo,
            phoneTo: input.phoneFrom,
          });
        }

        console.error("[whatsapp-bot] unexpected checkout location processing error", error);
        return respond(companyId, {
          message: GENERIC_ERROR_MESSAGE,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }
    }

    if (session.state !== "WAITING_LOCATION" || !session.inventoryId) {
      return respond(companyId, {
        message: isCheckoutSessionState(session.state)
          ? LOCATION_WITHOUT_CHECKOUT_SESSION_MESSAGE
          : LOCATION_WITHOUT_SESSION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    try {
      const latitude = Number(input.payload.Latitude);
      const longitude = Number(input.payload.Longitude);

      return await this.processLocationCheckIn({
        companyId,
        session,
        employeeId: input.employeeId,
        inventoryId: session.inventoryId,
        latitude,
        longitude,
        messageSid: input.payload.MessageSid,
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
      });
    } catch (error) {
      if (error instanceof InvalidCoordinatesError) {
        return respond(companyId, {
          message: INVALID_COORDINATES_MESSAGE,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      console.error("[whatsapp-bot] unexpected location processing error", error);
      return respond(companyId, {
        message: GENERIC_ERROR_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }
  },

  async processLocationCheckIn(input: {
    companyId: string;
    session: BotSession;
    employeeId: string;
    inventoryId: string;
    latitude: number;
    longitude: number;
    messageSid: string;
    phoneFrom: string;
    phoneTo: string;
  }): Promise<string> {
    const { companyId } = input;
    const receivedAt = getBotNow();
    const compatible = await findCompatibleInventoryById(companyId, 
      input.employeeId,
      input.inventoryId,
      receivedAt,
    );

    if (!compatible) {
      return respond(companyId, {
        message: NO_INVENTORY_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const isAssigned = await inventoryEmployeeRepository.exists(companyId, 
      input.inventoryId,
      input.employeeId,
    );
    if (!isAssigned) {
      return respond(companyId, {
        message: NO_INVENTORY_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const hasActiveRecord = isSimulationDryRun()
      ? hasVirtualActiveRecord(input.inventoryId, input.employeeId)
      : await attendanceRepository.hasActiveRecord(companyId, input.inventoryId, input.employeeId, {
          simulationSessionId: getSimulationSessionId(),
        });
    if (hasActiveRecord) {
      await botSessionService.completeSession(companyId, input.session.id);
      return respond(companyId, {
        message: DUPLICATE_ATTENDANCE_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const geo = evaluateAttendanceGeofence({
      employeeLatitude: input.latitude,
      employeeLongitude: input.longitude,
      storeLatitude: compatible.storeLatitude,
      storeLongitude: compatible.storeLongitude,
      allowedRadiusMeters: compatible.allowedRadiusMeters,
      reviewMarginMeters: env.BOT_GEOFENCE_REVIEW_MARGIN_METERS,
    });

    const time = evaluatePunctuality(
      receivedAt,
      new Date(compatible.scheduledStart),
      compatible.earlyToleranceMinutes,
      compatible.lateToleranceMinutes,
      env.BOT_ON_TIME_GRACE_MINUTES,
    );

    const validation = combineAttendanceValidation(geo, time);
    setTechnicalDetail("distanceMeters", Math.round(geo.distanceMeters * 100) / 100);
    setTechnicalDetail("allowedRadiusMeters", compatible.allowedRadiusMeters);
    setTechnicalDetail("reviewMarginMeters", env.BOT_GEOFENCE_REVIEW_MARGIN_METERS);
    setTechnicalDetail("locationValidation", validation);
    setTechnicalDetail("timeValidation", time);

    if (isSimulationDryRun()) {
      const responseMessage = buildArrivalRegisteredMessage({
        compatible,
        distanceMeters: geo.distanceMeters,
        validationStatus: validation.validationStatus,
        punctualityStatus: validation.punctualityStatus,
        validationReason: validation.validationReason,
        receivedAt,
      });

      const virtualRecord = addVirtualCheckIn({
        inventoryId: input.inventoryId,
        employeeId: input.employeeId,
        receivedAt: receivedAt.toISOString(),
        validationStatus: validation.validationStatus,
        locationStatus: validation.locationStatus,
        punctualityStatus: validation.punctualityStatus,
        distanceMeters: Math.round(geo.distanceMeters * 100) / 100,
      });

      recordSimulationArtifact({
        type: "check-in",
        persisted: false,
        virtualAttendanceId: virtualRecord.id,
        inventoryId: input.inventoryId,
        employeeId: input.employeeId,
        validationStatus: validation.validationStatus,
        locationStatus: validation.locationStatus,
        punctualityStatus: validation.punctualityStatus,
        distanceMeters: Math.round(geo.distanceMeters * 100) / 100,
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

      const hasDuplicate = await attendanceRepository.hasActiveRecordInTransaction(companyId, transaction,
        input.inventoryId,
        input.employeeId,
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
        inventoryId: input.inventoryId,
        employeeId: input.employeeId,
        receivedLatitude: input.latitude,
        receivedLongitude: input.longitude,
        distanceMeters: Math.round(geo.distanceMeters * 100) / 100,
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
          inventoryId: input.inventoryId,
          employeeId: input.employeeId,
          validationStatus: validation.validationStatus,
          locationStatus: validation.locationStatus,
          punctualityStatus: validation.punctualityStatus,
          distanceMeters: Math.round(geo.distanceMeters * 100) / 100,
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
        inventoryId: input.inventoryId,
        validationStatus: validation.validationStatus,
      });

      const responseMessage = buildArrivalRegisteredMessage({
        compatible,
        distanceMeters: geo.distanceMeters,
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
    inventoryId: string;
    latitude: number;
    longitude: number;
    messageSid: string;
    phoneFrom: string;
    phoneTo: string;
  }): Promise<string> {
    const { companyId } = input;
    const checkoutAt = getBotNow();
    const eligible = await findCheckoutEligibleInventoryById(companyId, input.employeeId, input.inventoryId);

    if (!eligible) {
      return respond(companyId, {
        message: NO_CHECK_IN_FOR_CHECKOUT_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const simulationSessionId = getSimulationSessionId();
    let attendance = isSimulationDryRun()
      ? null
      : await attendanceRepository.findCheckInForCheckout(companyId, input.inventoryId, input.employeeId, {
          simulationSessionId,
        });

    if (isSimulationDryRun()) {
      const virtual = findVirtualCheckInForCheckout(input.inventoryId, input.employeeId);
      if (virtual) {
        attendance = {
          id: virtual.id,
          inventoryId: virtual.inventoryId,
          employeeId: virtual.employeeId,
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
      const checkoutTime = formatLocalTime(attendance.checkoutAt, env.BOT_OPERATION_TIMEZONE);
      return respond(companyId, {
        message: `${DUPLICATE_CHECKOUT_MESSAGE}\nHora registrada: ${checkoutTime}.`,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const geo = evaluateAttendanceGeofence({
      employeeLatitude: input.latitude,
      employeeLongitude: input.longitude,
      storeLatitude: eligible.storeLatitude,
      storeLongitude: eligible.storeLongitude,
      allowedRadiusMeters: eligible.allowedRadiusMeters,
      reviewMarginMeters: env.BOT_GEOFENCE_REVIEW_MARGIN_METERS,
    });

    const timeEvaluation = evaluateCheckoutTime(
      checkoutAt,
      eligible.scheduledEnd ? new Date(eligible.scheduledEnd) : null,
      env.BOT_CHECKOUT_EARLY_TOLERANCE_MINUTES,
    );

    const validation = combineCheckoutValidation(geo, timeEvaluation);
    setTechnicalDetail("checkoutDistanceMeters", Math.round(geo.distanceMeters * 100) / 100);
    setTechnicalDetail("checkoutValidation", validation);

    if (isSimulationDryRun()) {
      const responseMessage = buildCheckoutRegisteredMessage({
        eligible,
        checkInAt: attendance.receivedAt,
        checkoutAt,
        distanceMeters: geo.distanceMeters,
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
        distanceMeters: Math.round(geo.distanceMeters * 100) / 100,
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
        checkoutDistanceMeters: Math.round(geo.distanceMeters * 100) / 100,
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
          distanceMeters: Math.round(geo.distanceMeters * 100) / 100,
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
};

export const isInventoryCompatibleAt = isWithinInventoryWindow;
