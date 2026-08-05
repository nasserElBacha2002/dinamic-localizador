import type { PaginatedResponse, SingleResponse } from "../types/api";
import type {
  CreatePayrollReceiptBatchInput,
  PayrollReceiptBatch,
  PayrollReceiptBatchFilters,
  PayrollReceiptDetail,
  PayrollReceiptFilters,
  PayrollReceiptListItem,
} from "../types/payroll-receipt";
import { buildParams } from "./client";
import { scopedApiClient } from "./scoped-client";

function toApiListParams(filters: PayrollReceiptFilters) {
  const { employeeIds, employeeId, ...rest } = filters;
  const mergedEmployeeIds =
    employeeIds && employeeIds.length > 0
      ? employeeIds
      : employeeId
        ? [employeeId]
        : undefined;

  return buildParams({
    ...rest,
    employeeIds: mergedEmployeeIds,
  } as Record<string, string | number | boolean | string[] | undefined>);
}

export async function createPayrollReceiptBatch(
  input: CreatePayrollReceiptBatchInput,
): Promise<PayrollReceiptBatch> {
  const { data } = await scopedApiClient.post<SingleResponse<PayrollReceiptBatch>>(
    "payroll-receipt-batches",
    input,
  );
  return data.data;
}

export async function getPayrollReceiptBatches(
  filters: PayrollReceiptBatchFilters = {},
): Promise<PaginatedResponse<PayrollReceiptBatch>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<PayrollReceiptBatch>>(
    "payroll-receipt-batches",
    {
      params: buildParams(filters as Record<string, string | number | boolean | string[] | undefined>),
    },
  );
  return data;
}

export async function getPayrollReceiptBatch(batchId: string): Promise<PayrollReceiptBatch> {
  const { data } = await scopedApiClient.get<SingleResponse<PayrollReceiptBatch>>(
    `payroll-receipt-batches/${batchId}`,
  );
  return data.data;
}

export async function uploadPayrollReceiptToBatch(
  batchId: string,
  file: File,
  options?: {
    idempotencyKey?: string;
    onUploadProgress?: (percent: number) => void;
  },
): Promise<PayrollReceiptListItem> {
  const formData = new FormData();
  formData.append("file", file);
  const idempotencyKey = options?.idempotencyKey ?? crypto.randomUUID();
  const { data } = await scopedApiClient.post<SingleResponse<PayrollReceiptListItem>>(
    `payroll-receipt-batches/${batchId}/receipts`,
    formData,
    {
      timeout: 120_000,
      headers: { "Idempotency-Key": idempotencyKey },
      onUploadProgress: (event) => {
        if (!options?.onUploadProgress || !event.total) {
          return;
        }
        options.onUploadProgress(Math.min(100, Math.round((event.loaded * 100) / event.total)));
      },
    },
  );
  return data.data;
}

export async function getPayrollReceipts(
  filters: PayrollReceiptFilters = {},
): Promise<PaginatedResponse<PayrollReceiptListItem>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<PayrollReceiptListItem>>(
    "payroll-receipts",
    { params: toApiListParams(filters) },
  );
  return data;
}

export async function getPayrollReceiptById(id: string): Promise<PayrollReceiptDetail> {
  const { data } = await scopedApiClient.get<SingleResponse<PayrollReceiptDetail>>(
    `payroll-receipts/${id}`,
  );
  return data.data;
}

export function getPayrollReceiptContentUrl(
  id: string,
  disposition: "inline" | "attachment" = "attachment",
): string {
  return `payroll-receipts/${id}/content?disposition=${disposition}`;
}

export async function downloadPayrollReceiptContent(
  id: string,
  disposition: "inline" | "attachment" = "attachment",
): Promise<{ blob: Blob; fileName: string; contentType: string }> {
  const response = await scopedApiClient.get<Blob>(getPayrollReceiptContentUrl(id, disposition), {
    responseType: "blob",
    timeout: 60_000,
  });
  const headerType = String(response.headers["content-type"] ?? "").split(";")[0]?.trim();
  const contentType =
    headerType && headerType !== "application/octet-stream"
      ? headerType
      : response.data.type || "application/octet-stream";
  const blob =
    response.data.type === contentType
      ? response.data
      : new Blob([response.data], { type: contentType });

  const dispositionHeader = String(response.headers["content-disposition"] ?? "");
  const starMatch = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(dispositionHeader);
  const plainMatch = /filename\s*=\s*"([^"]+)"/i.exec(dispositionHeader);
  let fileName = "recibo.pdf";
  if (starMatch?.[1]) {
    try {
      fileName = decodeURIComponent(starMatch[1]);
    } catch {
      fileName = starMatch[1];
    }
  } else if (plainMatch?.[1]) {
    fileName = plainMatch[1];
  }

  return { blob, fileName, contentType };
}

export async function replacePayrollReceipt(
  id: string,
  file: File,
  options?: {
    idempotencyKey?: string;
    onUploadProgress?: (percent: number) => void;
  },
): Promise<PayrollReceiptDetail> {
  const formData = new FormData();
  formData.append("file", file);
  const idempotencyKey = options?.idempotencyKey ?? crypto.randomUUID();
  const { data } = await scopedApiClient.post<SingleResponse<PayrollReceiptDetail>>(
    `payroll-receipts/${id}/replace`,
    formData,
    {
      timeout: 120_000,
      headers: { "Idempotency-Key": idempotencyKey },
      onUploadProgress: (event) => {
        if (!options?.onUploadProgress || !event.total) {
          return;
        }
        options.onUploadProgress(Math.min(100, Math.round((event.loaded * 100) / event.total)));
      },
    },
  );
  return data.data;
}

export async function deletePayrollReceipt(id: string): Promise<PayrollReceiptDetail> {
  const { data } = await scopedApiClient.delete<SingleResponse<PayrollReceiptDetail>>(
    `payroll-receipts/${id}`,
  );
  return data.data;
}

export async function reconcilePayrollReceiptAssociation(
  id: string,
): Promise<PayrollReceiptDetail> {
  const { data } = await scopedApiClient.post<SingleResponse<PayrollReceiptDetail>>(
    `payroll-receipts/${id}/reconcile-association`,
  );
  return data.data;
}
