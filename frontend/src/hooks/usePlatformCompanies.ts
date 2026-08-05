import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPlatformCompany,
  deactivatePlatformCompany,
  getPlatformCompanies,
  reactivatePlatformCompany,
} from "../api/platform-companies.api";
import type { CreatePlatformCompanyInput } from "../types/platform-company";
import { useAuth } from "./useAuth";

export function usePlatformCompanies(enabled = true) {
  const { user, isLoading: authLoading } = useAuth();
  const isPlatformAdmin = Boolean(user?.isPlatformAdmin);

  return useQuery({
    queryKey: ["platform-companies"],
    queryFn: getPlatformCompanies,
    enabled: enabled && !authLoading && isPlatformAdmin,
  });
}

export function useCreatePlatformCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePlatformCompanyInput) => createPlatformCompany(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
    },
  });
}

export function useDeactivatePlatformCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, reason }: { companyId: string; reason: string }) =>
      deactivatePlatformCompany(companyId, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
    },
  });
}

export function useReactivatePlatformCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (companyId: string) => reactivatePlatformCompany(companyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
    },
  });
}
