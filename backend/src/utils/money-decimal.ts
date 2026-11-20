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

/** Sum non-negative decimal strings without floating-point drift. */
export const sumDecimalStrings = (values: string[]): string => {
  const totalMicros = values.reduce((acc, raw) => {
    const normalized = normalizeDecimalString(raw) ?? "0";
    const negative = normalized.startsWith("-");
    const body = negative ? normalized.slice(1) : normalized;
    const [whole, frac = ""] = body.split(".");
    const padded = `${frac}000000`.slice(0, 6);
    const micros = BigInt(whole) * 1_000_000n + BigInt(padded || "0");
    return negative ? acc - micros : acc + micros;
  }, 0n);
  const sign = totalMicros < 0n ? "-" : "";
  const abs = totalMicros < 0n ? -totalMicros : totalMicros;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  if (!frac) {
    return `${sign}${whole.toString()}`;
  }
  return `${sign}${whole.toString()}.${frac}`;
};
