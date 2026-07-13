import type { AssignmentConfirmationStatus } from "../constants/assignment-confirmation";
import type { PunctualityStatus } from "../types/domain";
import type { EmployeeAssignedOperation } from "../types/employee-assignment-query";
import type { ServiceReferenceFields } from "./format-service-reference";
import { formatServiceReferenceFromFields } from "./format-service-reference";
import { formatLocalTime, punctualityLabel } from "./attendance-validation";

export const NO_TODAY_ASSIGNMENTS_MESSAGE = "No tenés trabajos asignados para hoy.";
export const NO_UPCOMING_ASSIGNMENTS_MESSAGE = "No tenés próximos trabajos asignados.";
export const NO_CONFIRMABLE_ASSIGNMENTS_MESSAGE =
  "No tenés trabajos próximos para confirmar asistencia.";
export const NO_UNAVAILABILITY_ASSIGNMENTS_MESSAGE =
  "No tenés trabajos próximos para reportar no disponibilidad.";
export const PAST_ASSIGNMENT_MESSAGE =
  "Ese trabajo ya comenzó o finalizó. No se puede modificar desde WhatsApp.";

export const formatAssignmentServiceReference = (
  assignment: ServiceReferenceFields,
): string => formatServiceReferenceFromFields(assignment);

export const formatAssignmentAddress = (assignment: EmployeeAssignedOperation): string => {
  if (assignment.serviceAddress?.trim()) {
    return assignment.serviceAddress.trim();
  }
  return "no disponible";
};

export const buildGoogleMapsSearchUrl = (assignment: EmployeeAssignedOperation): string | null => {
  if (
    assignment.serviceLatitude !== null &&
    assignment.serviceLongitude !== null &&
    Number.isFinite(assignment.serviceLatitude) &&
    Number.isFinite(assignment.serviceLongitude)
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${assignment.serviceLatitude},${assignment.serviceLongitude}`;
  }

  if (assignment.serviceAddress?.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(assignment.serviceAddress.trim())}`;
  }

  return null;
};

export const formatAssignmentSchedule = (
  assignment: EmployeeAssignedOperation,
  timeZone: string,
): string => {
  const start = formatLocalTime(assignment.scheduledStart, timeZone);
  const end = formatLocalTime(assignment.scheduledEnd, timeZone);
  return `${start} a ${end}`;
};

export const formatAssignmentDate = (
  assignment: EmployeeAssignedOperation,
  timeZone: string,
): string =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(assignment.scheduledStart));

export const formatAssignmentDateTimeLine = (
  assignment: EmployeeAssignedOperation,
  timeZone: string,
): string => `${formatAssignmentDate(assignment, timeZone)} — ${formatLocalTime(assignment.scheduledStart, timeZone)}`;

export const formatOperationScheduleLine = (scheduledStart: string, timeZone: string): string => {
  const date = new Intl.DateTimeFormat("es-AR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(scheduledStart));
  return `${date} — ${formatLocalTime(scheduledStart, timeZone)}`;
};

const confirmationStatusLabel = (status: AssignmentConfirmationStatus): string => {
  const labels: Record<AssignmentConfirmationStatus, string> = {
    PENDING: "Asignado",
    CONFIRMED: "Confirmado",
    UNAVAILABLE: "No disponible",
  };
  return labels[status];
};

const formatAttendanceArrival = (assignment: EmployeeAssignedOperation, timeZone: string): string => {
  if (!assignment.attendanceReceivedAt) {
    return "pendiente";
  }
  return formatLocalTime(assignment.attendanceReceivedAt, timeZone);
};

const formatAttendanceCheckout = (assignment: EmployeeAssignedOperation, timeZone: string): string => {
  if (!assignment.attendanceCheckoutAt) {
    return "pendiente";
  }
  return formatLocalTime(assignment.attendanceCheckoutAt, timeZone);
};

const formatAttendanceState = (punctualityStatus: PunctualityStatus | null): string | null => {
  if (!punctualityStatus) {
    return null;
  }
  return `Llegada ${punctualityLabel(punctualityStatus).toLowerCase()}`;
};

export const formatAssignmentMapLines = (assignment: EmployeeAssignedOperation): string[] => {
  const mapUrl = buildGoogleMapsSearchUrl(assignment);
  return mapUrl ? [`Mapa: ${mapUrl}`] : [];
};

export const formatAssignmentLocationLines = (assignment: EmployeeAssignedOperation): string[] => {
  const lines = [`Dirección: ${formatAssignmentAddress(assignment)}`];
  return [...lines, ...formatAssignmentMapLines(assignment)];
};

export const formatBotWorkdaySelectionLines = (
  index: number,
  fields: ServiceReferenceFields & {
    expectedStartAt: string;
    expectedEndAt: string | null;
    workDate: string;
  },
  timeZone: string,
  checkInAt?: string,
): string[] => {
  const scheduleLine = checkInAt
    ? `Llegada: ${formatLocalTime(checkInAt, timeZone)}`
    : formatWorkdayScheduleLine(fields, timeZone);
  return [`${index}. ${formatServiceReferenceFromFields(fields)}`, `   ${scheduleLine}`];
};

export const formatWorkdayScheduleLine = (
  workday: { expectedStartAt: string; expectedEndAt: string | null; workDate: string },
  timeZone: string,
): string => {
  const start = formatLocalTime(workday.expectedStartAt, timeZone);
  if (!workday.expectedEndAt) {
    return `${start}`;
  }
  const end = formatLocalTime(workday.expectedEndAt, timeZone);
  return `${start} a ${end}`;
};

export const formatBotOperationSelectionLines = (
  index: number,
  fields: ServiceReferenceFields & { scheduledStart: string },
  timeZone: string,
): string[] => [
  `${index}. ${formatServiceReferenceFromFields(fields)}`,
  `   ${formatOperationScheduleLine(fields.scheduledStart, timeZone)}`,
];

export const formatTodayAssignmentBlock = (
  assignment: EmployeeAssignedOperation,
  index: number,
  timeZone: string,
  includeAttendance: boolean,
): string[] => {
  const lines = [
    `${index}. ${formatAssignmentServiceReference(assignment)}`,
    `   Horario: ${formatAssignmentSchedule(assignment, timeZone)}`,
    ...formatAssignmentMapLines(assignment).map((line) => `   ${line}`),
    `   Estado: ${confirmationStatusLabel(assignment.confirmationStatus)}`,
  ];

  if (includeAttendance) {
    lines.push(`   Llegada: ${formatAttendanceArrival(assignment, timeZone)}`);
    lines.push(`   Salida: ${formatAttendanceCheckout(assignment, timeZone)}`);
    const attendanceState = formatAttendanceState(assignment.punctualityStatus);
    if (attendanceState) {
      lines.push(`   ${attendanceState}`);
    }
  }

  return lines;
};

export const formatUpcomingAssignmentBlock = (
  assignment: EmployeeAssignedOperation,
  index: number,
  timeZone: string,
): string[] => [
  `${index}. ${formatAssignmentServiceReference(assignment)}`,
  `   Fecha: ${formatAssignmentDate(assignment, timeZone)}`,
  `   Horario: ${formatAssignmentSchedule(assignment, timeZone)}`,
  ...formatAssignmentMapLines(assignment).map((line) => `   ${line}`),
];

export const formatUpcomingSelectionLine = (
  assignment: EmployeeAssignedOperation,
  index: number,
  timeZone: string,
): string =>
  formatBotOperationSelectionLines(index, assignment, timeZone).join("\n");
