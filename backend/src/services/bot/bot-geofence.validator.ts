import { calculateDistanceMeters } from "../../utils/haversine";
import { evaluateGeofence as evaluateGeofenceStatus } from "../../utils/attendance-validation";

export type GeofenceDecision =
  | { status: "inside"; distanceMeters: number }
  | { status: "review"; distanceMeters: number }
  | { status: "outside"; distanceMeters: number };

export const evaluateGeofence = (input: {
  employeeLatitude: number;
  employeeLongitude: number;
  storeLatitude: number;
  storeLongitude: number;
  allowedRadiusMeters: number;
  reviewMarginMeters: number;
}): GeofenceDecision => {
  const distanceMeters = calculateDistanceMeters(
    input.employeeLatitude,
    input.employeeLongitude,
    input.storeLatitude,
    input.storeLongitude,
  );

  const evaluation = evaluateGeofenceStatus(
    distanceMeters,
    input.allowedRadiusMeters,
    input.reviewMarginMeters,
  );

  if (evaluation.geoValidationStatus === "VALID") {
    return { status: "inside", distanceMeters };
  }

  if (evaluation.geoValidationStatus === "PENDING_REVIEW") {
    return { status: "review", distanceMeters };
  }

  return { status: "outside", distanceMeters };
};
