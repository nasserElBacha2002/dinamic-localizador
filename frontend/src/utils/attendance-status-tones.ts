import type {
  CheckoutStatus,
  LocationStatus,
  OperationalStatus,
  PunctualityStatus,
  ValidationStatus,
} from "../types/attendance";

type StatusBadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

export function validationStatusTone(status: ValidationStatus): StatusBadgeTone {
  if (status === "VALID") return "success";
  if (status === "PENDING_REVIEW") return "warning";
  if (status === "REJECTED") return "danger";
  return "neutral";
}

export function locationStatusTone(status: LocationStatus): StatusBadgeTone {
  if (status === "INSIDE_GEOFENCE") return "success";
  if (status === "OUTSIDE_GEOFENCE") return "danger";
  if (status === "INVALID_LOCATION") return "warning";
  return "neutral";
}

export function operationalStatusTone(status: OperationalStatus): StatusBadgeTone {
  if (status === "VALID") return "success";
  if (status === "PENDING_REVIEW") return "warning";
  if (status === "REJECTED") return "danger";
  if (status === "NO_CHECK_IN") return "neutral";
  return "neutral";
}

export function punctualityStatusTone(status: PunctualityStatus): StatusBadgeTone {
  if (status === "ON_TIME") return "success";
  if (status === "EARLY") return "info";
  if (status === "LATE") return "warning";
  if (status === "OUTSIDE_TIME_WINDOW") return "danger";
  return "neutral";
}

export function checkoutStatusTone(status: CheckoutStatus): StatusBadgeTone {
  if (status === "CHECKOUT_VALID") return "success";
  if (status === "CHECKOUT_EARLY_WITHIN_TOLERANCE") return "info";
  if (status === "CHECKOUT_EARLY_REVIEW") return "warning";
  if (status === "CHECKOUT_LATE_EXTRA_TIME") return "info";
  if (status === "CHECKOUT_LOCATION_REVIEW") return "warning";
  if (status === "CHECKOUT_REJECTED") return "danger";
  return "neutral";
}
