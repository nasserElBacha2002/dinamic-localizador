import { AsyncLocalStorage } from "node:async_hooks";
import type { WhatsAppQuotaPolicy } from "../types/whatsapp-usage-quota";

export type WhatsAppQuotaTurnScope = {
  companyId: string;
  employeeId: string;
  messageSid: string;
  /** When true, non-critical outbounds must reserve units. */
  enforceOutbounds: boolean;
  /** Shadow mode evaluates would-block without mutating counters. */
  shadowOutbounds: boolean;
  /** Reuse turn policy snapshot — avoid repeated company_settings reads. */
  policySnapshot?: WhatsAppQuotaPolicy;
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
