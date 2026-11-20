import { AppError } from "../../errors/app-error";
import { isDecimalString, normalizeDecimalString } from "../money-decimal";

/** Matches SQL Server agreed_amount DECIMAL(18, 6). */
const SCALE = 1_000_000n;
const MAX_WHOLE_DIGITS = 12;
const MAX_SCALED = 999_999_999_999n * SCALE + (SCALE - 1n);
const MIN_SCALED = -MAX_SCALED;

/** Matches SQL Server commercial_benefit_discount_percent DECIMAL(9, 4). */
const PERCENT_SCALE = 10_000n;
const MAX_PERCENT_SCALED = 100n * PERCENT_SCALE;

const toScaled = (value: string): bigint => {
  const normalized = normalizeDecimalString(value);
  if (!normalized || !isDecimalString(normalized)) {
    throw new AppError(400, "BILLING_INVALID_AMOUNT", "Monto inválido.");
  }
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  if (fraction.length > 6) {
    throw new AppError(400, "BILLING_AMOUNT_OUT_OF_RANGE", "Monto fuera de rango permitido.");
  }
  const wholeNormalized = whole.replace(/^0+(?=\d)/, "") || "0";
  if (wholeNormalized.length > MAX_WHOLE_DIGITS) {
    throw new AppError(400, "BILLING_AMOUNT_OUT_OF_RANGE", "Monto fuera de rango permitido.");
  }
  const padded = `${fraction}000000`.slice(0, 6);
  const scaled = BigInt(whole) * SCALE + BigInt(padded || "0");
  const result = negative ? -scaled : scaled;
  if (result > MAX_SCALED || result < MIN_SCALED) {
    throw new AppError(400, "BILLING_AMOUNT_OUT_OF_RANGE", "Monto fuera de rango permitido.");
  }
  return result;
};

const parseBenefitPercentScaled = (percent: string): bigint => {
  const trimmed = percent.trim();
  const [whole, fraction = ""] = trimmed.split(".");
  if (!/^\d+$/.test(whole) || (fraction && !/^\d+$/.test(fraction))) {
    throw new AppError(400, "BILLING_INVALID_BENEFIT_PERCENT", "Porcentaje de descuento inválido.");
  }
  if (fraction.length > 4) {
    throw new AppError(
      400,
      "BILLING_INVALID_BENEFIT_PERCENT",
      "El porcentaje admite como máximo cuatro decimales.",
    );
  }
  const percentScaled = BigInt(whole) * PERCENT_SCALE + BigInt(`${fraction}${"0".repeat(4)}`.slice(0, 4));
  if (percentScaled < 0n || percentScaled > MAX_PERCENT_SCALED) {
    throw new AppError(400, "BILLING_INVALID_BENEFIT_PERCENT", "Porcentaje de descuento inválido.");
  }
  return percentScaled;
};

const fromScaled = (value: bigint): string => {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / SCALE;
  const fraction = abs % SCALE;
  const fractionText = fraction.toString().padStart(6, "0").replace(/0+$/, "");
  const body = fractionText.length > 0 ? `${whole}.${fractionText}` : `${whole}`;
  return negative ? `-${body}` : body;
};

/** Half-up rounding to 6 decimal places (SQL Server monetary scale). */
const divideHalfUp = (numerator: bigint, denominator: bigint): bigint => {
  if (denominator === 0n) {
    throw new AppError(400, "BILLING_INVALID_AMOUNT", "Monto inválido.");
  }
  const negative = (numerator < 0n) !== (denominator < 0n);
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  let quotient = n / d;
  const remainder = n % d;
  if (remainder * 2n >= d) {
    quotient += 1n;
  }
  return negative ? -quotient : quotient;
};

export const formatBenefitAmount = (value: string): string =>
  normalizeDecimalString(value) ?? value.trim();

export const subtractBenefitAmounts = (minuend: string, subtrahend: string): string => {
  const base = toScaled(minuend);
  const discount = toScaled(subtrahend);
  if (discount < 0n) {
    throw new AppError(400, "BILLING_INVALID_BENEFIT_DISCOUNT", "El descuento no puede ser negativo.");
  }
  if (discount > base) {
    throw new AppError(
      409,
      "BILLING_BENEFIT_DISCOUNT_EXCEEDS_BASE",
      "El descuento supera el importe base.",
    );
  }
  return fromScaled(base - discount);
};

export const applyPercentDiscount = (baseAmount: string, percent: string): string => {
  const base = toScaled(baseAmount);
  if (base < 0n) {
    throw new AppError(400, "BILLING_INVALID_AMOUNT", "Monto inválido.");
  }
  const percentScaled = parseBenefitPercentScaled(percent);
  const multiplier = MAX_PERCENT_SCALED - percentScaled;
  const discounted = divideHalfUp(base * multiplier, MAX_PERCENT_SCALED);
  const result = fromScaled(discounted);
  toScaled(result);
  return result;
};

export const assertBenefitFinalAmount = (
  baseAmount: string,
  kind: "FIXED_FINAL_AMOUNT" | "PERCENT_DISCOUNT" | "FIXED_AMOUNT_DISCOUNT",
  input: {
    finalAgreedAmount: string;
    discountPercent?: string | null;
    discountAmount?: string | null;
  },
): string => {
  let expected: string;
  if (kind === "FIXED_FINAL_AMOUNT") {
    expected = formatBenefitAmount(input.finalAgreedAmount);
    const base = toScaled(baseAmount);
    const finalScaled = toScaled(expected);
    if (finalScaled > base) {
      throw new AppError(
        409,
        "BILLING_BENEFIT_FINAL_EXCEEDS_BASE",
        "El importe final no puede superar la base.",
      );
    }
  } else if (kind === "PERCENT_DISCOUNT") {
    if (!input.discountPercent) {
      throw new AppError(400, "BILLING_BENEFIT_PERCENT_REQUIRED", "Falta el porcentaje de descuento.");
    }
    expected = applyPercentDiscount(baseAmount, input.discountPercent);
  } else {
    if (!input.discountAmount) {
      throw new AppError(
        400,
        "BILLING_BENEFIT_DISCOUNT_AMOUNT_REQUIRED",
        "Falta el monto de descuento.",
      );
    }
    expected = subtractBenefitAmounts(baseAmount, input.discountAmount);
  }

  const normalizedExpected = formatBenefitAmount(expected);
  const normalizedFinal = formatBenefitAmount(input.finalAgreedAmount);
  if (normalizedExpected !== normalizedFinal) {
    throw new AppError(
      409,
      "BILLING_BENEFIT_FINAL_AMOUNT_MISMATCH",
      "El importe contractual final no coincide con el beneficio autorizado.",
    );
  }
  return normalizedFinal;
};