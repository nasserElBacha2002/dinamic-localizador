import sql from "mssql";
import twilio from "twilio";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { getPool } from "../database/connection";
import { attendanceRepository } from "../repositories/attendance.repository";
import { botSessionRepository } from "../repositories/bot-session.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { inventoryEmployeeRepository } from "../repositories/inventory-employee.repository";
import { inventoryRepository } from "../repositories/inventory.repository";
import { whatsappMessageRepository } from "../repositories/whatsapp-message.repository";
import type { TwilioWebhookInput } from "../schemas/twilio-webhook.schema";
import { botSessionService } from "./bot-session.service";
import { geolocationService } from "./geolocation.service";
import type { BotSession, CheckoutEligibleInventory, CompatibleInventory } from "../types/twilio.types";
import { EXPIRED_SESSION_USER_MESSAGE } from "../utils/bot-session-expiration";
import {
  combineAttendanceValidation,
  evaluateGeofence,
  evaluatePunctuality,
  formatLocalTime,
  isWithinInventoryWindow,
} from "../utils/attendance-validation";
import {
  checkoutStatusLabel,
  combineCheckoutValidation,
  evaluateCheckoutTime,
} from "../utils/checkout-validation";
import { isCheckoutSessionState } from "../utils/bot-session-states";
import { InvalidCoordinatesError } from "../utils/haversine";
import { isCheckInIntent, isCheckoutIntent, isSimpleGreeting, parseInventorySelection } from "../utils/intent";
import { normalizeWhatsAppPhone, tryNormalizeWhatsAppPhone } from "../utils/phone";

const UNKNOWN_EMPLOYEE_MESSAGE =
  "No encontramos un empleado activo asociado a este número de WhatsApp. Contactá a administración.";

const GREETING_MESSAGE =
  'Hola. Para registrar tu llegada escribí "Llegué". Para registrar tu salida escribí "Me voy".';

const NO_CHECK_IN_FOR_CHECKOUT_MESSAGE =
  "No encontré una llegada registrada para este inventario. Primero tenés que haber marcado 'Llegué'.";

const NO_CHECKOUT_INVENTORY_MESSAGE =
  "No encontramos un inventario con llegada registrada pendiente de salida. Verificá con administración.";

const LOCATION_WITHOUT_CHECKOUT_SESSION_MESSAGE =
  'Para registrar tu salida, primero escribí "Me voy".';

const WAITING_CHECKOUT_LOCATION_TEXT_MESSAGE =
  "Todavía necesitamos tu ubicación actual para registrar la salida. Usá Adjuntar → Ubicación → Enviar tu ubicación actual.";

const LOCATION_DURING_CHECKOUT_SELECTION_MESSAGE =
  "Primero seleccioná el inventario para registrar la salida respondiendo con el número correspondiente.";

const DUPLICATE_CHECKOUT_MESSAGE = "Tu salida ya había sido registrada anteriormente.";

const CHECKOUT_REMINDER =
  "Cuando finalices el inventario, enviá 'Me voy' para registrar tu salida.";

const NO_INVENTORY_MESSAGE =
  "No encontramos un inventario asignado para vos en la fecha y horario actuales. Verificá con administración.";

const LOCATION_WITHOUT_SESSION_MESSAGE =
  'Para registrar tu llegada, primero escribí "Llegué".';

const EXPIRED_SESSION_MESSAGE = EXPIRED_SESSION_USER_MESSAGE;

const WAITING_LOCATION_TEXT_MESSAGE =
  "Todavía necesitamos tu ubicación actual. Usá Adjuntar → Ubicación → Enviar tu ubicación actual.";

const LOCATION_DURING_SELECTION_MESSAGE =
  "Primero seleccioná el inventario respondiendo con el número correspondiente.";

const INVALID_SELECTION_MESSAGE =
  "La opción ingresada no es válida. Respondé con uno de los números disponibles.";

const UNPARSEABLE_MESSAGE =
  'No pudimos interpretar el mensaje. Para registrar tu llegada escribí "Llegué".';

const DUPLICATE_ATTENDANCE_MESSAGE = "Ya registraste tu llegada para este inventario.";

const DUPLICATE_MESSAGE_SID_RESPONSE = "Ya procesamos tu mensaje anterior.";

const GENERIC_ERROR_MESSAGE =
  "No pudimos procesar tu solicitud en este momento.\nIntentá nuevamente o contactá a tu supervisor.";

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

const buildCheckoutInventoryPrompt = (inventory: CheckoutEligibleInventory): string => {
  const localTime = formatLocalTime(inventory.scheduledStart, env.BOT_OPERATION_TIMEZONE);
  return `Perfecto. Para registrar tu salida del inventario en ${inventory.storeName} (${localTime}), compartime tu ubicación actual.`;
};

const buildCheckoutInventorySelectionPrompt = (
  inventories: CheckoutEligibleInventory[],
): string => {
  const lines = inventories.map((inventory, index) => {
    const localTime = formatLocalTime(inventory.scheduledStart, env.BOT_OPERATION_TIMEZONE);
    return `${index + 1}. ${inventory.storeName} — ${localTime}`;
  });

  return `Encontramos más de un inventario con llegada registrada:\n\n${lines.join("\n")}\n\nRespondé con el número correspondiente para registrar la salida.`;
};

const findCheckoutEligibleInventory = async (
  employeeId: string,
  inventoryId: string,
): Promise<CheckoutEligibleInventory | null> => {
  const inventories = await attendanceRepository.findCheckoutEligibleInventories(employeeId);
  return inventories.find((inventory) => inventory.id === inventoryId) ?? null;
};
const buildInventoryPrompt = (inventory: CompatibleInventory): string => {
  const localTime = formatLocalTime(inventory.scheduledStart, env.BOT_OPERATION_TIMEZONE);
  return `Encontramos tu inventario en ${inventory.storeName}, programado para las ${localTime}.\n\nCompartí tu ubicación actual desde WhatsApp para registrar tu llegada.`;
};

const buildInventorySelectionPrompt = (inventories: CompatibleInventory[]): string => {
  const lines = inventories.map((inventory, index) => {
    const localTime = formatLocalTime(inventory.scheduledStart, env.BOT_OPERATION_TIMEZONE);
    return `${index + 1}. ${inventory.storeName} — ${localTime}`;
  });

  return `Encontramos más de un inventario compatible:\n\n${lines.join("\n")}\n\nRespondé con el número correspondiente.`;
};

const findCompatibleInventory = async (
  employeeId: string,
  inventoryId: string,
  at: Date,
): Promise<CompatibleInventory | null> => {
  const inventories = await inventoryRepository.findCompatibleForEmployee(employeeId, at);
  return inventories.find((inventory) => inventory.id === inventoryId) ?? null;
};

const saveOutboundMessage = async (input: {
  employeeId: string | null;
  phoneFrom: string;
  phoneTo: string;
  body: string;
}): Promise<void> => {
  await whatsappMessageRepository.create({
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

const respond = async (input: {
  message: string;
  employeeId: string | null;
  phoneFrom: string;
  phoneTo: string;
}): Promise<string> => {
  await saveOutboundMessage({
    employeeId: input.employeeId,
    phoneFrom: input.phoneFrom,
    phoneTo: input.phoneTo,
    body: input.message,
  });

  return buildTwiml(input.message);
};

export const whatsappBotService = {
  buildTwiml,

  async handleWebhook(payload: TwilioWebhookInput): Promise<string> {
    const phoneFrom = normalizeWhatsAppPhone(payload.From);
    const phoneTo = tryNormalizeWhatsAppPhone(payload.To) ?? payload.To;
    const botNumber = env.TWILIO_WHATSAPP_NUMBER;
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
      const existingMessage = await whatsappMessageRepository.findByMessageSid(payload.MessageSid);
      if (existingMessage) {
        console.info("[whatsapp-bot] duplicate MessageSid", { messageSid: payload.MessageSid });
        await whatsappMessageRepository.updateProcessingStatus(payload.MessageSid, {
          processingStatus: "DUPLICATE",
          processingErrorCode: "DUPLICATE_MESSAGE_SID",
        });
        return buildTwiml(DUPLICATE_MESSAGE_SID_RESPONSE);
      }

      const employee = await employeeRepository.findByPhone(phoneFrom);
      const employeeId = employee?.active ? employee.id : null;

      await whatsappMessageRepository.create({
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

      let response: string;

      if (isLocationMessage(payload)) {
        response = await this.handleLocationMessage({
          payload,
          phoneFrom,
          phoneTo: botNumber,
          employeeId,
        });
      } else {
        response = await this.handleTextMessage({
          payload,
          phoneFrom,
          phoneTo: botNumber,
          employeeId,
        });
      }

      await whatsappMessageRepository.updateProcessingStatus(payload.MessageSid, {
        processingStatus: "PROCESSED",
      });

      return response;
    } catch (error) {
      console.error("[whatsapp-bot] unexpected webhook error", error);

      try {
        await whatsappMessageRepository.updateProcessingStatus(payload.MessageSid, {
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
    payload: TwilioWebhookInput;
    phoneFrom: string;
    phoneTo: string;
    employeeId: string | null;
  }): Promise<string> {
    const body = input.payload.Body?.trim() ?? "";

    if (!input.employeeId) {
      console.info("[whatsapp-bot] employee not identified", { phone: input.phoneFrom });
      return respond({
        message: UNKNOWN_EMPLOYEE_MESSAGE,
        employeeId: null,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const { activeSession: session, recentlyExpired } =
      await botSessionService.getSessionResolutionByPhone(input.phoneFrom);

    if (!session && recentlyExpired && parseInventorySelection(body)) {
      console.info("[whatsapp-bot] inventory selection after expired session", {
        phone: input.phoneFrom,
      });
      return respond({
        message: EXPIRED_SESSION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (session?.state === "WAITING_INVENTORY_SELECTION") {
      return this.handleInventorySelection({
        session,
        body,
        employeeId: input.employeeId,
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
      });
    }

    if (session?.state === "WAITING_CHECKOUT_INVENTORY_SELECTION") {
      return this.handleCheckoutInventorySelection({
        session,
        body,
        employeeId: input.employeeId,
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
      });
    }

    if (session?.state === "WAITING_LOCATION") {
      return respond({
        message: WAITING_LOCATION_TEXT_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (session?.state === "WAITING_CHECKOUT_LOCATION") {
      return respond({
        message: WAITING_CHECKOUT_LOCATION_TEXT_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (!body) {
      return respond({
        message: UNPARSEABLE_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (isCheckoutIntent(body)) {
      return this.startCheckout({
        employeeId: input.employeeId,
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
      });
    }

    if (isCheckInIntent(body)) {
      return this.startCheckIn({
        employeeId: input.employeeId,
        phoneFrom: input.phoneFrom,
        phoneTo: input.phoneTo,
      });
    }

    if (isSimpleGreeting(body)) {
      return respond({
        message: GREETING_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    return respond({
      message: GREETING_MESSAGE,
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  },

  async startCheckout(input: {
    employeeId: string;
    phoneFrom: string;
    phoneTo: string;
  }): Promise<string> {
    const eligible = await attendanceRepository.findCheckoutEligibleInventories(input.employeeId);

    if (eligible.length === 0) {
      return respond({
        message: NO_CHECK_IN_FOR_CHECKOUT_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (eligible.length === 1) {
      const inventory = eligible[0];
      await botSessionService.createWaitingCheckoutLocationSession({
        employeeId: input.employeeId,
        phoneNumber: input.phoneFrom,
        inventoryId: inventory.id,
      });

      return respond({
        message: buildCheckoutInventoryPrompt(inventory),
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const options = eligible.map((inventory) => ({
      inventoryId: inventory.id,
      storeName: inventory.storeName,
      scheduledStart: inventory.scheduledStart,
    }));

    await botSessionService.createCheckoutInventorySelectionSession({
      employeeId: input.employeeId,
      phoneNumber: input.phoneFrom,
      options,
    });

    return respond({
      message: buildCheckoutInventorySelectionPrompt(eligible),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  },

  async handleCheckoutInventorySelection(input: {
    session: BotSession;
    body: string;
    employeeId: string;
    phoneFrom: string;
    phoneTo: string;
  }): Promise<string> {
    const selection = parseInventorySelection(input.body);
    const context = botSessionService.parseContext(input.session.contextJson);
    const options = context.inventoryOptions ?? [];

    if (!selection || selection > options.length) {
      return respond({
        message: INVALID_SELECTION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const selected = options[selection - 1];
    const eligible = await findCheckoutEligibleInventory(input.employeeId, selected.inventoryId);

    if (!eligible) {
      return respond({
        message: NO_CHECKOUT_INVENTORY_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const selectionResult = await botSessionService.selectCheckoutInventoryAndRenewExpiration(
      input.session.id,
      eligible.id,
    );

    if (selectionResult.kind === "expired") {
      return respond({
        message: EXPIRED_SESSION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (selectionResult.kind !== "ok") {
      return respond({
        message: INVALID_SELECTION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    return respond({
      message: buildCheckoutInventoryPrompt(eligible),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  },

  async startCheckIn(input: {
    employeeId: string;
    phoneFrom: string;
    phoneTo: string;
  }): Promise<string> {
    const now = new Date();
    const inventories = await inventoryRepository.findCompatibleForEmployee(input.employeeId, now);

    if (inventories.length === 0) {
      console.info("[whatsapp-bot] no compatible inventory", { employeeId: input.employeeId });
      return respond({
        message: NO_INVENTORY_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (inventories.length === 1) {
      const inventory = inventories[0];
      await botSessionService.createWaitingLocationSession({
        employeeId: input.employeeId,
        phoneNumber: input.phoneFrom,
        inventoryId: inventory.id,
      });

      console.info("[whatsapp-bot] session created WAITING_LOCATION", {
        employeeId: input.employeeId,
        inventoryId: inventory.id,
      });

      return respond({
        message: buildInventoryPrompt(inventory),
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const options = inventories.map((inventory) => ({
      inventoryId: inventory.id,
      storeName: inventory.storeName,
      scheduledStart: inventory.scheduledStart,
    }));

    await botSessionService.createInventorySelectionSession({
      employeeId: input.employeeId,
      phoneNumber: input.phoneFrom,
      options,
    });

    console.info("[whatsapp-bot] session created WAITING_INVENTORY_SELECTION", {
      employeeId: input.employeeId,
      options: options.length,
    });

    return respond({
      message: buildInventorySelectionPrompt(inventories),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  },

  async handleInventorySelection(input: {
    session: BotSession;
    body: string;
    employeeId: string;
    phoneFrom: string;
    phoneTo: string;
  }): Promise<string> {
    const selection = parseInventorySelection(input.body);
    const context = botSessionService.parseContext(input.session.contextJson);
    const options = context.inventoryOptions ?? [];

    if (!selection || selection > options.length) {
      return respond({
        message: INVALID_SELECTION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const selected = options[selection - 1];
    const now = new Date();
    const compatible = await findCompatibleInventory(
      input.employeeId,
      selected.inventoryId,
      now,
    );

    if (!compatible) {
      return respond({
        message: NO_INVENTORY_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const selectionResult = await botSessionService.selectInventoryAndRenewExpiration(
      input.session.id,
      compatible.id,
    );

    if (selectionResult.kind === "expired") {
      return respond({
        message: EXPIRED_SESSION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (selectionResult.kind !== "ok") {
      return respond({
        message: INVALID_SELECTION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    return respond({
      message: buildInventoryPrompt(compatible),
      employeeId: input.employeeId,
      phoneFrom: input.phoneTo,
      phoneTo: input.phoneFrom,
    });
  },

  async handleLocationMessage(input: {
    payload: TwilioWebhookInput;
    phoneFrom: string;
    phoneTo: string;
    employeeId: string | null;
  }): Promise<string> {
    if (!input.employeeId) {
      return respond({
        message: UNKNOWN_EMPLOYEE_MESSAGE,
        employeeId: null,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const { activeSession: session, recentlyExpired } =
      await botSessionService.getSessionResolutionByPhone(input.phoneFrom);

    if (!session) {
      return respond({
        message: recentlyExpired ? EXPIRED_SESSION_MESSAGE : LOCATION_WITHOUT_SESSION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (session.state === "WAITING_INVENTORY_SELECTION") {
      return respond({
        message: LOCATION_DURING_SELECTION_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (session.state === "WAITING_CHECKOUT_INVENTORY_SELECTION") {
      return respond({
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
          return respond({
            message:
              "Las coordenadas recibidas no son válidas. Volvé a compartir tu ubicación actual.",
            employeeId: input.employeeId,
            phoneFrom: input.phoneTo,
            phoneTo: input.phoneFrom,
          });
        }

        console.error("[whatsapp-bot] unexpected checkout location processing error", error);
        return respond({
          message: GENERIC_ERROR_MESSAGE,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }
    }

    if (session.state !== "WAITING_LOCATION" || !session.inventoryId) {
      return respond({
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
        return respond({
          message: "Las coordenadas recibidas no son válidas. Volvé a compartir tu ubicación actual.",
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      console.error("[whatsapp-bot] unexpected location processing error", error);
      return respond({
        message: GENERIC_ERROR_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }
  },

  async processLocationCheckIn(input: {
    session: BotSession;
    employeeId: string;
    inventoryId: string;
    latitude: number;
    longitude: number;
    messageSid: string;
    phoneFrom: string;
    phoneTo: string;
  }): Promise<string> {
    const receivedAt = new Date();
    const compatible = await findCompatibleInventory(
      input.employeeId,
      input.inventoryId,
      receivedAt,
    );

    if (!compatible) {
      return respond({
        message: NO_INVENTORY_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const isAssigned = await inventoryEmployeeRepository.exists(
      input.inventoryId,
      input.employeeId,
    );
    if (!isAssigned) {
      return respond({
        message: NO_INVENTORY_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const hasActiveRecord = await attendanceRepository.hasActiveRecord(
      input.inventoryId,
      input.employeeId,
    );
    if (hasActiveRecord) {
      await botSessionService.completeSession(input.session.id);
      return respond({
        message: DUPLICATE_ATTENDANCE_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const geo = geolocationService.evaluateDistance(
      input.latitude,
      input.longitude,
      compatible.storeLatitude,
      compatible.storeLongitude,
      compatible.allowedRadiusMeters,
    );

    const time = evaluatePunctuality(
      receivedAt,
      new Date(compatible.scheduledStart),
      compatible.earlyToleranceMinutes,
      compatible.lateToleranceMinutes,
      env.BOT_ON_TIME_GRACE_MINUTES,
    );

    const validation = combineAttendanceValidation(geo, time);
    const pool = getPool();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      const activeSession = await botSessionRepository.findValidActiveById(
        input.session.id,
        transaction,
      );

      if (!activeSession || activeSession.state !== "WAITING_LOCATION") {
        await transaction.rollback();
        await botSessionService.getActiveSessionByPhone(input.phoneFrom);
        console.info("[whatsapp-bot] location received for expired or invalid session", {
          sessionId: input.session.id,
        });
        return respond({
          message: EXPIRED_SESSION_MESSAGE,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      const duplicateInTx = await new sql.Request(transaction)
        .input("inventoryId", sql.UniqueIdentifier, input.inventoryId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .query(`
          SELECT TOP 1 1 AS found
          FROM attendance_records WITH (UPDLOCK, HOLDLOCK)
          WHERE inventory_id = @inventoryId
            AND employee_id = @employeeId
            AND validation_status IN ('VALID', 'PENDING_REVIEW')
        `);

      if (duplicateInTx.recordset[0]) {
        await transaction.rollback();
        await botSessionService.completeSession(input.session.id);
        return respond({
          message: DUPLICATE_ATTENDANCE_MESSAGE,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      await attendanceRepository.createInTransaction(transaction, {
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
      });

      await botSessionRepository.updateSession(
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

      const responseMessage = this.buildCheckInResponse({
        compatible,
        distanceMeters: geo.distanceMeters,
        validationStatus: validation.validationStatus,
        punctualityStatus: validation.punctualityStatus,
        validationReason: validation.validationReason,
        receivedAt,
      });

      return respond({
        message: responseMessage,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    } catch (error) {
      await transaction.rollback();

      if (error instanceof Error) {
        if (error.message.includes("UQ_attendance_records_source_message_sid")) {
          await botSessionService.completeSession(input.session.id);
          return respond({
            message: DUPLICATE_ATTENDANCE_MESSAGE,
            employeeId: input.employeeId,
            phoneFrom: input.phoneTo,
            phoneTo: input.phoneFrom,
          });
        }

        if (error.message.includes("UX_attendance_records_inventory_employee_active")) {
          await botSessionService.completeSession(input.session.id);
          return respond({
            message: DUPLICATE_ATTENDANCE_MESSAGE,
            employeeId: input.employeeId,
            phoneFrom: input.phoneTo,
            phoneTo: input.phoneFrom,
          });
        }
      }

      console.error("[whatsapp-bot] transaction failed", error);
      return respond({
        message: GENERIC_ERROR_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }
  },

  buildCheckInResponse(input: {
    compatible: CompatibleInventory;
    distanceMeters: number;
    validationStatus: "VALID" | "PENDING_REVIEW" | "REJECTED";
    punctualityStatus: import("../types/domain").PunctualityStatus;
    validationReason: string;
    receivedAt: Date;
  }): string {
    const localTime = formatLocalTime(input.receivedAt.toISOString(), env.BOT_OPERATION_TIMEZONE);
    const roundedDistance = Math.round(input.distanceMeters);

    if (input.validationStatus === "REJECTED") {
      return `❌ No pudimos validar tu llegada.\n\nMotivo: ${input.validationReason}\nContactá a tu supervisor si considerás que existe un error.`;
    }

    if (input.validationStatus === "VALID") {
      const headline =
        input.punctualityStatus === "LATE"
          ? "Tu llegada fue registrada como tarde."
          : "Tu llegada fue registrada correctamente.";
      return `${headline}\n\nTienda: ${input.compatible.storeName}\nLlegada: ${localTime}\nDistancia: ${roundedDistance} m\n\n${CHECKOUT_REMINDER}`;
    }

    return `Tu llegada fue registrada, pero quedó pendiente de revisión.\n\nTienda: ${input.compatible.storeName}\nLlegada: ${localTime}\nDistancia: ${roundedDistance} m\n\n${CHECKOUT_REMINDER}`;
  },

  async processLocationCheckout(input: {
    session: BotSession;
    employeeId: string;
    inventoryId: string;
    latitude: number;
    longitude: number;
    messageSid: string;
    phoneFrom: string;
    phoneTo: string;
  }): Promise<string> {
    const checkoutAt = new Date();
    const eligible = await findCheckoutEligibleInventory(input.employeeId, input.inventoryId);

    if (!eligible) {
      return respond({
        message: NO_CHECK_IN_FOR_CHECKOUT_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const attendance = await attendanceRepository.findCheckInForCheckout(
      input.inventoryId,
      input.employeeId,
    );

    if (!attendance) {
      return respond({
        message: NO_CHECK_IN_FOR_CHECKOUT_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    if (attendance.checkoutAt) {
      await botSessionService.completeSession(input.session.id);
      const checkoutTime = formatLocalTime(attendance.checkoutAt, env.BOT_OPERATION_TIMEZONE);
      return respond({
        message: `${DUPLICATE_CHECKOUT_MESSAGE}\nHora registrada: ${checkoutTime}.`,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }

    const geo = geolocationService.evaluateDistance(
      input.latitude,
      input.longitude,
      eligible.storeLatitude,
      eligible.storeLongitude,
      eligible.allowedRadiusMeters,
    );

    const geoEvaluation = evaluateGeofence(
      geo.distanceMeters,
      eligible.allowedRadiusMeters,
      env.BOT_GEOFENCE_REVIEW_MARGIN_METERS,
    );

    const timeEvaluation = evaluateCheckoutTime(
      checkoutAt,
      eligible.scheduledEnd ? new Date(eligible.scheduledEnd) : null,
      env.BOT_CHECKOUT_EARLY_TOLERANCE_MINUTES,
    );

    const validation = combineCheckoutValidation(geoEvaluation, timeEvaluation);
    const pool = getPool();
    const transaction = new sql.Transaction(pool);

    try {
      await transaction.begin();

      const activeSession = await botSessionRepository.findValidActiveById(
        input.session.id,
        transaction,
      );

      if (!activeSession || activeSession.state !== "WAITING_CHECKOUT_LOCATION") {
        await transaction.rollback();
        return respond({
          message: EXPIRED_SESSION_MESSAGE,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      const updated = await attendanceRepository.registerCheckoutInTransaction(transaction, {
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
        await botSessionService.completeSession(input.session.id);
        return respond({
          message: DUPLICATE_CHECKOUT_MESSAGE,
          employeeId: input.employeeId,
          phoneFrom: input.phoneTo,
          phoneTo: input.phoneFrom,
        });
      }

      await botSessionRepository.updateSession(
        input.session.id,
        { state: "COMPLETED" },
        transaction,
      );

      await transaction.commit();

      const responseMessage = this.buildCheckoutResponse({
        eligible,
        checkInAt: attendance.receivedAt,
        checkoutAt,
        distanceMeters: updated.checkoutDistanceMeters ?? 0,
        checkoutStatus: validation.checkoutStatus,
        extraWorkedMinutes: validation.extraWorkedMinutes,
      });

      return respond({
        message: responseMessage,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    } catch (error) {
      await transaction.rollback();

      if (error instanceof Error) {
        if (error.message.includes("UQ_attendance_records_checkout_message_sid")) {
          await botSessionService.completeSession(input.session.id);
          return respond({
            message: DUPLICATE_CHECKOUT_MESSAGE,
            employeeId: input.employeeId,
            phoneFrom: input.phoneTo,
            phoneTo: input.phoneFrom,
          });
        }
      }

      console.error("[whatsapp-bot] checkout transaction failed", error);
      return respond({
        message: GENERIC_ERROR_MESSAGE,
        employeeId: input.employeeId,
        phoneFrom: input.phoneTo,
        phoneTo: input.phoneFrom,
      });
    }
  },

  buildCheckoutResponse(input: {
    eligible: CheckoutEligibleInventory;
    checkInAt: string;
    checkoutAt: Date;
    distanceMeters: number;
    checkoutStatus: import("../constants/checkout-status").CheckoutStatus;
    extraWorkedMinutes: number;
  }): string {
    const arrivalTime = formatLocalTime(input.checkInAt, env.BOT_OPERATION_TIMEZONE);
    const departureTime = formatLocalTime(input.checkoutAt.toISOString(), env.BOT_OPERATION_TIMEZONE);
    const roundedDistance = Math.round(input.distanceMeters);
    const statusLabel = checkoutStatusLabel(input.checkoutStatus);

    if (input.checkoutStatus === "CHECKOUT_REJECTED") {
      return `❌ No pudimos registrar tu salida.\n\nMotivo: ubicación fuera del radio permitido.\nContactá a tu supervisor si considerás que existe un error.`;
    }

    if (
      input.checkoutStatus === "CHECKOUT_LOCATION_REVIEW" ||
      input.checkoutStatus === "CHECKOUT_EARLY_REVIEW"
    ) {
      const reason =
        input.checkoutStatus === "CHECKOUT_LOCATION_REVIEW"
          ? "estás fuera del radio permitido"
          : "saliste antes del horario previsto";
      return `Tu salida fue registrada, pero quedó pendiente de revisión porque ${reason}.\n\nTienda: ${input.eligible.storeName}\nLlegada: ${arrivalTime}\nSalida: ${departureTime}\nDistancia: ${roundedDistance} m\nEstado: ${statusLabel}`;
    }

    let message = `Tu salida fue registrada correctamente.\n\nTienda: ${input.eligible.storeName}\nLlegada: ${arrivalTime}\nSalida: ${departureTime}\nDistancia: ${roundedDistance} m\nEstado: ${statusLabel}`;

    if (input.checkoutStatus === "CHECKOUT_LATE_EXTRA_TIME" && input.extraWorkedMinutes > 0) {
      message += `\nTiempo extra: ${input.extraWorkedMinutes} min`;
    }

    return message;
  },
};

export const isInventoryCompatibleAt = isWithinInventoryWindow;
