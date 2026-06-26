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
} as const;

export function formatAbsenceDate(dateValue: string): string {
  const [year, month, day] = dateValue.split("-");
  return `${day}/${month}/${year}`;
}
