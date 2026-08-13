import type { SingleResponse } from "../types/api";
import type {
  CreateLocationZoneInput,
  ListLocationZonesFilters,
  LocationZone,
  UpdateLocationZoneInput,
} from "../types/location-zone";
import { buildParams } from "./client";
import { scopedApiClient } from "./scoped-client";

export async function getLocationZones(
  filters: ListLocationZonesFilters = {},
): Promise<LocationZone[]> {
  const { data } = await scopedApiClient.get<SingleResponse<LocationZone[]>>("location-zones", {
    params: buildParams({
      includeInactive: filters.includeInactive ? "true" : undefined,
    }),
  });
  return data.data;
}

export async function createLocationZone(input: CreateLocationZoneInput): Promise<LocationZone> {
  const { data } = await scopedApiClient.post<SingleResponse<LocationZone>>("location-zones", input);
  return data.data;
}

export async function updateLocationZone(
  zoneId: string,
  input: UpdateLocationZoneInput,
): Promise<LocationZone> {
  const { data } = await scopedApiClient.patch<SingleResponse<LocationZone>>(
    `location-zones/${zoneId}`,
    input,
  );
  return data.data;
}
