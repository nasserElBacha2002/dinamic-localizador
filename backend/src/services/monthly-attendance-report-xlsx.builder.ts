import * as XLSX from "xlsx";
import type { MonthlyAttendanceReportDataset, MonthlyAttendanceIncident, MonthlyAttendanceMetrics } from "../types/monthly-attendance-report";

const pct = (value: number): string => `${value.toFixed(2)}%`;
const hours = (minutes: number): string => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
const labels: Record<string, string> = {
  LATE: "Llegada tarde", EARLY_CHECKOUT: "Salida anticipada", MISSING_CHECKIN: "No registró llegada",
  MISSING_CHECKOUT: "No registró salida", UNAVAILABLE: "Avisó que no asistiría",
  CONFIRMED_BUT_ABSENT: "Confirmó asistencia pero finalmente faltó", UNANNOUNCED_ABSENCE: "Falta sin aviso",
  PENDING_REVIEW: "Pendiente de revisión", REJECTED_ATTENDANCE: "Asistencia rechazada", OUTSIDE_GEOFENCE: "Fuera de geocerca",
};
const metricHeaders = ["Jornadas programadas", "Presentes", "Ausentes", "Justificadas", "Presentismo %", "A tiempo", "Tardanzas", "Puntualidad %", "Salidas anticipadas", "Sin llegada", "Sin salida", "Avisó que no asistiría", "Confirmó y faltó", "Falta sin aviso", "Pendiente de revisión", "Rechazadas", "Fuera de geocerca", "Minutos trabajados", "Horas trabajadas", "Minutos adicionales", "Horas adicionales"];
const metricValues = (m: MonthlyAttendanceMetrics): unknown[] => [m.scheduledWorkdays, m.presentWorkdays, m.absentWorkdays, m.justifiedWorkdays, pct(m.attendanceRate), m.onTimeWorkdays, m.lateWorkdays, pct(m.punctualityRate), m.earlyCheckoutWorkdays, m.missingCheckinWorkdays, m.missingCheckoutWorkdays, m.notifiedUnavailableWorkdays, m.confirmedButAbsentWorkdays, m.unannouncedAbsenceWorkdays, m.pendingReviewAttendances, m.rejectedAttendances, m.outsideGeofenceAttendances, m.workedMinutes, hours(m.workedMinutes), m.extraWorkedMinutes, hours(m.extraWorkedMinutes)];

export const buildMonthlyAttendanceXlsx = (dataset: MonthlyAttendanceReportDataset): Buffer => {
  const workbook = XLSX.utils.book_new();
  const summary = [["Período", `${dataset.period.year}-${String(dataset.period.month).padStart(2, "0")}`], ["Zona horaria", dataset.period.timezone], [], ["Métrica", "Valor"], ...metricHeaders.map((header, index) => [header, metricValues(dataset.summary)[index]])];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summary), "Resumen");
  const employeeRows = [ ["Empleado", ...metricHeaders], ...dataset.employees.map((employee) => [employee.employeeName, ...metricValues(employee)]) ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(employeeRows), "Empleados");
  const serviceRows = [["Servicio", ...metricHeaders], ...dataset.services.map((service) => [service.serviceName, ...metricValues(service)])];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(serviceRows), "Servicios");
  const incidentRows = [["Fecha", "Empleado", "Servicio", "Operación", "Turno", "Incidencia", "Horario esperado", "Horario real", "Minutos de diferencia", "Dato relevante"], ...dataset.incidents.map((incident: MonthlyAttendanceIncident) => [incident.workDate, incident.employeeName, incident.serviceName, incident.operationId, incident.shiftNameSnapshot ?? "", labels[incident.type] ?? incident.type, incident.checkInAt ?? "", incident.checkOutAt ?? "", "", incident.validationStatus ?? incident.locationStatus ?? ""])];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(incidentRows), "Incidencias");
  const hourRows = [["Empleado", "Servicio", "Jornadas", "Minutos trabajados", "Horas trabajadas", "Minutos adicionales", "Horas adicionales"], ...dataset.employees.flatMap((employee) => {
    const services = dataset.services.length ? dataset.services : [{ serviceName: "" }];
    return services.map((service) => [employee.employeeName, service.serviceName, employee.scheduledWorkdays, employee.workedMinutes, hours(employee.workedMinutes), employee.extraWorkedMinutes, hours(employee.extraWorkedMinutes)]);
  })];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(hourRows), "Horas");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};
