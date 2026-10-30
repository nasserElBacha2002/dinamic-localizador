export const getAttendanceIncidentLabel = (code: string): string => ({
  LATE: "Llegó tarde", EARLY_LEAVE: "Salida anticipada", EARLY_CHECKOUT: "Salida anticipada",
  MISSING_CHECKIN: "No registró llegada", MISSING_CHECKOUT: "No registró salida",
  UNAVAILABLE: "Avisó que no asistiría", PENDING_CONFIRMATION: "Pendiente de confirmación",
  INCOMPLETE: "Jornada abierta", PENDING_REVIEW: "Pendiente de revisión",
  REJECTED: "Asistencia rechazada", REJECTED_ATTENDANCE: "Asistencia rechazada",
  OUTSIDE_GEOFENCE: "Fuera de geocerca", CONFIRMED_BUT_ABSENT: "Confirmó asistencia pero faltó",
  UNANNOUNCED_ABSENCE: "Falta sin aviso",
}[code] ?? code);

export const getAttendanceIncidentPriority = (code: string): number => ({
  REJECTED: 1, REJECTED_ATTENDANCE: 1, PENDING_REVIEW: 2, OUTSIDE_GEOFENCE: 3,
  CONFIRMED_BUT_ABSENT: 4, UNANNOUNCED_ABSENCE: 5, MISSING_CHECKIN: 6,
  MISSING_CHECKOUT: 7, EARLY_LEAVE: 8, EARLY_CHECKOUT: 8, LATE: 9, UNAVAILABLE: 10,
}[code] ?? 99);
