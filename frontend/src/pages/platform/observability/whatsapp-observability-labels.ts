import type { StatusBadgeTone } from "../../../design-system";
import type {
  WhatsappConversationStatus,
  WhatsappFlowExecutionStatus,
  WhatsappFlowStepStatus,
} from "../../../types/whatsapp-observability";

export const whatsappConversationStatusLabels: Record<WhatsappConversationStatus, string> = {
  ACTIVE: "Activa",
  COMPLETED: "Completada",
  WARNING: "Advertencia",
  ERROR: "Error",
};

export const whatsappFlowExecutionStatusLabels: Record<WhatsappFlowExecutionStatus, string> = {
  STARTED: "Iniciada",
  COMPLETED: "Completada",
  FAILED: "Fallida",
  PARTIALLY_RECORDED: "Parcial",
};

export const whatsappFlowStepStatusLabels: Record<WhatsappFlowStepStatus, string> = {
  SUCCESS: "Éxito",
  SKIPPED: "Omitido",
  REJECTED: "Rechazado",
  WARNING: "Advertencia",
  FAILED: "Fallido",
};

export function conversationStatusTone(status: WhatsappConversationStatus): StatusBadgeTone {
  switch (status) {
    case "ACTIVE":
      return "info";
    case "COMPLETED":
      return "success";
    case "WARNING":
      return "warning";
    case "ERROR":
      return "danger";
    default:
      return "neutral";
  }
}

export function flowExecutionStatusTone(status: WhatsappFlowExecutionStatus): StatusBadgeTone {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "FAILED":
      return "danger";
    case "PARTIALLY_RECORDED":
      return "warning";
    default:
      return "neutral";
  }
}

export function flowStepStatusTone(status: WhatsappFlowStepStatus): StatusBadgeTone {
  switch (status) {
    case "SUCCESS":
      return "success";
    case "FAILED":
    case "REJECTED":
      return "danger";
    case "WARNING":
      return "warning";
    default:
      return "neutral";
  }
}

export const whatsappHasErrorOptions = [
  { value: "", label: "Todos" },
  { value: "true", label: "Con errores" },
  { value: "false", label: "Sin errores" },
];

export const whatsappConversationStatusOptions = [
  { value: "", label: "Todos" },
  ...Object.entries(whatsappConversationStatusLabels).map(([value, label]) => ({ value, label })),
];
