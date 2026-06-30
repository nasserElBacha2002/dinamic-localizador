import type { BotSimulationMode, BotSimulatorMessage } from "../utils/bot-runtime-context";

export type BotSimulationSession = {
  id: string;
  companyId: string | null;
  employeeId: string;
  inventoryId: string | null;
  storeId: string | null;
  phoneNumber: string;
  simulatedNow: string;
  mode: BotSimulationMode;
  messages: BotSimulatorMessage[];
  technicalDetails: Record<string, unknown>;
  createdRecords: Array<Record<string, unknown>>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
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
