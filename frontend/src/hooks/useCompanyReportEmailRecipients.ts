import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCompanyReportEmailRecipient,
  deleteCompanyReportEmailRecipient,
  listCompanyReportEmailRecipients,
  updateCompanyReportEmailRecipient,
} from "../api/company-report-email-recipients.api";
import type {
  CreateCompanyReportEmailRecipientInput,
  UpdateCompanyReportEmailRecipientInput,
} from "../types/company-report-email-recipient";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export const companyReportEmailRecipientsQueryKey = (companyId?: string) =>
  ["company-report-email-recipients", companyId] as const;

export function useCompanyReportEmailRecipients(canManage = true) {
  const { companyId, enabled: scopeEnabled } = useOperationalQueryEnabled(canManage);

  return useQuery({
    queryKey: companyReportEmailRecipientsQueryKey(companyId),
    queryFn: () => listCompanyReportEmailRecipients(),
    enabled: scopeEnabled && canManage,
  });
}

export function useCreateCompanyReportEmailRecipient() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: CreateCompanyReportEmailRecipientInput) =>
      createCompanyReportEmailRecipient(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: companyReportEmailRecipientsQueryKey(companyId),
      });
    },
  });
}

export function useUpdateCompanyReportEmailRecipient() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: ({
      recipientId,
      input,
    }: {
      recipientId: string;
      input: UpdateCompanyReportEmailRecipientInput;
    }) => updateCompanyReportEmailRecipient(recipientId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: companyReportEmailRecipientsQueryKey(companyId),
      });
    },
  });
}

export function useDeleteCompanyReportEmailRecipient() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (recipientId: string) => deleteCompanyReportEmailRecipient(recipientId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: companyReportEmailRecipientsQueryKey(companyId),
      });
    },
  });
}
