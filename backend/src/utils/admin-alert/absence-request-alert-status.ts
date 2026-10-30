import { ABSENCE_REQUEST_PENDING_STATUS_LABEL } from "../../constants/admin-alert";

const STATUS_LABELS: Record<string, string> = {
  PENDING: ABSENCE_REQUEST_PENDING_STATUS_LABEL,
  APPROVED: "Aprobada",
  NEEDS_INFO: "Requiere información",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada",
};

/** WhatsApp-safe status copy for absence creation operational alerts. */
export const resolveAbsenceRequestAlertStatusLabel = (status: string): string =>
  STATUS_LABELS[status] ?? ABSENCE_REQUEST_PENDING_STATUS_LABEL;
