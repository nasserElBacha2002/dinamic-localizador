import {
  combineAttendanceValidation,
  evaluateGeofence,
  evaluatePunctuality,
  type AttendanceValidationResult,
} from "./attendance-validation";
import { calculateDistanceMeters } from "./haversine";

export type AttendanceCheckInGeofencePolicy = {
  /** Effective allowed radius (service override already applied when > 0). */
  radiusMeters: number;
  /** Review band beyond radius (PENDING_REVIEW). */
  marginMeters: number;
};

export type EvaluateAttendanceCheckInInput = {
  coordinates: { latitude: number; longitude: number };
  serviceCoordinates: { latitude: number; longitude: number };
  geofencePolicy: AttendanceCheckInGeofencePolicy;
  /**
   * Authoritative clock for punctuality / time-window classification.
   * Must be server-side (or an explicitly trusted flow clock), never client-controlled.
   */
  authoritativeAt: Date;
  scheduledStart: Date;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
};

export type EvaluateAttendanceCheckInResult = {
  validation: AttendanceValidationResult;
  distanceMeters: number;
  effectiveRadiusMeters: number;
};

/**
 * Shared check-in domain primitive used by REST Attendance, WhatsApp/Bot, and Simulator.
 * Callers supply an already-resolved geofence policy and an authoritative timestamp.
 */
export function evaluateAttendanceCheckIn(
  input: EvaluateAttendanceCheckInInput,
): EvaluateAttendanceCheckInResult {
  const effectiveRadiusMeters =
    input.geofencePolicy.radiusMeters > 0 ? input.geofencePolicy.radiusMeters : 0;

  const distanceMeters = calculateDistanceMeters(
    input.coordinates.latitude,
    input.coordinates.longitude,
    input.serviceCoordinates.latitude,
    input.serviceCoordinates.longitude,
  );

  const geo = evaluateGeofence(
    distanceMeters,
    effectiveRadiusMeters,
    input.geofencePolicy.marginMeters,
  );

  const time = evaluatePunctuality(
    input.authoritativeAt,
    input.scheduledStart,
    input.earlyToleranceMinutes,
    input.lateToleranceMinutes,
  );

  return {
    validation: combineAttendanceValidation(geo, time),
    distanceMeters,
    effectiveRadiusMeters,
  };
}
