const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export class InvalidCoordinatesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCoordinatesError";
  }
}

export const assertValidCoordinates = (lat: number, lon: number): void => {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new InvalidCoordinatesError("Latitude must be between -90 and 90");
  }

  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new InvalidCoordinatesError("Longitude must be between -180 and 180");
  }
};

export const calculateDistanceMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  assertValidCoordinates(lat1, lon1);
  assertValidCoordinates(lat2, lon2);

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const rLat1 = toRadians(lat1);
  const rLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
};
