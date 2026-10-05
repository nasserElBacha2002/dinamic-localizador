/** Location type row shape used for client/company scope checks. */
export type LocationTypeClientScope = {
  clientId: string | null;
};

/**
 * Whether a catalog format may be assigned to a service (ubicación) for the given client.
 * - Service with client: only formats owned by that client (never company-wide or other clients).
 * - Service without client: only company-wide formats (client_id IS NULL).
 */
export function isLocationTypeAssignableToService(
  locationType: LocationTypeClientScope,
  serviceClientId: string | null | undefined,
): boolean {
  if (serviceClientId) {
    return locationType.clientId === serviceClientId;
  }
  return locationType.clientId === null;
}
