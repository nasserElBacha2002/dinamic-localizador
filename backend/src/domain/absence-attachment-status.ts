import { AppError } from "../errors/app-error";
import type { AbsenceAttachmentStatus } from "../types/absence-attachment";

const ALLOWED: Record<AbsenceAttachmentStatus, readonly AbsenceAttachmentStatus[]> = {
  PENDING_UPLOAD: ["UPLOADING", "FAILED", "PENDING_DELETE", "DELETED"],
  UPLOADING: ["AVAILABLE", "FAILED", "PENDING_DELETE"],
  AVAILABLE: ["PENDING_DELETE"],
  QUARANTINED: ["AVAILABLE", "REJECTED", "PENDING_DELETE"],
  REJECTED: ["PENDING_DELETE", "DELETED"],
  FAILED: ["PENDING_UPLOAD", "PENDING_DELETE", "DELETED"],
  PENDING_DELETE: ["DELETED", "PENDING_DELETE"],
  DELETED: [],
};

export const assertAttachmentStatusTransition = (
  from: AbsenceAttachmentStatus,
  to: AbsenceAttachmentStatus,
): void => {
  if (from === to) {
    return;
  }
  const allowed = ALLOWED[from] ?? [];
  if (!allowed.includes(to)) {
    throw new AppError(
      409,
      "ATTACHMENT_INVALID_TRANSITION",
      `Transición de adjunto no permitida: ${from} → ${to}`,
    );
  }
};
