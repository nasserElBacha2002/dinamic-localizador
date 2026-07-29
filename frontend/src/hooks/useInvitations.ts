import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCompanyInvitation,
  listCompanyInvitations,
  resendCompanyInvitation,
  revokeCompanyInvitation,
} from "../api/invitations.api";
import { getActiveCompanyId } from "../api/company-path";
import type {
  CreateCompanyInvitationInput,
  UserInvitationFilters,
} from "../types/user-invitation";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useCompanyInvitations(filters: UserInvitationFilters, extraEnabled = true) {
  const { enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: ["company-invitations", getActiveCompanyId(), filters],
    queryFn: () => listCompanyInvitations(filters),
    enabled,
    retry: 1,
  });
}

export function useCreateCompanyInvitation() {
  const queryClient = useQueryClient();
  const companyId = getActiveCompanyId();

  return useMutation({
    mutationFn: (input: CreateCompanyInvitationInput) => createCompanyInvitation(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["company-invitations", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["company-users", companyId] });
    },
  });
}

export function useResendCompanyInvitation() {
  const queryClient = useQueryClient();
  const companyId = getActiveCompanyId();

  return useMutation({
    mutationFn: (invitationId: string) => resendCompanyInvitation(invitationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["company-invitations", companyId] });
    },
  });
}

export function useRevokeCompanyInvitation() {
  const queryClient = useQueryClient();
  const companyId = getActiveCompanyId();

  return useMutation({
    mutationFn: (invitationId: string) => revokeCompanyInvitation(invitationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["company-invitations", companyId] });
    },
  });
}
