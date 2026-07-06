import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

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

export type VirtualAttendanceRecord = {
  id: string;
  operationId: string;
  employeeId: string;
  receivedAt: string;
  validationStatus: string;
  locationStatus: string;
  punctualityStatus: string;
  distanceMeters: number;
  checkoutAt: string | null;
  checkoutStatus: string | null;
};

export type BotRuntimeContext = {
  simulationSessionId: string;
  employeeIdOverride: string;
  phoneNumber: string;
  simulatedNow: Date;
  mode: BotSimulationMode;
  skipWhatsAppPersistence: boolean;
  messages: BotSimulatorMessage[];
  technicalDetails: Record<string, unknown>;
  simulationArtifacts: Array<Record<string, unknown>>;
  virtualAttendanceRecords: VirtualAttendanceRecord[];
  lastBotResponse: string | null;
  lastDetectedIntent: string | null;
  lastTwilioPayload: Record<string, string> | null;
};

const botRuntimeContext = new AsyncLocalStorage<BotRuntimeContext>();

export function runWithBotRuntimeContext<T>(
  context: BotRuntimeContext,
  callback: () => Promise<T>,
): Promise<T> {
  return botRuntimeContext.run(context, callback);
}

export function getBotRuntimeContext(): BotRuntimeContext | undefined {
  return botRuntimeContext.getStore();
}

export function getBotNow(): Date {
  return getBotRuntimeContext()?.simulatedNow ?? new Date();
}

export function isSimulationDryRun(): boolean {
  return getBotRuntimeContext()?.mode === "dry-run";
}

export function isSimulationActive(): boolean {
  return Boolean(getBotRuntimeContext()?.skipWhatsAppPersistence);
}

export function getSimulationSessionId(): string | null {
  return getBotRuntimeContext()?.simulationSessionId ?? null;
}

export function appendSimulatorMessage(message: BotSimulatorMessage): void {
  const context = getBotRuntimeContext();
  if (!context) {
    return;
  }

  context.messages.push(message);
}

export function setTechnicalDetail(key: string, value: unknown): void {
  const context = getBotRuntimeContext();
  if (!context) {
    return;
  }

  context.technicalDetails[key] = value;
}

export function recordSimulationArtifact(record: Record<string, unknown>): void {
  const context = getBotRuntimeContext();
  if (!context) {
    return;
  }

  context.simulationArtifacts.push(record);
  context.technicalDetails.simulationArtifacts = context.simulationArtifacts;
}

/** @deprecated Use recordSimulationArtifact */
export function recordWouldCreateAttendance(record: Record<string, unknown>): void {
  recordSimulationArtifact(record);
}

export function addVirtualCheckIn(record: Omit<VirtualAttendanceRecord, "id" | "checkoutAt" | "checkoutStatus">): VirtualAttendanceRecord {
  const context = getBotRuntimeContext();
  const virtualRecord: VirtualAttendanceRecord = {
    id: `virtual-${randomUUID()}`,
    checkoutAt: null,
    checkoutStatus: null,
    ...record,
  };

  if (context) {
    context.virtualAttendanceRecords.push(virtualRecord);
    context.technicalDetails.virtualAttendanceRecords = context.virtualAttendanceRecords;
  }

  return virtualRecord;
}

export function findVirtualCheckInForCheckout(
  operationId: string,
  employeeId: string,
): VirtualAttendanceRecord | null {
  const context = getBotRuntimeContext();
  if (!context) {
    return null;
  }

  return (
    [...context.virtualAttendanceRecords]
      .reverse()
      .find(
        (record) =>
          record.operationId === operationId &&
          record.employeeId === employeeId &&
          record.checkoutAt === null &&
          (record.validationStatus === "VALID" || record.validationStatus === "PENDING_REVIEW"),
      ) ?? null
  );
}

export function hasVirtualActiveRecord(operationId: string, employeeId: string): boolean {
  return findVirtualCheckInForCheckout(operationId, employeeId) !== null;
}

export function completeVirtualCheckOut(
  virtualId: string,
  input: { checkoutAt: string; checkoutStatus: string },
): VirtualAttendanceRecord | null {
  const context = getBotRuntimeContext();
  if (!context) {
    return null;
  }

  const record = context.virtualAttendanceRecords.find((item) => item.id === virtualId);
  if (!record) {
    return null;
  }

  record.checkoutAt = input.checkoutAt;
  record.checkoutStatus = input.checkoutStatus;
  context.technicalDetails.virtualAttendanceRecords = context.virtualAttendanceRecords;
  return record;
}

export function setLastDetectedIntent(intent: string): void {
  const context = getBotRuntimeContext();
  if (!context) {
    return;
  }

  context.lastDetectedIntent = intent;
}

export function setLastTwilioPayload(payload: Record<string, string>): void {
  const context = getBotRuntimeContext();
  if (!context) {
    return;
  }

  context.lastTwilioPayload = payload;
}

export function setLastBotResponse(message: string): void {
  const context = getBotRuntimeContext();
  if (!context) {
    return;
  }

  context.lastBotResponse = message;
}
