import { env } from "../../config/env";
import type { GeofenceEvaluation } from "../../utils/attendance-validation";
import { evaluateGeofence as evaluateGeofenceStatus } from "../../utils/attendance-validation";
import { calculateDistanceMeters } from "../../utils/haversine";

export type GeofenceDecision =
  | { status: "inside"; distanceMeters: number }
  | { status: "review"; distanceMeters: number }
  | { status: "outside"; distanceMeters: number };

const toGeofenceDecision = (
  distanceMeters: number,
  evaluation: GeofenceEvaluation,
): GeofenceDecision => {
  if (evaluation.geoValidationStatus === "VALID") {
    return { status: "inside", distanceMeters };
  }

  if (evaluation.geoValidationStatus === "PENDING_REVIEW") {
    return { status: "review", distanceMeters };
  }

  return { status: "outside", distanceMeters };
};

export const evaluateGeofenceDistance = (
  distanceMeters: number,
  allowedRadiusMeters: number,
  reviewMarginMeters: number,
): GeofenceDecision => {
  const evaluation = evaluateGeofenceStatus(
    distanceMeters,
    allowedRadiusMeters,
    reviewMarginMeters,
  );

  return toGeofenceDecision(distanceMeters, evaluation);
};

export const evaluateAttendanceGeofence = (input: {
  employeeLatitude: number;
  employeeLongitude: number;
  storeLatitude: number;
  storeLongitude: number;
  allowedRadiusMeters: number;
  reviewMarginMeters: number;
}): GeofenceEvaluation & { distanceMeters: number } => {
  const distanceMeters = calculateDistanceMeters(
    input.employeeLatitude,
    input.employeeLongitude,
    input.storeLatitude,
    input.storeLongitude,
  );

  // Mirrors geolocationService.evaluateDistance: zero/invalid store radius falls back to env default.
  const allowedRadiusMeters =
    input.allowedRadiusMeters > 0 ? input.allowedRadiusMeters : env.BOT_DEFAULT_RADIUS_METERS;

  const evaluation = evaluateGeofenceStatus(
    distanceMeters,
    allowedRadiusMeters,
    input.reviewMarginMeters,
  );

  return {
    distanceMeters,
    ...evaluation,
  };
};
