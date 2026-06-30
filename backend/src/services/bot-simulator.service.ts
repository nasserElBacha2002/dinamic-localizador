import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { botSimulationSessionRepository } from "../repositories/bot-simulation-session.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { inventoryRepository } from "../repositories/inventory.repository";
import { storeRepository } from "../repositories/store.repository";
import { botSessionRepository } from "../repositories/bot-session.repository";
import type {
  CreateBotSimulationSessionInput,
  SendBotSimulationLocationInput,
  SendBotSimulationMessageInput,
} from "../schemas/bot-simulator.schema";
import type { TwilioWebhookInput } from "../schemas/twilio-webhook.schema";
import type { BotSimulationSessionState } from "../types/bot-simulator.types";
import {
  type BotRuntimeContext,
  type BotSimulatorMessage,
  runWithBotRuntimeContext,
} from "../utils/bot-runtime-context";
import { normalizeWhatsAppPhone } from "../utils/phone";
import { extractMessageFromTwiml } from "../utils/twiml-message";
import { whatsappBotService } from "./whatsapp-bot.service";
import { botSessionService } from "./bot-session.service";
import { geolocationService } from "./geolocation.service";
import { evaluateGeofence } from "../utils/attendance-validation";

const SIMULATION_GREETING =
  "Sesión de simulación iniciada. Escribí un mensaje o usá las acciones rápidas para probar el bot.";

function buildRuntimeContext(session: {
  id: string;
  employeeId: string;
  phoneNumber: string;
  simulatedNow: string;
  mode: "dry-run" | "persistent";
  messages: BotSimulatorMessage[];
  technicalDetails: Record<string, unknown>;
}): BotRuntimeContext {
  return {
    simulationSessionId: session.id,
    employeeIdOverride: session.employeeId,
    phoneNumber: session.phoneNumber,
    simulatedNow: new Date(session.simulatedNow),
    mode: session.mode,
    skipWhatsAppPersistence: true,
    messages: [...session.messages],
    technicalDetails: { ...session.technicalDetails },
    simulationArtifacts: [],
    virtualAttendanceRecords: [],
    lastBotResponse: null,
    lastDetectedIntent: null,
    lastTwilioPayload: null,
  };
}

function hydrateRuntimeArtifacts(
  context: BotRuntimeContext,
  technicalDetails: Record<string, unknown>,
): void {
  context.simulationArtifacts =
    (technicalDetails.simulationArtifacts as Array<Record<string, unknown>> | undefined) ??
    (technicalDetails.createdRecords as Array<Record<string, unknown>> | undefined) ??
    [];
  context.virtualAttendanceRecords =
    (technicalDetails.virtualAttendanceRecords as BotRuntimeContext["virtualAttendanceRecords"] | undefined) ??
    [];
}

async function persistRuntimeState(sessionId: string, context: BotRuntimeContext): Promise<void> {
  await botSimulationSessionRepository.updateConversation(sessionId, {
    messages: context.messages,
    technicalDetails: {
      ...context.technicalDetails,
      simulationArtifacts: context.simulationArtifacts,
      createdRecords: context.simulationArtifacts,
      virtualAttendanceRecords: context.virtualAttendanceRecords,
      lastBotResponse: context.lastBotResponse,
      lastDetectedIntent: context.lastDetectedIntent,
      lastTwilioPayload: context.lastTwilioPayload,
    },
  });
}

async function clearBotSessionsForPhone(
  phoneNumber: string,
  employeeId: string,
  simulationSessionId: string,
): Promise<void> {
  const scope = { mode: "simulation" as const, simulationSessionId };
  await botSessionRepository.cancelValidActiveSessions(employeeId, phoneNumber, undefined, scope);
  await botSessionRepository.expireStaleSessionsForParticipant(employeeId, phoneNumber, undefined, scope);
}

function buildTwilioPayload(input: {
  messageSid: string;
  phoneNumber: string;
  body?: string;
  latitude?: number;
  longitude?: number;
}): TwilioWebhookInput {
  const botNumber = env.TWILIO_WHATSAPP_NUMBER ?? "whatsapp:+10000000000";
  return {
    MessageSid: input.messageSid,
    From: input.phoneNumber.startsWith("whatsapp:") ? input.phoneNumber : `whatsapp:${input.phoneNumber}`,
    To: botNumber.startsWith("whatsapp:") ? botNumber : `whatsapp:${botNumber}`,
    Body: input.body,
    Latitude: input.latitude !== undefined ? String(input.latitude) : undefined,
    Longitude: input.longitude !== undefined ? String(input.longitude) : undefined,
  };
}

function deriveStatusBadges(
  technicalDetails: Record<string, unknown>,
  mode: "dry-run" | "persistent",
): string[] {
  const badges: string[] = [];
  badges.push(mode === "dry-run" ? "Dry-run" : "Persistent");

  const currentNode = technicalDetails.currentNode;
  if (typeof currentNode === "string") {
    if (currentNode.includes("WAITING_LOCATION")) {
      badges.push("Waiting for location");
    }
    if (currentNode.includes("WAITING_CHECKOUT_LOCATION")) {
      badges.push("Waiting for location");
    }
    if (currentNode === "COMPLETED") {
      badges.push("Active session");
    }
  }

  const locationValidation = technicalDetails.locationValidation as
    | { validationStatus?: string }
    | undefined;
  if (locationValidation?.validationStatus === "PENDING_REVIEW") {
    badges.push("Requires review");
  }
  if (locationValidation?.validationStatus === "VALID") {
    badges.push("Arrival registered");
  }

  const checkoutValidation = technicalDetails.checkoutValidation as
    | { checkoutStatus?: string }
    | undefined;
  if (checkoutValidation?.checkoutStatus?.includes("CHECKOUT")) {
    badges.push("Departure registered");
  }

  if (technicalDetails.error) {
    badges.push("Error");
  }

  return badges;
}

async function buildSessionState(
  sessionId: string,
  context: BotRuntimeContext,
): Promise<BotSimulationSessionState> {
  const activeSession = await botSessionService.getActiveSessionByPhone(context.phoneNumber);

  if (activeSession) {
    context.technicalDetails.currentFlow = "whatsapp-bot";
    context.technicalDetails.currentNode = activeSession.state;
    context.technicalDetails.sessionId = sessionId;
    context.technicalDetails.simulationMode = context.mode;
  }

  return {
    sessionId,
    messages: context.messages,
    currentFlow: (context.technicalDetails.currentFlow as string | null) ?? null,
    currentNode: (context.technicalDetails.currentNode as string | null) ?? activeSession?.state ?? null,
    technicalDetails: {
      ...context.technicalDetails,
      simulationArtifacts: context.simulationArtifacts,
      createdRecords: context.simulationArtifacts,
      virtualAttendanceRecords: context.virtualAttendanceRecords,
    },
    createdRecords: context.simulationArtifacts,
    mode: context.mode,
    statusBadges: deriveStatusBadges(context.technicalDetails, context.mode),
  };
}

export const botSimulatorService = {
  async createSession(
    input: CreateBotSimulationSessionInput,
    createdBy?: string | null,
  ): Promise<BotSimulationSessionState> {
    const employee = await employeeRepository.findById(input.employeeId);
    if (!employee || !employee.active) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado o inactivo.");
    }

    let storeId = input.storeId ?? null;
    if (input.inventoryId) {
      const inventory = await inventoryRepository.findById(input.inventoryId);
      if (!inventory) {
        throw new AppError(404, "INVENTORY_NOT_FOUND", "Inventario no encontrado.");
      }
      storeId = inventory.storeId;
    }

    if (storeId) {
      const store = await storeRepository.findById(storeId);
      if (!store) {
        throw new AppError(404, "STORE_NOT_FOUND", "Tienda no encontrada.");
      }
    }

    const phoneNumber = normalizeWhatsAppPhone(input.phoneNumber);

    const session = await botSimulationSessionRepository.create({
      companyId: input.companyId ?? null,
      employeeId: employee.id,
      inventoryId: input.inventoryId ?? null,
      storeId,
      phoneNumber,
      simulatedNow: input.simulatedNow,
      mode: input.mode,
      createdBy: createdBy ?? null,
    });

    await clearBotSessionsForPhone(phoneNumber, employee.id, session.id);

    const context = buildRuntimeContext({
      id: session.id,
      employeeId: session.employeeId,
      phoneNumber: session.phoneNumber,
      simulatedNow: session.simulatedNow,
      mode: session.mode,
      messages: [],
      technicalDetails: {
        sessionId: session.id,
        companyId: session.companyId,
        employeeId: employee.id,
        employeeName: employee.name,
        inventoryId: session.inventoryId,
        storeId: session.storeId,
        phoneNumber: session.phoneNumber,
        simulationMode: session.mode,
      },
    });

    context.messages.push({
      id: randomUUID(),
      direction: "OUTBOUND",
      messageType: "TEXT",
      body: SIMULATION_GREETING,
      latitude: null,
      longitude: null,
      createdAt: context.simulatedNow.toISOString(),
    });

    await persistRuntimeState(session.id, context);
    return buildSessionState(session.id, context);
  },

  async getSession(sessionId: string): Promise<BotSimulationSessionState> {
    const session = await botSimulationSessionRepository.findById(sessionId);
    if (!session) {
      throw new AppError(404, "SIMULATION_SESSION_NOT_FOUND", "Sesión de simulación no encontrada.");
    }

    const context = buildRuntimeContext({
      id: session.id,
      employeeId: session.employeeId,
      phoneNumber: session.phoneNumber,
      simulatedNow: session.simulatedNow,
      mode: session.mode,
      messages: session.messages,
      technicalDetails: session.technicalDetails,
    });
    hydrateRuntimeArtifacts(context, session.technicalDetails);

    return buildSessionState(session.id, context);
  },

  async restartSession(sessionId: string): Promise<BotSimulationSessionState> {
    const session = await botSimulationSessionRepository.findById(sessionId);
    if (!session) {
      throw new AppError(404, "SIMULATION_SESSION_NOT_FOUND", "Sesión de simulación no encontrada.");
    }

    await clearBotSessionsForPhone(session.phoneNumber, session.employeeId, session.id);
    await botSimulationSessionRepository.resetConversation(sessionId);

    const context = buildRuntimeContext({
      id: session.id,
      employeeId: session.employeeId,
      phoneNumber: session.phoneNumber,
      simulatedNow: session.simulatedNow,
      mode: session.mode,
      messages: [],
      technicalDetails: {
        sessionId: session.id,
        companyId: session.companyId,
        employeeId: session.employeeId,
        inventoryId: session.inventoryId,
        storeId: session.storeId,
        phoneNumber: session.phoneNumber,
        simulationMode: session.mode,
      },
    });

    context.messages.push({
      id: randomUUID(),
      direction: "OUTBOUND",
      messageType: "TEXT",
      body: SIMULATION_GREETING,
      latitude: null,
      longitude: null,
      createdAt: context.simulatedNow.toISOString(),
    });

    await persistRuntimeState(session.id, context);
    return buildSessionState(session.id, context);
  },

  async sendMessage(input: SendBotSimulationMessageInput): Promise<BotSimulationSessionState> {
    const session = await botSimulationSessionRepository.findById(input.sessionId);
    if (!session) {
      throw new AppError(404, "SIMULATION_SESSION_NOT_FOUND", "Sesión de simulación no encontrada.");
    }

    const context = buildRuntimeContext({
      id: session.id,
      employeeId: session.employeeId,
      phoneNumber: session.phoneNumber,
      simulatedNow: session.simulatedNow,
      mode: session.mode,
      messages: session.messages,
      technicalDetails: session.technicalDetails,
    });
    hydrateRuntimeArtifacts(context, session.technicalDetails);

    const messageSid = `SIM-${randomUUID()}`;
    const payload = buildTwilioPayload({
      messageSid,
      phoneNumber: session.phoneNumber,
      body: input.text,
    });

    await runWithBotRuntimeContext(context, async () => {
      const twiml = await whatsappBotService.handleWebhook(payload);
      const outbound = extractMessageFromTwiml(twiml);
      if (!context.messages.some((message) => message.id === `SIM-OUT-${messageSid}`)) {
        context.messages.push({
          id: `SIM-OUT-${messageSid}`,
          direction: "OUTBOUND",
          messageType: "TEXT",
          body: outbound,
          latitude: null,
          longitude: null,
          createdAt: context.simulatedNow.toISOString(),
        });
      }
      context.technicalDetails.generatedBotResponse = outbound;
    });

    await persistRuntimeState(session.id, context);
    return buildSessionState(session.id, context);
  },

  async sendLocation(input: SendBotSimulationLocationInput): Promise<BotSimulationSessionState> {
    const session = await botSimulationSessionRepository.findById(input.sessionId);
    if (!session) {
      throw new AppError(404, "SIMULATION_SESSION_NOT_FOUND", "Sesión de simulación no encontrada.");
    }

    const context = buildRuntimeContext({
      id: session.id,
      employeeId: session.employeeId,
      phoneNumber: session.phoneNumber,
      simulatedNow: session.simulatedNow,
      mode: session.mode,
      messages: session.messages,
      technicalDetails: session.technicalDetails,
    });
    hydrateRuntimeArtifacts(context, session.technicalDetails);

    const messageSid = `SIM-LOC-${randomUUID()}`;
    const payload = buildTwilioPayload({
      messageSid,
      phoneNumber: session.phoneNumber,
      latitude: input.latitude,
      longitude: input.longitude,
    });

    await runWithBotRuntimeContext(context, async () => {
      if (session.storeId) {
        const store = await storeRepository.findById(session.storeId);
        if (store) {
          const geo = geolocationService.evaluateDistance(
            input.latitude,
            input.longitude,
            store.latitude,
            store.longitude,
            store.allowedRadiusMeters,
          );
          const geoEvaluation = evaluateGeofence(
            geo.distanceMeters,
            store.allowedRadiusMeters,
            env.BOT_GEOFENCE_REVIEW_MARGIN_METERS,
          );
          context.technicalDetails.calculatedDistance = Math.round(geo.distanceMeters * 100) / 100;
          context.technicalDetails.allowedRadius = store.allowedRadiusMeters;
          context.technicalDetails.reviewMargin = env.BOT_GEOFENCE_REVIEW_MARGIN_METERS;
          context.technicalDetails.expectedResult = geoEvaluation.geoValidationStatus;
        }
      }

      const twiml = await whatsappBotService.handleWebhook(payload);
      const outbound = extractMessageFromTwiml(twiml);
      if (!context.messages.some((message) => message.id === `SIM-OUT-${messageSid}`)) {
        context.messages.push({
          id: `SIM-OUT-${messageSid}`,
          direction: "OUTBOUND",
          messageType: "TEXT",
          body: outbound,
          latitude: null,
          longitude: null,
          createdAt: context.simulatedNow.toISOString(),
        });
      }
      context.technicalDetails.generatedBotResponse = outbound;
    });

    await persistRuntimeState(session.id, context);
    return buildSessionState(session.id, context);
  },

  async getLocationPresets(sessionId: string): Promise<{
    storeLocation: { latitude: number; longitude: number } | null;
    outsideRadius: { latitude: number; longitude: number } | null;
    nearRadiusLimit: { latitude: number; longitude: number } | null;
    allowedRadiusMeters: number | null;
    reviewMarginMeters: number;
  }> {
    const session = await botSimulationSessionRepository.findById(sessionId);
    if (!session?.storeId) {
      return {
        storeLocation: null,
        outsideRadius: null,
        nearRadiusLimit: null,
        allowedRadiusMeters: null,
        reviewMarginMeters: env.BOT_GEOFENCE_REVIEW_MARGIN_METERS,
      };
    }

    const store = await storeRepository.findById(session.storeId);
    if (!store) {
      return {
        storeLocation: null,
        outsideRadius: null,
        nearRadiusLimit: null,
        allowedRadiusMeters: null,
        reviewMarginMeters: env.BOT_GEOFENCE_REVIEW_MARGIN_METERS,
      };
    }

    const radius = store.allowedRadiusMeters;
    const margin = env.BOT_GEOFENCE_REVIEW_MARGIN_METERS;
    const outsideOffset = (radius + margin + 50) / 111_320;
    const nearOffset = (radius + Math.max(1, margin - 5)) / 111_320;

    return {
      storeLocation: { latitude: store.latitude, longitude: store.longitude },
      outsideRadius: {
        latitude: store.latitude + outsideOffset,
        longitude: store.longitude,
      },
      nearRadiusLimit: {
        latitude: store.latitude + nearOffset,
        longitude: store.longitude,
      },
      allowedRadiusMeters: radius,
      reviewMarginMeters: margin,
    };
  },
};
