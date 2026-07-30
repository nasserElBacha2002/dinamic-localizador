import type { AbsenceAttachmentPolicy } from "../types/absence-attachment";

export const resolveAttachmentPolicy = (input: {
  attachmentPolicy?: AbsenceAttachmentPolicy | string | null;
  requiresAttachment?: boolean | null;
}): AbsenceAttachmentPolicy => {
  const raw = input.attachmentPolicy;
  if (raw === "FORBIDDEN" || raw === "OPTIONAL" || raw === "REQUIRED") {
    return raw;
  }
  return input.requiresAttachment ? "REQUIRED" : "OPTIONAL";
};

export const isAttachmentPolicySatisfied = (
  policy: AbsenceAttachmentPolicy,
  availableCount: number,
): boolean => {
  if (policy === "REQUIRED") {
    return availableCount >= 1;
  }
  if (policy === "FORBIDDEN") {
    return availableCount === 0;
  }
  return true;
};
