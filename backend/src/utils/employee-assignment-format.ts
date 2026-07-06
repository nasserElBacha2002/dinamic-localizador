import type { AssignmentConfirmationStatus } from "../constants/assignment-confirmation";
import type { PunctualityStatus } from "../types/domain";
import type { EmployeeAssignedOperation } from "../types/employee-assignment-query";
import { formatLocalTime, punctualityLabel } from "./attendance-validation";

export const NO_TODAY_ASSIGNMENTS_MESSAGE = "No tenés inventarios asignados para hoy.";
export const NO_UPCOMING_ASSIGNMENTS_MESSAGE = "No tenés próximos inventarios asignados.";
export const NO_CONFIRMABLE_ASSIGNMENTS_MESSAGE =
  "No tenés inventarios próximos para confirmar asistencia.";
export const NO_UNAVAILABILITY_ASSIGNMENTS_MESSAGE =
  "No tenés inventarios próximos para reportar no disponibilidad.";
export const PAST_ASSIGNMENT_MESSAGE =
  "Ese inventario ya comenzó o finalizó. No se puede modificar desde WhatsApp.";

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

export const formatAssignmentLocationLines = (assignment: EmployeeAssignedOperation): string[] => {
  const lines = [`Dirección: ${formatAssignmentAddress(assignment)}`];
  const mapUrl = buildGoogleMapsSearchUrl(assignment);
  if (mapUrl) {
    lines.push(`Mapa: ${mapUrl}`);
  }
  return lines;
};

export const formatTodayAssignmentBlock = (
  assignment: EmployeeAssignedOperation,
  index: number,
  timeZone: string,
  includeAttendance: boolean,
): string[] => {
  const lines = [
    `${index}. ${assignment.serviceName}`,
    `   Horario: ${formatAssignmentSchedule(assignment, timeZone)}`,
    ...formatAssignmentLocationLines(assignment).map((line) => `   ${line}`),
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
  `${index}. ${assignment.serviceName}`,
  `   Fecha: ${formatAssignmentDate(assignment, timeZone)}`,
  `   Horario: ${formatAssignmentSchedule(assignment, timeZone)}`,
  ...formatAssignmentLocationLines(assignment).map((line) => `   ${line}`),
];

export const formatUpcomingSelectionLine = (
  assignment: EmployeeAssignedOperation,
  index: number,
  timeZone: string,
): string =>
  `${index}. ${assignment.serviceName} — ${formatAssignmentDateTimeLine(assignment, timeZone)}`;
