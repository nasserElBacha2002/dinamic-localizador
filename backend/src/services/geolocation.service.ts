import { calculateDistanceMeters } from "../utils/haversine";
import { evaluateGeofence } from "../utils/attendance-validation";
import { env } from "../config/env";

export const geolocationService = {
  calculateDistanceMeters,

  evaluateDistance(
    receivedLatitude: number,
    receivedLongitude: number,
    serviceLatitude: number,
    serviceLongitude: number,
    allowedRadiusMeters: number,
  ) {
    const distanceMeters = calculateDistanceMeters(
      receivedLatitude,
      receivedLongitude,
      serviceLatitude,
      serviceLongitude,
    );

    const radius =
      allowedRadiusMeters > 0 ? allowedRadiusMeters : env.BOT_DEFAULT_RADIUS_METERS;

    return {
      distanceMeters,
      ...evaluateGeofence(distanceMeters, radius, env.BOT_GEOFENCE_REVIEW_MARGIN_METERS),
    };
  },
};
