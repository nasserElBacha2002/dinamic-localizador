export type LocationTypeClientScope = {
  clientId: string | null;
};

/** Mirrors backend `isLocationTypeAssignableToService` for format pickers. */
export function isLocationTypeAssignableToService(
  locationType: LocationTypeClientScope,
  serviceClientId: string | null | undefined,
): boolean {
  if (serviceClientId) {
    return locationType.clientId === serviceClientId;
  }
  return locationType.clientId === null;
}

export function isLocationTypeSelectableForServiceClient(
  locationType: LocationTypeClientScope,
  serviceClientId: string | null | undefined,
): boolean {
  return isLocationTypeAssignableToService(locationType, serviceClientId || null);
}
