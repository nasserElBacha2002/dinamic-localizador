/**
 * Builds the PATCH payload for location zone edit so centroids are only sent
 * when the admin actually changed them (avoids accidental AUTO → MANUAL).
 */
export function buildLocationZoneEditPayload(input: {
  name: string;
  locality: string | null;
  lat: number | null;
  lng: number | null;
  initialLat: number | null;
  initialLng: number | null;
}): {
  name: string;
  locality: string | null;
  centroidLatitude?: number | null;
  centroidLongitude?: number | null;
} {
  const payload: {
    name: string;
    locality: string | null;
    centroidLatitude?: number | null;
    centroidLongitude?: number | null;
  } = {
    name: input.name,
    locality: input.locality,
  };

  const sameLat =
    (input.lat === null && input.initialLat === null) ||
    (typeof input.lat === "number" &&
      typeof input.initialLat === "number" &&
      Math.abs(input.lat - input.initialLat) < 1e-7);
  const sameLng =
    (input.lng === null && input.initialLng === null) ||
    (typeof input.lng === "number" &&
      typeof input.initialLng === "number" &&
      Math.abs(input.lng - input.initialLng) < 1e-7);

  if (!(sameLat && sameLng)) {
    payload.centroidLatitude = input.lat;
    payload.centroidLongitude = input.lng;
  }

  return payload;
}
