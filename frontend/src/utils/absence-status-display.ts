import type { AbsenceRequestStatus } from "../types/absence";
import type { StatusBadgeTone } from "../design-system";

export function absenceStatusTone(status: AbsenceRequestStatus): StatusBadgeTone {
  switch (status) {
    case "PENDING":
      return "warning";
    case "NEEDS_INFO":
      return "info";
    case "APPROVED":
      return "success";
    case "REJECTED":
      return "danger";
    case "CANCELLED":
      return "neutral";
    default:
      return "neutral";
  }
}
