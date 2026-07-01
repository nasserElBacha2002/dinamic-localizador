import type { GeofenceEvaluation } from "../../utils/attendance-validation";
import { evaluateGeofence as evaluateGeofenceStatus } from "../../utils/attendance-validation";
import { getDefaultRadiusMeters } from "../../utils/bot-runtime-settings-scope";
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
  defaultRadiusMeters?: number;
}): GeofenceEvaluation & { distanceMeters: number } => {
  const distanceMeters = calculateDistanceMeters(
    input.employeeLatitude,
    input.employeeLongitude,
    input.storeLatitude,
    input.storeLongitude,
  );

  const fallbackRadius = input.defaultRadiusMeters ?? getDefaultRadiusMeters();
  const allowedRadiusMeters =
    input.allowedRadiusMeters > 0 ? input.allowedRadiusMeters : fallbackRadius;

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
