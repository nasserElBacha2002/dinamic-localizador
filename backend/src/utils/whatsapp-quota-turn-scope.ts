import { AsyncLocalStorage } from "node:async_hooks";

export type WhatsAppQuotaTurnScope = {
  companyId: string;
  employeeId: string;
  messageSid: string;
  /** When true, non-critical outbounds must reserve units. */
  enforceOutbounds: boolean;
  /** Shadow mode records would-block without reserving. */
  shadowOutbounds: boolean;
};

const quotaTurnStorage = new AsyncLocalStorage<WhatsAppQuotaTurnScope>();

export function runWithQuotaTurnScope<T>(
  scope: WhatsAppQuotaTurnScope,
  callback: () => Promise<T>,
): Promise<T> {
  return quotaTurnStorage.run(scope, callback);
}

export function getQuotaTurnScope(): WhatsAppQuotaTurnScope | null {
  return quotaTurnStorage.getStore() ?? null;
}
