import * as XLSX from "xlsx";
import type { DailyAttendanceReportPayload } from "../types/daily-attendance-report";
import { getAttendanceIncidentLabel } from "../utils/attendance-report-presentation";

const labels: Record<string, string> = {
  MISSING_CHECKIN: "No registró llegada", MISSING_CHECKOUT: "No registró salida",
  LATE: "Llegó tarde", EARLY_LEAVE: "Salida anticipada", UNAVAILABLE: "Avisó que no asistiría",
  PENDING_CONFIRMATION: "Pendiente de confirmación", INCOMPLETE: "Jornada abierta",
  PENDING_REVIEW: "Pendiente de revisión", REJECTED: "Asistencia rechazada",
  OUTSIDE_GEOFENCE: "Fuera de geocerca", CONFIRMED_BUT_ABSENT: "Confirmó asistencia pero faltó",
  UNANNOUNCED_ABSENCE: "Falta sin aviso",
};

const hhmm = (value: string | null | undefined, timezoneId: string): string => value ? new Date(value).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezoneId }) : "";

export const buildDailyAttendanceReportXlsx = (payload: DailyAttendanceReportPayload): Buffer => {
  const wb = XLSX.utils.book_new();
  const workdays = payload.workdays ?? [];
  const t = payload.totals;
  const summary = [
    ["Fecha", payload.reportDate], ["Zona horaria", payload.timezoneId], ["Jornadas programadas", t.scheduledWorkdays],
    ["Presentes", t.presentWorkdays], ["Ausentes", t.absentWorkdays],
    ["Justificadas", t.justifiedWorkdays], ["Tardanzas", t.lateCount], ["Salidas anticipadas", t.earlyLeaveCount],
    ["Sin llegada", t.missingCheckinCount], ["Sin salida", t.missingCheckoutCount], ["Avisó que no asistiría", t.unavailableCount],
    ["Avisó que no asistiría", t.unavailableCount], ["Confirmó y faltó", t.confirmedButAbsentWorkdays], ["Falta sin aviso", t.unannouncedAbsenceWorkdays], ["Pendiente de revisión", t.pendingReviewAttendances], ["Rechazadas", t.rejectedAttendances], ["Fuera de geocerca", t.outsideGeofenceAttendances], ["Minutos trabajados", t.workedMinutes], ["Horas trabajadas", `${Math.floor(t.workedMinutes / 60)}h ${t.workedMinutes % 60}m`], ["Minutos adicionales", t.extraWorkedMinutes], ["Horas adicionales", `${Math.floor(t.extraWorkedMinutes / 60)}h ${t.extraWorkedMinutes % 60}m`], ["Incidencias", payload.totalIncidentCount],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Resumen");
  const rows = workdays.map((w) => ({ Fecha: payload.reportDate, Empleado: w.employeeName, Servicio: w.serviceName, Operación: w.operationId, Estado: w.state,
    Turno: w.shiftNameSnapshot ?? w.operationShiftId ?? "", Confirmación: w.confirmationStatus ?? "", "Hora esperada de inicio": hhmm(w.expectedStartAt, payload.timezoneId), "Hora de llegada": hhmm(w.receivedAt, payload.timezoneId),
    "Hora esperada de salida": hhmm(w.expectedEndAt, payload.timezoneId), "Hora de salida": hhmm(w.checkoutAt, payload.timezoneId), Puntualidad: w.late ? "Tarde" : "A tiempo",
    Validación: w.validationStatus === "PENDING_REVIEW" ? "Pendiente de revisión" : w.validationStatus === "REJECTED" ? "Asistencia rechazada" : w.validationStatus ?? "", Geocerca: w.locationStatus === "OUTSIDE_GEOFENCE" ? "Fuera de geocerca" : w.locationStatus ?? "", "Minutos trabajados": w.workedMinutes ?? "", "Horas trabajadas": `${Math.floor((w.workedMinutes ?? 0) / 60)}h ${(w.workedMinutes ?? 0) % 60}m`, "Minutos adicionales": w.extraWorkedMinutes ?? "", "Horas adicionales": `${Math.floor((w.extraWorkedMinutes ?? 0) / 60)}h ${(w.extraWorkedMinutes ?? 0) % 60}m`, "Observaciones": w.incomplete ? "Jornada abierta" : "" }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Jornadas");
  const incidents = payload.incidents.map((i) => ({ Fecha: payload.reportDate, Empleado: i.employeeName, Servicio: i.serviceName, Operación: i.operationId,
    Turno: (payload.workdays ?? []).find((w) => w.employeeWorkdayId === i.employeeWorkdayId)?.shiftNameSnapshot ?? "", Incidencia: getAttendanceIncidentLabel(i.kind), "Horario esperado": hhmm(i.expectedStartAt ?? null, payload.timezoneId), "Horario real": hhmm(i.actualAt ?? null, payload.timezoneId),
    "Minutos de diferencia": i.differenceMinutes ?? "", Observación: i.detail }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incidents), "Incidencias");
  const byService = new Map<string, Record<string, number>>();
  for (const w of workdays) { const s = byService.get(w.serviceName) ?? { Jornadas: 0, Presentes: 0, Ausentes: 0, Justificadas: 0, Tardanzas: 0, "Salidas anticipadas": 0, "Sin llegada": 0, "Sin salida": 0, "Avisó que no asistiría": 0, "Confirmó y faltó": 0, "Falta sin aviso": 0, "Pendientes de revisión": 0, Rechazadas: 0, "Fuera de geocerca": 0, "Minutos trabajados": 0, "Minutos adicionales": 0 }; s.Jornadas++; if (w.present) s.Presentes++; if (w.missingCheckin) { s.Ausentes++; s["Sin llegada"]++; } if (w.justified) s.Justificadas++; if (w.late) s.Tardanzas++; if (w.earlyLeave) s["Salidas anticipadas"]++; if (w.missingCheckout) s["Sin salida"]++; if (w.unavailable) s["Avisó que no asistiría"]++; s["Minutos trabajados"] += w.workedMinutes ?? 0; s["Minutos adicionales"] += w.extraWorkedMinutes ?? 0; byService.set(w.serviceName, s); }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([...byService].map(([Servicio, v]) => ({ Servicio, ...v }))), "Servicios");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
};

export const DAILY_XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
