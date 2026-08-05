import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { payrollReceiptKeys } from "../api/payroll-receipt-query-keys";
import {
  createPayrollReceiptBatch,
  deletePayrollReceipt,
  downloadPayrollReceiptContent,
  getPayrollReceiptBatch,
  getPayrollReceiptBatches,
  getPayrollReceiptById,
  getPayrollReceipts,
  replacePayrollReceipt,
  reconcilePayrollReceiptAssociation,
  uploadPayrollReceiptToBatch,
} from "../api/payroll-receipts.api";
import type {
  CreatePayrollReceiptBatchInput,
  PayrollReceiptBatchFilters,
  PayrollReceiptFilters,
} from "../types/payroll-receipt";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

function invalidatePayrollReceiptDomain(
  queryClient: ReturnType<typeof useQueryClient>,
  companyId: string | null | undefined,
) {
  if (!companyId) {
    return;
  }
  void queryClient.invalidateQueries({ queryKey: payrollReceiptKeys.company(companyId) });
}

type MutationCompanyContext = { companyId: string | undefined };

export function usePayrollReceipts(filters: PayrollReceiptFilters) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: payrollReceiptKeys.list(companyId, filters),
    queryFn: () => getPayrollReceipts(filters),
    enabled,
  });
}

export function usePayrollReceipt(receiptId?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(receiptId));

  return useQuery({
    queryKey: payrollReceiptKeys.detail(companyId, receiptId ?? ""),
    queryFn: () => getPayrollReceiptById(receiptId!),
    enabled,
  });
}

export function usePayrollReceiptBatches(filters: PayrollReceiptBatchFilters = {}) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: payrollReceiptKeys.batchList(companyId, filters),
    queryFn: () => getPayrollReceiptBatches(filters),
    enabled,
  });
}

export function usePayrollReceiptBatch(batchId?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(batchId));

  return useQuery({
    queryKey: payrollReceiptKeys.batch(companyId, batchId ?? ""),
    queryFn: () => getPayrollReceiptBatch(batchId!),
    enabled,
  });
}

export function useCreatePayrollReceiptBatch() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: (input: CreatePayrollReceiptBatchInput) => createPayrollReceiptBatch(input),
    onMutate: (): MutationCompanyContext => ({ companyId }),
    onSuccess: (_data, _vars, context) => {
      invalidatePayrollReceiptDomain(queryClient, context?.companyId);
    },
  });
}

export function useUploadPayrollReceiptToBatch() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: (input: {
      batchId: string;
      file: File;
      idempotencyKey?: string;
      onUploadProgress?: (percent: number) => void;
    }) =>
      uploadPayrollReceiptToBatch(input.batchId, input.file, {
        idempotencyKey: input.idempotencyKey,
        onUploadProgress: input.onUploadProgress,
      }),
    onMutate: (): MutationCompanyContext => ({ companyId }),
    onSuccess: (_data, _vars, context) => {
      invalidatePayrollReceiptDomain(queryClient, context?.companyId);
    },
  });
}

export function useReplacePayrollReceipt(receiptId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: (input: {
      file: File;
      idempotencyKey?: string;
      onUploadProgress?: (percent: number) => void;
    }) =>
      replacePayrollReceipt(receiptId, input.file, {
        idempotencyKey: input.idempotencyKey,
        onUploadProgress: input.onUploadProgress,
      }),
    onMutate: (): MutationCompanyContext => ({ companyId }),
    onSuccess: (_data, _vars, context) => {
      invalidatePayrollReceiptDomain(queryClient, context?.companyId);
    },
  });
}

export function useDeletePayrollReceipt() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: (receiptId: string) => deletePayrollReceipt(receiptId),
    onMutate: (): MutationCompanyContext => ({ companyId }),
    onSuccess: (_data, _vars, context) => {
      invalidatePayrollReceiptDomain(queryClient, context?.companyId);
    },
  });
}

export function useReconcilePayrollReceiptAssociation(receiptId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();
  return useMutation({
    mutationFn: () => reconcilePayrollReceiptAssociation(receiptId),
    onMutate: (): MutationCompanyContext => ({ companyId }),
    onSuccess: (_data, _vars, context) => {
      invalidatePayrollReceiptDomain(queryClient, context?.companyId);
    },
  });
}

export function useDownloadPayrollReceipt() {
  return useMutation({
    mutationFn: (input: { receiptId: string; disposition?: "inline" | "attachment" }) =>
      downloadPayrollReceiptContent(input.receiptId, input.disposition ?? "attachment"),
  });
}
