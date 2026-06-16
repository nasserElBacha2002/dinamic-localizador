import type {
  LocationStatus,
  PunctualityStatus,
  ValidationStatus,
} from "../types/domain";

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

export const evaluatePunctuality = (
  receivedAt: Date,
  scheduledStart: Date,
  earlyToleranceMinutes: number,
  lateToleranceMinutes: number,
  onTimeGraceMinutes: number,
): PunctualityEvaluation => {
  const windowStart = new Date(scheduledStart.getTime() - earlyToleranceMinutes * 60_000);
  const windowEnd = new Date(scheduledStart.getTime() + lateToleranceMinutes * 60_000);
  const onTimeEnd = new Date(scheduledStart.getTime() + onTimeGraceMinutes * 60_000);

  if (receivedAt < windowStart || receivedAt > windowEnd) {
    return {
      punctualityStatus: "OUTSIDE_TIME_WINDOW",
      timeValidationStatus: "REJECTED",
      timeReason: "Registro fuera de la ventana horaria permitida",
    };
  }

  if (receivedAt < scheduledStart) {
    return {
      punctualityStatus: "EARLY",
      timeValidationStatus: "VALID",
      timeReason: null,
    };
  }

  if (receivedAt <= onTimeEnd) {
    return {
      punctualityStatus: "ON_TIME",
      timeValidationStatus: "VALID",
      timeReason: null,
    };
  }

  return {
    punctualityStatus: "LATE",
    timeValidationStatus: "VALID",
    timeReason: null,
  };
};

export const isWithinInventoryWindow = (
  at: Date,
  scheduledStart: Date,
  earlyToleranceMinutes: number,
  lateToleranceMinutes: number,
): boolean => {
  const windowStart = new Date(scheduledStart.getTime() - earlyToleranceMinutes * 60_000);
  const windowEnd = new Date(scheduledStart.getTime() + lateToleranceMinutes * 60_000);
  return at >= windowStart && at <= windowEnd;
};

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
