import { normalizeIntentText } from "./intent";

const PAYROLL_RECEIPT_KEYWORDS = [
  "mi recibo",
  "mis recibos",
  "recibo",
  "recibo de sueldo",
  "consultar recibo",
  "ver recibo",
] as const;

/**
 * Detects payroll receipt conversational query intents (accent-normalized).
 */
export const isPayrollReceiptIntent = (body: string): boolean => {
  const normalized = normalizeIntentText(body);
  return PAYROLL_RECEIPT_KEYWORDS.some(
    (keyword) => normalized === keyword || normalized.startsWith(`${keyword} `),
  );
};
