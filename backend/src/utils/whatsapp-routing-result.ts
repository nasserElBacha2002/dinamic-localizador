import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Authoritative inbound routing outcome for the current webhook turn.
 * Independent of WhatsApp observability traces (works when observability is off).
 */
export type WhatsAppRoutingResult = {
  flowType?: string | null;
  resultCode?: string | null;
  relatedOperationId?: string | null;
  relatedSessionId?: string | null;
};

const routingResultStorage = new AsyncLocalStorage<WhatsAppRoutingResult>();

export function runWithRoutingResultScope<T>(callback: () => Promise<T>): Promise<T> {
  return routingResultStorage.run({}, callback);
}

export function setRoutingResult(partial: WhatsAppRoutingResult): void {
  const store = routingResultStorage.getStore();
  if (!store) {
    return;
  }
  Object.assign(store, partial);
}

export function getRoutingResult(): WhatsAppRoutingResult | null {
  return routingResultStorage.getStore() ?? null;
}
