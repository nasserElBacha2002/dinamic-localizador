import { calculateDistanceMeters } from "../utils/haversine";
import { evaluateGeofence } from "../utils/attendance-validation";
import { geofencePolicyResolver } from "./geofence-policy.resolver";

export const geolocationService = {
  calculateDistanceMeters,

  async evaluateDistance(
    companyId: string,
    receivedLatitude: number,
    receivedLongitude: number,
    serviceLatitude: number,
    serviceLongitude: number,
    serviceAllowedRadiusMeters: number,
  ) {
    const policy = await geofencePolicyResolver.resolveForService(
      companyId,
      serviceAllowedRadiusMeters,
    );

    const distanceMeters = calculateDistanceMeters(
      receivedLatitude,
      receivedLongitude,
      serviceLatitude,
      serviceLongitude,
    );

    return {
      distanceMeters,
      ...evaluateGeofence(distanceMeters, policy.radiusMeters, policy.marginMeters),
      policy,
    };
  },
};
