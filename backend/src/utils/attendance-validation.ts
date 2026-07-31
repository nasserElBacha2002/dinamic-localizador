import type {
  LocationStatus,
  PunctualityStatus,
  ValidationStatus,
} from "../types/domain";
import { evaluateCheckInWindow } from "./resolve-check-in-availability-window";

export interface GeofenceEvaluation {
  locationStatus: LocationStatus;
  geoValidationStatus: ValidationStatus;
  geoReason: string | null;
}

export interface PunctualityEvaluation {
  punctualityStatus: PunctualityStatus;
  timeValidationStatus: ValidationStatus;
  timeReason: string | null;
}

export interface AttendanceValidationResult {
  validationStatus: ValidationStatus;
  locationStatus: LocationStatus;
  punctualityStatus: PunctualityStatus;
  validationReason: string;
}

const validationPriority: Record<ValidationStatus, number> = {
  VALID: 0,
  PENDING_REVIEW: 1,
  REJECTED: 2,
};

const pickMostRestrictive = (
  left: ValidationStatus,
  right: ValidationStatus,
): ValidationStatus =>
  validationPriority[left] >= validationPriority[right] ? left : right;

export const evaluateGeofence = (
  distanceMeters: number,
  allowedRadiusMeters: number,
  reviewMarginMeters: number,
): GeofenceEvaluation => {
  if (distanceMeters <= allowedRadiusMeters) {
    return {
      locationStatus: "INSIDE_GEOFENCE",
      geoValidationStatus: "VALID",
      geoReason: null,
    };
  }

  if (distanceMeters <= allowedRadiusMeters + reviewMarginMeters) {
    return {
      locationStatus: "OUTSIDE_GEOFENCE",
      geoValidationStatus: "PENDING_REVIEW",
      geoReason: `Distancia ${Math.round(distanceMeters)} m supera el radio permitido (${allowedRadiusMeters} m) pero está dentro del margen de revisión`,
    };
  }

  return {
    locationStatus: "OUTSIDE_GEOFENCE",
    geoValidationStatus: "REJECTED",
    geoReason: `Distancia ${Math.round(distanceMeters)} m supera el radio permitido (${allowedRadiusMeters} m)`,
  };
};

/**
 * Shared check-in punctuality / availability.
 *
 * `onTimeGraceMinutes` is retained for call-site compatibility but is unused:
 * ON_TIME extends through `scheduledStart + lateToleranceMinutes` per product policy.
 * Availability closes at `expectedEndAt` (exclusive); when omitted, falls back to
 * `scheduledStart + lateToleranceMinutes`.
 */
export const evaluatePunctuality = (
  receivedAt: Date,
  scheduledStart: Date,
  earlyToleranceMinutes: number,
  lateToleranceMinutes: number,
  _onTimeGraceMinutes: number,
  expectedEndAt?: Date | null,
): PunctualityEvaluation => {
  const evaluation = evaluateCheckInWindow(
    {
      expectedStartAt: scheduledStart,
      expectedEndAt: expectedEndAt ?? null,
      earlyToleranceMinutes,
      lateToleranceMinutes,
    },
    receivedAt,
  );

  if (!evaluation.available || !evaluation.punctuality) {
    return {
      punctualityStatus: "OUTSIDE_TIME_WINDOW",
      timeValidationStatus: "REJECTED",
      timeReason: "Registro fuera de la ventana horaria permitida",
    };
  }

  return {
    punctualityStatus: evaluation.punctuality,
    timeValidationStatus: "VALID",
    timeReason: null,
  };
};

export const isWithinOperationWindow = (
  at: Date,
  scheduledStart: Date,
  earlyToleranceMinutes: number,
  lateToleranceMinutes: number,
  expectedEndAt?: Date | null,
): boolean =>
  evaluateCheckInWindow(
    {
      expectedStartAt: scheduledStart,
      expectedEndAt: expectedEndAt ?? null,
      earlyToleranceMinutes,
      lateToleranceMinutes,
    },
    at,
  ).available;

export const combineAttendanceValidation = (
  geo: GeofenceEvaluation,
  time: PunctualityEvaluation,
): AttendanceValidationResult => {
  const validationStatus = pickMostRestrictive(geo.geoValidationStatus, time.timeValidationStatus);
  const reasons = [geo.geoReason, time.timeReason].filter((reason): reason is string =>
    Boolean(reason),
  );

  return {
    validationStatus,
    locationStatus: geo.locationStatus,
    punctualityStatus: time.punctualityStatus,
    validationReason: reasons.length > 0 ? reasons.join("; ") : "Validación automática exitosa",
  };
};

export const formatLocalTime = (isoDate: string, timeZone: string): string =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoDate));

export const punctualityLabel = (status: PunctualityStatus): string => {
  const labels: Record<PunctualityStatus, string> = {
    EARLY: "Temprano",
    ON_TIME: "A tiempo",
    LATE: "Tarde",
    OUTSIDE_TIME_WINDOW: "Fuera de horario",
  };
  return labels[status];
};
