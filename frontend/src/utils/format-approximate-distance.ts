/**
 * Human-friendly approximate distance for zone-centroid proximity (es-AR).
 * Returns null when there is no displayable distance.
 */
export function formatApproximateDistance(
  distanceMeters: number | null | undefined,
): string | null {
  if (distanceMeters === null || distanceMeters === undefined) {
    return null;
  }
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    return null;
  }

  if (distanceMeters < 1000) {
    return `~${Math.round(distanceMeters)} m`;
  }

  const km = distanceMeters / 1000;
  if (km < 10) {
    const rounded = Math.round(km * 10) / 10;
    const text = Number.isInteger(rounded)
      ? String(rounded)
      : rounded.toFixed(1).replace(".", ",");
    return `~${text} km`;
  }

  return `~${Math.round(km)} km`;
}
