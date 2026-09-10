/**
 * Monetary amounts as decimal strings to avoid IEEE-754 drift.
 * Provider precision is preserved; presentation rounding is separate.
 */

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

export const isDecimalString = (value: string): boolean => DECIMAL_RE.test(value.trim());

export const normalizeDecimalString = (value: string | number | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const raw = typeof value === "number" ? value.toFixed(6) : String(value).trim();
  if (!raw || !isDecimalString(raw)) {
    return null;
  }
  if (!raw.includes(".")) {
    return raw;
  }
  const normalized = raw.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  return normalized === "-0" ? "0" : normalized;
};

/** Absolute value as decimal string (Twilio charges are often negative). */
export const absDecimalString = (value: string): string => {
  const normalized = normalizeDecimalString(value);
  if (!normalized) {
    return "0";
  }
  return normalized.startsWith("-") ? normalized.slice(1) : normalized;
};
