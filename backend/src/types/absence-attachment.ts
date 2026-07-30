export const ABSENCE_ATTACHMENT_POLICIES = ["FORBIDDEN", "OPTIONAL", "REQUIRED"] as const;
export type AbsenceAttachmentPolicy = (typeof ABSENCE_ATTACHMENT_POLICIES)[number];

export const ABSENCE_ATTACHMENT_STATUSES = [
  "PENDING_UPLOAD",
  "UPLOADING",
  "AVAILABLE",
  "QUARANTINED",
  "REJECTED",
  "FAILED",
  "PENDING_DELETE",
  "DELETED",
] as const;
export type AbsenceAttachmentStatus = (typeof ABSENCE_ATTACHMENT_STATUSES)[number];

export const ABSENCE_ATTACHMENT_SCAN_STATUSES = [
  "UNSCANNED",
  "CLEAN",
  "INFECTED",
  "SKIPPED",
] as const;
export type AbsenceAttachmentScanStatus = (typeof ABSENCE_ATTACHMENT_SCAN_STATUSES)[number];

export const ABSENCE_ATTACHMENT_SOURCES = ["ADMIN", "WHATSAPP", "EMPLOYEE"] as const;
export type AbsenceAttachmentSource = (typeof ABSENCE_ATTACHMENT_SOURCES)[number];

export const ABSENCE_ATTACHMENT_STORAGE_PROVIDER = "GOOGLE_CLOUD_STORAGE" as const;

export const ABSENCE_ATTACHMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type AbsenceAttachmentAllowedMime =
  (typeof ABSENCE_ATTACHMENT_ALLOWED_MIME_TYPES)[number];

export interface AbsenceRequestAttachment {
  id: string;
  companyId: string;
  absenceRequestId: string | null;
  draftId: string | null;
  storageProvider: typeof ABSENCE_ATTACHMENT_STORAGE_PROVIDER;
  bucketName: string;
  objectKey: string;
  objectGeneration: string | null;
  originalFileName: string;
  normalizedFileName: string;
  declaredContentType: string;
  detectedContentType: string;
  sizeBytes: number;
  checksumSha256: string;
  status: AbsenceAttachmentStatus;
  scanStatus: AbsenceAttachmentScanStatus;
  uploadedByUserId: string | null;
  uploadedByEmployeeId: string | null;
  source: AbsenceAttachmentSource;
  twilioMessageSid: string | null;
  twilioMediaIndex: number | null;
  idempotencyKey: string | null;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  availableAt: string | null;
  deletedAt: string | null;
  deletedByUserId: string | null;
  deletionReason: string | null;
}

/** Safe DTO for API/frontend — never exposes bucket or object key. */
export interface AbsenceRequestAttachmentDto {
  id: string;
  absenceRequestId: string | null;
  draftId: string | null;
  originalFileName: string;
  normalizedFileName: string;
  detectedContentType: string;
  sizeBytes: number;
  status: AbsenceAttachmentStatus;
  scanStatus: AbsenceAttachmentScanStatus;
  source: AbsenceAttachmentSource;
  uploadedByUserId: string | null;
  uploadedByEmployeeId: string | null;
  createdAt: string;
  updatedAt: string;
  availableAt: string | null;
}

export const toAbsenceAttachmentDto = (
  row: AbsenceRequestAttachment,
): AbsenceRequestAttachmentDto => ({
  id: row.id,
  absenceRequestId: row.absenceRequestId,
  draftId: row.draftId,
  originalFileName: row.originalFileName,
  normalizedFileName: row.normalizedFileName,
  detectedContentType: row.detectedContentType,
  sizeBytes: row.sizeBytes,
  status: row.status,
  scanStatus: row.scanStatus,
  source: row.source,
  uploadedByUserId: row.uploadedByUserId,
  uploadedByEmployeeId: row.uploadedByEmployeeId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  availableAt: row.availableAt,
});
