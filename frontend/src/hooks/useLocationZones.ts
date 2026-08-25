import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createLocationZone,
  geocodeLocationZone,
  getLocationZones,
  getLocationZonesGeocodingSummary,
  updateLocationZone,
} from "../api/location-zones.api";
import type {
  CreateLocationZoneInput,
  ListLocationZonesFilters,
  UpdateLocationZoneInput,
} from "../types/location-zone";
import { employeeKeys } from "../queryKeys/employees";
import { locationZoneKeys } from "../queryKeys/location-zones";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useLocationZones(
  filters: ListLocationZonesFilters = {},
  extraEnabled = true,
) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: locationZoneKeys.list(companyId, filters),
    queryFn: () => getLocationZones(filters),
    enabled,
    retry: 1,
  });
}

export function useLocationZonesGeocodingSummary(extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: locationZoneKeys.geocodingSummary(companyId),
    queryFn: () => getLocationZonesGeocodingSummary(),
    enabled,
    retry: 1,
  });
}

export function useCreateLocationZone() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: CreateLocationZoneInput) => createLocationZone(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: locationZoneKeys.lists(companyId) }),
        queryClient.invalidateQueries({
          queryKey: locationZoneKeys.geocodingSummary(companyId),
        }),
      ]);
    },
  });
}

export function useUpdateLocationZone() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: ({
      zoneId,
      input,
    }: {
      zoneId: string;
      input: UpdateLocationZoneInput;
    }) => updateLocationZone(zoneId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: locationZoneKeys.lists(companyId) }),
        queryClient.invalidateQueries({
          queryKey: locationZoneKeys.geocodingSummary(companyId),
        }),
        queryClient.invalidateQueries({ queryKey: employeeKeys.lists(companyId) }),
        queryClient.invalidateQueries({ queryKey: employeeKeys.details(companyId) }),
      ]);
    },
  });
}

export function useGeocodeLocationZone() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: ({ zoneId, force }: { zoneId: string; force?: boolean }) =>
      geocodeLocationZone(zoneId, { force }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: locationZoneKeys.lists(companyId) }),
        queryClient.invalidateQueries({
          queryKey: locationZoneKeys.geocodingSummary(companyId),
        }),
      ]);
    },
  });
}
