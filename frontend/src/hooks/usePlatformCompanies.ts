import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPlatformCompany, getPlatformCompanies } from "../api/platform-companies.api";
import type { CreatePlatformCompanyInput } from "../types/platform-company";
import { useAuth } from "./useAuth";

export function usePlatformCompanies(enabled = true) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["platform-companies"],
    queryFn: getPlatformCompanies,
    enabled: enabled && Boolean(user?.isPlatformAdmin),
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
