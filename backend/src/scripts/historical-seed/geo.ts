import { calculateDistanceMeters } from "../../utils/haversine";

/** Offset a point by meters using local equirectangular approximation. */
export const offsetCoordinatesMeters = (
  latitude: number,
  longitude: number,
  eastMeters: number,
  northMeters: number,
): { latitude: number; longitude: number } => {
  const latRad = (latitude * Math.PI) / 180;
  const metersPerDegLat = 111_320;
  const metersPerDegLon = 111_320 * Math.cos(latRad);
  return {
    latitude: latitude + northMeters / metersPerDegLat,
    longitude: longitude + (metersPerDegLon === 0 ? 0 : eastMeters / metersPerDegLon),
  };
};

export const randomPointWithinRadius = (
  latitude: number,
  longitude: number,
  radiusMeters: number,
  next: () => number,
): { latitude: number; longitude: number; distanceMeters: number } => {
  const capped = Math.max(5, radiusMeters * 0.8);
  const angle = next() * 2 * Math.PI;
  const distance = Math.sqrt(next()) * capped;
  const east = Math.cos(angle) * distance;
  const north = Math.sin(angle) * distance;
  const point = offsetCoordinatesMeters(latitude, longitude, east, north);
  const distanceMeters = calculateDistanceMeters(
    latitude,
    longitude,
    point.latitude,
    point.longitude,
  );
  return { ...point, distanceMeters };
};
