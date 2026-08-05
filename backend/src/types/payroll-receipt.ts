export const PAYROLL_RECEIPT_STORAGE_PROVIDER = "GOOGLE_CLOUD_STORAGE" as const;

export type PayrollReceiptBatchStatus =
  | "DRAFT"
  | "PROCESSING"
  | "COMPLETED"
  | "COMPLETED_WITH_ERRORS"
  | "FAILED";

export type PayrollReceiptStatus =
  | "PENDING"
  | "UPLOADING"
  | "ASSOCIATED"
  | "DOCUMENT_NOT_FOUND"
  | "INVALID_DOCUMENT"
  | "AMBIGUOUS_DOCUMENT"
  | "EMPLOYEE_NOT_FOUND"
  | "EMPLOYEE_DOCUMENT_AMBIGUOUS"
  | "DUPLICATE"
  | "UPLOAD_FAILED"
  | "FAILED"
  | "REPLACED"
  | "DELETED";

export interface PayrollReceiptBatch {
  id: string;
  companyId: string;
  year: number;
  month: number;
  status: PayrollReceiptBatchStatus;
  totalFiles: number;
  processedFiles: number;
  associatedFiles: number;
  failedFiles: number;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollReceipt {
  id: string;
  companyId: string;
  batchId: string;
  employeeId: string | null;
  year: number;
  month: number;
  originalFilename: string;
  storageProvider: typeof PAYROLL_RECEIPT_STORAGE_PROVIDER;
  storageBucket: string | null;
  storageObjectKey: string | null;
  objectGeneration: string | null;
  detectedDocument: string | null;
  normalizedDocument: string | null;
  status: PayrollReceiptStatus;
  errorCode: string | null;
  errorMessage: string | null;
  mimeType: string | null;
  fileSize: number | null;
  checksumSha256: string | null;
  idempotencyKey: string | null;
  uploadedByUserId: string | null;
  replacedReceiptId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedByUserId: string | null;
  /** Joined employee name when listing. */
  employeeName?: string | null;
}

export type PayrollReceiptBatchDto = PayrollReceiptBatch;

export type PayrollReceiptDto = Omit<
  PayrollReceipt,
  "storageBucket" | "storageObjectKey" | "objectGeneration" | "checksumSha256"
> & {
  hasFile: boolean;
};

export const toPayrollReceiptDto = (row: PayrollReceipt): PayrollReceiptDto => {
  const {
    storageBucket: _b,
    storageObjectKey: _k,
    objectGeneration: _g,
    checksumSha256: _c,
    ...rest
  } = row;
  return {
    ...rest,
    hasFile: Boolean(row.storageObjectKey && row.status === "ASSOCIATED"),
  };
};

export const toPayrollReceiptBatchDto = (row: PayrollReceiptBatch): PayrollReceiptBatchDto => row;
