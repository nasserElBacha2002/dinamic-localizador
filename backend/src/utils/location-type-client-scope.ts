/** Location type row shape used for client/company scope checks. */
export type LocationTypeClientScope = {
  clientId: string | null;
};

/**
 * Whether a catalog format may be assigned to a service (ubicación) for the given client.
 *
 * Company-wide rows (client_id IS NULL) are created via company settings and are only
 * assignable to services without a client. Client-owned rows are managed per client
 * (see migration 143/144 and createLocationTypeForClient).
 *
 * - Service with client: only formats owned by that client.
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
