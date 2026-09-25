import * as XLSX from "xlsx";
import type { DailyAttendanceReportPayload } from "../types/daily-attendance-report";

const labels: Record<string, string> = {
  MISSING_CHECKIN: "No registró llegada", MISSING_CHECKOUT: "No registró salida",
  LATE: "Llegó tarde", EARLY_LEAVE: "Salida anticipada", UNAVAILABLE: "Avisó que no asistiría",
  PENDING_CONFIRMATION: "Pendiente de confirmación", INCOMPLETE: "Jornada abierta",
  PENDING_REVIEW: "Pendiente de revisión", REJECTED: "Asistencia rechazada",
  OUTSIDE_GEOFENCE: "Fuera de geocerca", CONFIRMED_BUT_ABSENT: "Confirmó asistencia pero faltó",
  UNANNOUNCED_ABSENCE: "Falta sin aviso",
};

const hhmm = (value: string | null | undefined): string => value ? new Date(value).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }) : "";

export const buildDailyAttendanceReportXlsx = (payload: DailyAttendanceReportPayload): Buffer => {
  const wb = XLSX.utils.book_new();
  const workdays = payload.workdays ?? [];
  const t = payload.totals;
  const summary = [
    ["Fecha", payload.reportDate], ["Zona horaria", payload.timezoneId], ["Jornadas programadas", t.scheduledEmployeesCount],
    ["Presentes", t.presentCount], ["Ausentes", Math.max(0, t.scheduledEmployeesCount - t.presentCount - t.justifiedCount)],
    ["Justificadas", t.justifiedCount], ["Tardanzas", t.lateCount], ["Salidas anticipadas", t.earlyLeaveCount],
    ["Sin llegada", t.missingCheckinCount], ["Sin salida", t.missingCheckoutCount], ["Avisó que no asistiría", t.unavailableCount],
    ["Pendientes de confirmación", t.pendingConfirmationCount], ["Incidencias", payload.totalIncidentCount],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Resumen");
  const rows = workdays.map((w) => ({ Fecha: payload.reportDate, Empleado: w.employeeName, Servicio: w.serviceName, Operación: w.operationId, Estado: w.state,
    Confirmación: w.confirmationStatus ?? "", "Hora esperada de inicio": hhmm(w.expectedStartAt), "Hora de llegada": hhmm(w.receivedAt),
    "Hora esperada de salida": hhmm(w.expectedEndAt), "Hora de salida": hhmm(w.checkoutAt), Puntualidad: w.late ? "Tarde" : "A tiempo",
    Validación: w.validationStatus ?? "", Geocerca: "", "Observaciones": w.incomplete ? "Jornada abierta" : "" }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Jornadas");
  const incidents = payload.incidents.map((i) => ({ Fecha: payload.reportDate, Empleado: i.employeeName, Servicio: i.serviceName, Operación: i.operationId,
    Incidencia: labels[i.kind] ?? i.kind, "Horario esperado": hhmm(i.expectedStartAt ?? null), "Horario real": hhmm(i.actualAt ?? null),
    "Minutos de diferencia": i.differenceMinutes ?? "", Observación: i.detail }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incidents), "Incidencias");
  const byService = new Map<string, { jornadas: number; presentes: number; ausentes: number; tardanzas: number; anticipadas: number }>();
  for (const w of workdays) { const s = byService.get(w.serviceName) ?? { jornadas: 0, presentes: 0, ausentes: 0, tardanzas: 0, anticipadas: 0 }; s.jornadas++; if (w.present) s.presentes++; if (w.missingCheckin) s.ausentes++; if (w.late) s.tardanzas++; if (w.earlyLeave) s.anticipadas++; byService.set(w.serviceName, s); }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([...byService].map(([Servicio, v]) => ({ Servicio, Jornadas: v.jornadas, Presentes: v.presentes, Ausentes: v.ausentes, Tardanzas: v.tardanzas, "Salidas anticipadas": v.anticipadas }))), "Servicios");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
};

export const DAILY_XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
