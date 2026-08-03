import { AsyncLocalStorage } from "node:async_hooks";
import type { WhatsappResultCode } from "../constants/whatsapp-observability";
import type { FlowTraceHandle } from "../services/whatsapp-flow-trace.service";

export interface BotFlowResultMeta {
  flowType?: string;
  resultCode?: WhatsappResultCode | string;
  relatedEntities?: {
    sessionId?: string | null;
    attendanceId?: string | null;
    operationId?: string | null;
    workdayId?: string | null;
    employeeId?: string | null;
  };
}

type ObservabilityScope = {
  trace: FlowTraceHandle;
  result?: BotFlowResultMeta;
};

const observabilityTraceStorage = new AsyncLocalStorage<ObservabilityScope>();

export function runWithObservabilityTrace<T>(
  trace: FlowTraceHandle,
  callback: () => Promise<T>,
): Promise<T> {
  return observabilityTraceStorage.run({ trace }, callback);
}

export function getObservabilityTrace(): FlowTraceHandle | null {
  return observabilityTraceStorage.getStore()?.trace ?? null;
}

export function setObservabilityFlowResult(result: BotFlowResultMeta): void {
  const store = observabilityTraceStorage.getStore();
  if (!store) {
    return;
  }
  store.result = { ...store.result, ...result };
}

export function getObservabilityFlowResult(): BotFlowResultMeta | null {
  return observabilityTraceStorage.getStore()?.result ?? null;
}
