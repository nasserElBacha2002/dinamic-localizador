import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCompanyLocationType,
  disableCompanyLocationType,
  listCompanyLocationTypes,
  updateCompanyLocationType,
} from "../api/company-location-types.api";
import type {
  CreateCompanyLocationTypeInput,
  UpdateCompanyLocationTypeInput,
} from "../types/company-location-type";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export const companyLocationTypesQueryKey = (companyId?: string, activeOnly = false) =>
  ["company-location-types", companyId, activeOnly] as const;

export function useCompanyLocationTypes(activeOnly = false) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: companyLocationTypesQueryKey(companyId, activeOnly),
    queryFn: () => listCompanyLocationTypes(activeOnly),
    enabled,
    retry: 1,
  });
}

export function useCreateCompanyLocationType() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: CreateCompanyLocationTypeInput) => createCompanyLocationType(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["company-location-types", companyId] });
    },
  });
}

export function useUpdateCompanyLocationType() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: ({
      locationTypeId,
      input,
    }: {
      locationTypeId: string;
      input: UpdateCompanyLocationTypeInput;
    }) => updateCompanyLocationType(locationTypeId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["company-location-types", companyId] });
    },
  });
}

export function useDisableCompanyLocationType() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (locationTypeId: string) => disableCompanyLocationType(locationTypeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["company-location-types", companyId] });
    },
  });
}
