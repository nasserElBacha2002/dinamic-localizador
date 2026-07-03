import type { AssignmentConfirmationStatus } from "../constants/assignment-confirmation";
import type { PunctualityStatus } from "../types/domain";
import type { EmployeeAssignedInventory } from "../types/employee-assignment-query";
import { formatLocalTime, punctualityLabel } from "./attendance-validation";

export const NO_TODAY_ASSIGNMENTS_MESSAGE = "No tenés inventarios asignados para hoy.";
export const NO_UPCOMING_ASSIGNMENTS_MESSAGE = "No tenés próximos inventarios asignados.";
export const NO_CONFIRMABLE_ASSIGNMENTS_MESSAGE =
  "No tenés inventarios próximos para confirmar asistencia.";
export const NO_UNAVAILABILITY_ASSIGNMENTS_MESSAGE =
  "No tenés inventarios próximos para reportar no disponibilidad.";
export const PAST_ASSIGNMENT_MESSAGE =
  "Ese inventario ya comenzó o finalizó. No se puede modificar desde WhatsApp.";

export const formatAssignmentAddress = (assignment: EmployeeAssignedInventory): string => {
  if (assignment.storeAddress?.trim()) {
    return assignment.storeAddress.trim();
  }
  return "no disponible";
};

export const buildGoogleMapsSearchUrl = (assignment: EmployeeAssignedInventory): string | null => {
  if (
    assignment.storeLatitude !== null &&
    assignment.storeLongitude !== null &&
    Number.isFinite(assignment.storeLatitude) &&
    Number.isFinite(assignment.storeLongitude)
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${assignment.storeLatitude},${assignment.storeLongitude}`;
  }

  if (assignment.storeAddress?.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(assignment.storeAddress.trim())}`;
  }

  return null;
};

export const formatAssignmentSchedule = (
  assignment: EmployeeAssignedInventory,
  timeZone: string,
): string => {
  const start = formatLocalTime(assignment.scheduledStart, timeZone);
  const end = formatLocalTime(assignment.scheduledEnd, timeZone);
  return `${start} a ${end}`;
};

export const formatAssignmentDate = (
  assignment: EmployeeAssignedInventory,
  timeZone: string,
): string =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(assignment.scheduledStart));

export const formatAssignmentDateTimeLine = (
  assignment: EmployeeAssignedInventory,
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

const formatAttendanceArrival = (assignment: EmployeeAssignedInventory, timeZone: string): string => {
  if (!assignment.attendanceReceivedAt) {
    return "pendiente";
  }
  return formatLocalTime(assignment.attendanceReceivedAt, timeZone);
};

const formatAttendanceCheckout = (assignment: EmployeeAssignedInventory, timeZone: string): string => {
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

export const formatAssignmentLocationLines = (assignment: EmployeeAssignedInventory): string[] => {
  const lines = [`Dirección: ${formatAssignmentAddress(assignment)}`];
  const mapUrl = buildGoogleMapsSearchUrl(assignment);
  if (mapUrl) {
    lines.push(`Mapa: ${mapUrl}`);
  }
  return lines;
};

export const formatTodayAssignmentBlock = (
  assignment: EmployeeAssignedInventory,
  index: number,
  timeZone: string,
  includeAttendance: boolean,
): string[] => {
  const lines = [
    `${index}. ${assignment.storeName}`,
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
  assignment: EmployeeAssignedInventory,
  index: number,
  timeZone: string,
): string[] => [
  `${index}. ${assignment.storeName}`,
  `   Fecha: ${formatAssignmentDate(assignment, timeZone)}`,
  `   Horario: ${formatAssignmentSchedule(assignment, timeZone)}`,
  ...formatAssignmentLocationLines(assignment).map((line) => `   ${line}`),
];

export const formatUpcomingSelectionLine = (
  assignment: EmployeeAssignedInventory,
  index: number,
  timeZone: string,
): string =>
  `${index}. ${assignment.storeName} — ${formatAssignmentDateTimeLine(assignment, timeZone)}`;
