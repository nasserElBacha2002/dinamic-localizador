import type { CheckoutStatus } from "../constants/checkout-status";
import type { GeofenceEvaluation } from "./attendance-validation";

export interface CheckoutTimeEvaluation {
  checkoutStatus: CheckoutStatus;
  earlyDepartureMinutes: number;
  extraWorkedMinutes: number;
  reviewReason: string | null;
}

export interface CheckoutValidationResult {
  checkoutStatus: CheckoutStatus;
  earlyDepartureMinutes: number;
  extraWorkedMinutes: number;
  checkoutReviewReason: string;
}

const minutesBetween = (later: Date, earlier: Date): number =>
  Math.max(0, Math.round((later.getTime() - earlier.getTime()) / 60_000));

export const evaluateCheckoutTime = (
  checkoutAt: Date,
  scheduledEnd: Date | null,
  earlyToleranceMinutes: number,
): CheckoutTimeEvaluation => {
  if (!scheduledEnd) {
    return {
      checkoutStatus: "CHECKOUT_VALID",
      earlyDepartureMinutes: 0,
      extraWorkedMinutes: 0,
      reviewReason: null,
    };
  }

  if (checkoutAt > scheduledEnd) {
    return {
      checkoutStatus: "CHECKOUT_LATE_EXTRA_TIME",
      earlyDepartureMinutes: 0,
      extraWorkedMinutes: minutesBetween(checkoutAt, scheduledEnd),
      reviewReason: null,
    };
  }

  const earlyDepartureMinutes = minutesBetween(scheduledEnd, checkoutAt);

  if (earlyDepartureMinutes <= earlyToleranceMinutes) {
    return {
      checkoutStatus: "CHECKOUT_EARLY_WITHIN_TOLERANCE",
      earlyDepartureMinutes,
      extraWorkedMinutes: 0,
      reviewReason: null,
    };
  }

  return {
    checkoutStatus: "CHECKOUT_EARLY_REVIEW",
    earlyDepartureMinutes,
    extraWorkedMinutes: 0,
    reviewReason: `Salida ${earlyDepartureMinutes} min antes del horario previsto`,
  };
};

const checkoutStatusPriority: Record<CheckoutStatus, number> = {
  CHECKOUT_VALID: 0,
  CHECKOUT_EARLY_WITHIN_TOLERANCE: 1,
  CHECKOUT_LATE_EXTRA_TIME: 1,
  CHECKOUT_EARLY_REVIEW: 2,
  CHECKOUT_LOCATION_REVIEW: 3,
  CHECKOUT_REJECTED: 4,
};

const pickMostRestrictiveCheckoutStatus = (
  left: CheckoutStatus,
  right: CheckoutStatus,
): CheckoutStatus =>
  checkoutStatusPriority[left] >= checkoutStatusPriority[right] ? left : right;

export const combineCheckoutValidation = (
  geo: GeofenceEvaluation,
  time: CheckoutTimeEvaluation,
): CheckoutValidationResult => {
  let checkoutStatus = time.checkoutStatus;
  const reasons: string[] = [];

  if (time.reviewReason) {
    reasons.push(time.reviewReason);
  }

  if (geo.geoValidationStatus === "REJECTED") {
    checkoutStatus = "CHECKOUT_REJECTED";
    if (geo.geoReason) {
      reasons.push(geo.geoReason);
    }
  } else if (geo.geoValidationStatus === "PENDING_REVIEW") {
    checkoutStatus = pickMostRestrictiveCheckoutStatus(
      checkoutStatus,
      "CHECKOUT_LOCATION_REVIEW",
    );
    if (geo.geoReason) {
      reasons.push(geo.geoReason);
    }
  }

  return {
    checkoutStatus,
    earlyDepartureMinutes: time.earlyDepartureMinutes,
    extraWorkedMinutes: time.extraWorkedMinutes,
    checkoutReviewReason:
      reasons.length > 0 ? reasons.join("; ") : "Validación automática de salida exitosa",
  };
};

export const checkoutStatusLabel = (status: CheckoutStatus): string => {
  const labels: Record<CheckoutStatus, string> = {
    CHECKOUT_VALID: "Salida válida",
    CHECKOUT_EARLY_WITHIN_TOLERANCE: "Salida anticipada dentro de tolerancia",
    CHECKOUT_EARLY_REVIEW: "Salida anticipada pendiente de revisión",
    CHECKOUT_LATE_EXTRA_TIME: "Salida con tiempo extra",
    CHECKOUT_LOCATION_REVIEW: "Salida pendiente de revisión por ubicación",
    CHECKOUT_REJECTED: "Salida rechazada",
  };

  return labels[status];
};
