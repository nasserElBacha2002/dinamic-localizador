import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCompanyUser,
  deactivateCompanyUser,
  getCompanyMembership,
  getCompanyUsers,
  updateCompanyUser,
} from "../api/company-users.api";
import { getActiveCompanyId } from "../api/company-path";
import type {
  CompanyUserFilters,
  CreateCompanyUserInput,
  UpdateCompanyUserInput,
} from "../types/company-user";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useCompanyPermissions(extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: ["company-permissions", companyId],
    queryFn: () => getCompanyMembership(companyId!),
    enabled: enabled && Boolean(companyId),
    staleTime: 60_000,
  });
}

export function useCompanyUsers(filters: CompanyUserFilters, extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: ["company-users", companyId, filters],
    queryFn: () => getCompanyUsers(filters),
    enabled,
    retry: 1,
  });
}

export function useCreateCompanyUser() {
  const queryClient = useQueryClient();
  const companyId = getActiveCompanyId();

  return useMutation({
    mutationFn: (input: CreateCompanyUserInput) => createCompanyUser(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["company-users", companyId] });
    },
  });
}

export function useUpdateCompanyUser() {
  const queryClient = useQueryClient();
  const companyId = getActiveCompanyId();

  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: UpdateCompanyUserInput }) =>
      updateCompanyUser(userId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["company-users", companyId] });
    },
  });
}

export function useDeactivateCompanyUser() {
  const queryClient = useQueryClient();
  const companyId = getActiveCompanyId();

  return useMutation({
    mutationFn: (userId: string) => deactivateCompanyUser(userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["company-users", companyId] });
    },
  });
}
