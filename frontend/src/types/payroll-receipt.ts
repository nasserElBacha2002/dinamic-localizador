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

export interface PayrollReceiptListItem {
  id: string;
  companyId: string;
  batchId: string;
  employeeId: string | null;
  year: number;
  month: number;
  originalFilename: string;
  storageProvider: "GOOGLE_CLOUD_STORAGE";
  detectedDocument: string | null;
  normalizedDocument: string | null;
  status: PayrollReceiptStatus;
  errorCode: string | null;
  errorMessage: string | null;
  mimeType: string | null;
  fileSize: number | null;
  idempotencyKey: string | null;
  uploadedByUserId: string | null;
  replacedReceiptId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedByUserId: string | null;
  hasFile: boolean;
  /** Joined employee name when listing. */
  employeeName?: string | null;
}

export type PayrollReceiptDetail = PayrollReceiptListItem;

export interface CreatePayrollReceiptBatchInput {
  year: number;
  month: number;
}

export interface PayrollReceiptFilters {
  page?: number;
  limit?: number;
  year?: number;
  month?: number;
  /** Legacy singular; prefer `employeeIds` (comma-separated / multi). */
  employeeId?: string;
  employeeIds?: string[];
  status?: PayrollReceiptStatus;
  search?: string;
  /** CUIL / document filter (API field `document`). */
  document?: string;
  batchId?: string;
}

export interface PayrollReceiptBatchFilters {
  page?: number;
  limit?: number;
  year?: number;
  month?: number;
}
