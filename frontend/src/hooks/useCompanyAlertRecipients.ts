import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCompanyAlertRecipient,
  deleteCompanyAlertRecipient,
  listCompanyAlertRecipients,
  updateCompanyAlertRecipient,
} from "../api/company-alert-recipients.api";
import type {
  CreateCompanyAlertRecipientInput,
  UpdateCompanyAlertRecipientInput,
} from "../types/company-alert-recipient";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export const companyAlertRecipientsQueryKey = (companyId?: string) =>
  ["company-alert-recipients", companyId] as const;

export function useCompanyAlertRecipients(canManage = true) {
  const { companyId, enabled: scopeEnabled } = useOperationalQueryEnabled(canManage);

  return useQuery({
    queryKey: companyAlertRecipientsQueryKey(companyId),
    queryFn: () => listCompanyAlertRecipients(),
    enabled: scopeEnabled && canManage,
  });
}

export function useCreateCompanyAlertRecipient() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: CreateCompanyAlertRecipientInput) => createCompanyAlertRecipient(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: companyAlertRecipientsQueryKey(companyId),
      });
    },
  });
}

export function useUpdateCompanyAlertRecipient() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: ({
      recipientId,
      input,
    }: {
      recipientId: string;
      input: UpdateCompanyAlertRecipientInput;
    }) => updateCompanyAlertRecipient(recipientId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: companyAlertRecipientsQueryKey(companyId),
      });
    },
  });
}

export function useDeleteCompanyAlertRecipient() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (recipientId: string) => deleteCompanyAlertRecipient(recipientId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: companyAlertRecipientsQueryKey(companyId),
      });
    },
  });
}
