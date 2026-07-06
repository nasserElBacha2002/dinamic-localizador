import { scopedApiClient } from "./scoped-client";

export type BotSimulationMode = "dry-run" | "persistent";

export type BotSimulatorMessage = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  messageType: "TEXT" | "LOCATION";
  body: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
};

export type BotSimulationSessionState = {
  sessionId: string;
  messages: BotSimulatorMessage[];
  currentFlow: string | null;
  currentNode: string | null;
  technicalDetails: Record<string, unknown>;
  createdRecords: Array<Record<string, unknown>>;
  mode: BotSimulationMode;
  statusBadges: string[];
};

export type CreateBotSimulationSessionInput = {
  companyId?: string | null;
  employeeId: string;
  operationId?: string | null;
  serviceId?: string | null;
  phoneNumber: string;
  simulatedNow: string;
  mode: BotSimulationMode;
};

export type LocationPresets = {
  serviceLocation: { latitude: number; longitude: number } | null;
  outsideRadius: { latitude: number; longitude: number } | null;
  nearRadiusLimit: { latitude: number; longitude: number } | null;
  allowedRadiusMeters: number | null;
  reviewMarginMeters: number;
};

export async function createBotSimulationSession(
  input: CreateBotSimulationSessionInput,
): Promise<BotSimulationSessionState> {
  const { data } = await scopedApiClient.post<BotSimulationSessionState>(
    "bot-simulator/session",
    input,
  );
  return data;
}

export async function getBotSimulationSession(sessionId: string): Promise<BotSimulationSessionState> {
  const { data } = await scopedApiClient.get<BotSimulationSessionState>(
    `bot-simulator/session/${sessionId}`,
  );
  return data;
}

export async function restartBotSimulationSession(sessionId: string): Promise<BotSimulationSessionState> {
  const { data } = await scopedApiClient.post<BotSimulationSessionState>(
    `bot-simulator/session/${sessionId}/restart`,
  );
  return data;
}

export async function sendBotSimulationMessage(
  sessionId: string,
  text: string,
): Promise<BotSimulationSessionState> {
  const { data } = await scopedApiClient.post<BotSimulationSessionState>("bot-simulator/message", {
    sessionId,
    text,
  });
  return data;
}

export async function sendBotSimulationLocation(
  sessionId: string,
  latitude: number,
  longitude: number,
): Promise<BotSimulationSessionState> {
  const { data } = await scopedApiClient.post<BotSimulationSessionState>("bot-simulator/location", {
    sessionId,
    latitude,
    longitude,
  });
  return data;
}

export async function getBotSimulationLocationPresets(sessionId: string): Promise<LocationPresets> {
  const { data } = await scopedApiClient.get<LocationPresets>(
    `bot-simulator/session/${sessionId}/location-presets`,
  );
  return data;
}
