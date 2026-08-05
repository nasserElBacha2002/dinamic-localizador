export type PayrollReceiptPeriodParseResult =
  | { kind: "success"; year: number; month: number }
  | { kind: "not_a_period" }
  | { kind: "invalid_month" }
  | { kind: "invalid_year" }
  | { kind: "ambiguous" };

const PERIOD_TOKEN =
  /\b(\d{1,2})\s*[/\-.\s]\s*(\d{2}|\d{4})\b/g;

const looksLikePhoneOrCuil = (normalized: string): boolean => {
  const digits = normalized.replace(/\D/g, "");
  if (digits.length >= 8 && !/[/\-.]/.test(normalized)) {
    return true;
  }
  // CUIL-like XX-XXXXXXXX-X without a clear month/year slash period
  if (/^\d{2}[-\s]?\d{7,8}[-\s]?\d$/.test(normalized.replace(/\s+/g, ""))) {
    return true;
  }
  return false;
};

const resolveTwoDigitYear = (yy: number): number => {
  // Pivot: 00–69 → 2000–2069, 70–99 → 1970–1999
  return yy >= 70 ? 1900 + yy : 2000 + yy;
};

/**
 * Parses user text for a single payroll period (MM/YY, M/YY, MM/YYYY, dashes/spaces).
 * Rejects phone/CUIL-like strings and multiple distinct periods.
 */
export const parsePayrollReceiptPeriodMessage = (body: string): PayrollReceiptPeriodParseResult => {
  const trimmed = body?.trim() ?? "";
  if (!trimmed) {
    return { kind: "not_a_period" };
  }

  const compact = trimmed.toLowerCase().replace(/\s+/g, " ").trim();
  if (looksLikePhoneOrCuil(compact)) {
    return { kind: "not_a_period" };
  }

  const matches = [...compact.matchAll(PERIOD_TOKEN)];
  if (matches.length === 0) {
    return { kind: "not_a_period" };
  }

  const periods: Array<{ year: number; month: number }> = [];
  for (const match of matches) {
    const monthRaw = Number.parseInt(match[1]!, 10);
    const yearRaw = Number.parseInt(match[2]!, 10);
    if (!Number.isFinite(monthRaw) || !Number.isFinite(yearRaw)) {
      continue;
    }
    if (monthRaw < 1 || monthRaw > 12) {
      return { kind: "invalid_month" };
    }
    let year: number;
    if (match[2]!.length === 4) {
      year = yearRaw;
      if (year < 1970 || year > 2100) {
        return { kind: "invalid_year" };
      }
    } else if (match[2]!.length === 2) {
      year = resolveTwoDigitYear(yearRaw);
    } else {
      return { kind: "invalid_year" };
    }
    periods.push({ year, month: monthRaw });
  }

  if (periods.length === 0) {
    return { kind: "not_a_period" };
  }

  const uniqueKeys = new Set(periods.map((p) => `${p.year}-${p.month}`));
  if (uniqueKeys.size > 1) {
    return { kind: "ambiguous" };
  }

  return { kind: "success", year: periods[0]!.year, month: periods[0]!.month };
};
