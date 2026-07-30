export const absenceStatusLabels = {
  PENDING: "Pendiente",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada",
  NEEDS_INFO: "Requiere información",
} as const;

export const absenceTypeLabels = {
  VACATION: "Vacaciones",
  STUDY_DAY: "Día de estudio",
  SICK_LEAVE: "Salud",
  PERSONAL_PROCEDURE: "Trámite personal",
  JUSTIFIED_ABSENCE: "Ausencia justificada",
  UNJUSTIFIED_ABSENCE: "Ausencia injustificada",
  SPECIAL_LEAVE: "Licencia especial",
  OTHER: "Otro",
} as const;

export const absenceRequestedViaLabels = {
  WHATSAPP: "WhatsApp",
  ADMIN: "Administración",
} as const;

export const absenceEventTypeLabels = {
  CREATED: "Creada",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  NEEDS_INFO: "Requiere información",
  CANCELLED: "Cancelada",
  UPDATED: "Actualizada",
  RESUBMITTED: "Reenviada",
} as const;

export const absenceAttachmentPolicyLabels = {
  FORBIDDEN: "No admite adjuntos",
  OPTIONAL: "Adjuntos opcionales",
  REQUIRED: "Adjuntos obligatorios",
} as const;

export const absenceAttachmentStatusLabels = {
  PENDING_UPLOAD: "Pendiente de carga",
  UPLOADING: "Cargando",
  AVAILABLE: "Disponible",
  QUARANTINED: "En cuarentena",
  REJECTED: "Rechazado",
  FAILED: "Fallido",
  PENDING_DELETE: "Pendiente de baja",
  DELETED: "Eliminado",
} as const;

export function formatAbsenceDate(dateValue: string): string {
  const [year, month, day] = dateValue.split("-");
  return `${day}/${month}/${year}`;
}

export function formatAttachmentSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
