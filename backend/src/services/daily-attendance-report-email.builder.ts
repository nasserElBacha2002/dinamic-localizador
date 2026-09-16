import {
  DAILY_ATTENDANCE_REPORT_MAX_INCIDENTS_IN_EMAIL,
} from "../constants/daily-attendance-report";
import type { DailyAttendanceReportPayload } from "../types/daily-attendance-report";
import { escapeHtml } from "../utils/daily-attendance-report-email";

export type DailyAttendanceReportEmailContent = {
  subject: string;
  text: string;
  html: string;
};

export const buildDailyAttendanceReportEmail = (
  payload: DailyAttendanceReportPayload,
): DailyAttendanceReportEmailContent => {
  const subject = `Reporte de asistencia ${payload.reportDate} — ${payload.companyName}`;
  const t = payload.totals;
  const truncated =
    payload.totalIncidentCount > DAILY_ATTENDANCE_REPORT_MAX_INCIDENTS_IN_EMAIL;
  const truncationNote = truncated
    ? `Mostrando ${payload.incidents.length} de ${payload.totalIncidentCount} incidencias.`
    : null;

  const textLines = [
    `Reporte diario de asistencia`,
    `Empresa: ${payload.companyName}`,
    `Fecha reportada: ${payload.reportDate} (${payload.timezoneId})`,
    `Evaluado en: ${payload.evaluatedAtIso}`,
    "",
    "Resumen",
    `- Jornadas/operaciones: ${t.operationsCount}`,
    `- Empleados programados: ${t.scheduledEmployeesCount}`,
    `- Con llegada: ${t.checkinCount}`,
    `- Con salida: ${t.checkoutCount}`,
    `- Presentes (con check-in válido): ${t.presentCount}`,
    `- Llegadas tarde: ${t.lateCount}`,
    `- Salidas anticipadas: ${t.earlyLeaveCount}`,
    `- No asistirá (informado): ${t.unavailableCount}`,
    `- Justificados: ${t.justifiedCount}`,
    `- Confirmación pendiente: ${t.pendingConfirmationCount}`,
    `- Sin llegada: ${t.missingCheckinCount}`,
    `- Sin salida: ${t.missingCheckoutCount}`,
    `- Incompletos al evaluar: ${t.incompleteCount}`,
    `- Incidencias totales: ${payload.totalIncidentCount}`,
    "",
    "Incidencias",
    ...(truncationNote ? [truncationNote] : []),
    ...(payload.incidents.length === 0
      ? ["(sin incidencias listadas)"]
      : payload.incidents.map(
          (i) => `- [${i.kind}] ${i.employeeName} @ ${i.serviceName}: ${i.detail}`,
        )),
    "",
    "Desglose por jornada",
    ...payload.operations.map(
      (o) =>
        `- ${o.serviceName}: programados=${o.scheduledEmployees} presente=${o.present} sin_llegada=${o.missingCheckin} sin_salida=${o.missingCheckout}`,
    ),
  ];

  const incidentRows = payload.incidents
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.kind)}</td><td>${escapeHtml(i.employeeName)}</td><td>${escapeHtml(i.serviceName)}</td><td>${escapeHtml(i.detail)}</td></tr>`,
    )
    .join("");

  const operationRows = payload.operations
    .map(
      (o) =>
        `<tr><td>${escapeHtml(o.serviceName)}</td><td>${o.scheduledEmployees}</td><td>${o.present}</td><td>${o.missingCheckin}</td><td>${o.missingCheckout}</td><td>${o.late}</td><td>${o.earlyLeave}</td><td>${o.unavailable}</td></tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(subject)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.45;margin:0;padding:16px;background:#f6f7f9}
.card{max-width:720px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px}
h1{font-size:18px;margin:0 0 8px}h2{font-size:15px;margin:20px 0 8px}
.meta{color:#4b5563;font-size:13px;margin-bottom:16px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.stat{background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px}
.stat b{display:block;font-size:18px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{border-bottom:1px solid #e5e7eb;text-align:left;padding:8px;vertical-align:top}
th{background:#f3f4f6}
@media(max-width:600px){.grid{grid-template-columns:1fr}}
</style></head>
<body><div class="card">
<h1>Reporte diario de asistencia</h1>
<div class="meta">
<div><strong>${escapeHtml(payload.companyName)}</strong></div>
<div>Fecha reportada: ${escapeHtml(payload.reportDate)} · TZ: ${escapeHtml(payload.timezoneId)}</div>
<div>Evaluado: ${escapeHtml(payload.evaluatedAtIso)}</div>
</div>
<h2>Resumen</h2>
<div class="grid">
<div class="stat"><span>Jornadas</span><b>${t.operationsCount}</b></div>
<div class="stat"><span>Programados</span><b>${t.scheduledEmployeesCount}</b></div>
<div class="stat"><span>Con llegada</span><b>${t.checkinCount}</b></div>
<div class="stat"><span>Con salida</span><b>${t.checkoutCount}</b></div>
<div class="stat"><span>Tarde</span><b>${t.lateCount}</b></div>
<div class="stat"><span>Salida anticipada</span><b>${t.earlyLeaveCount}</b></div>
<div class="stat"><span>No asistirá</span><b>${t.unavailableCount}</b></div>
<div class="stat"><span>Justificados</span><b>${t.justifiedCount}</b></div>
<div class="stat"><span>Sin llegada</span><b>${t.missingCheckinCount}</b></div>
<div class="stat"><span>Sin salida</span><b>${t.missingCheckoutCount}</b></div>
<div class="stat"><span>Confirm. pendiente</span><b>${t.pendingConfirmationCount}</b></div>
<div class="stat"><span>Incompletos</span><b>${t.incompleteCount}</b></div>
</div>
<h2>Incidencias (${payload.totalIncidentCount})</h2>
${truncationNote ? `<p>${escapeHtml(truncationNote)}</p>` : ""}
${
  payload.incidents.length === 0
    ? "<p>Sin incidencias listadas.</p>"
    : `<table><thead><tr><th>Tipo</th><th>Empleado</th><th>Servicio</th><th>Detalle</th></tr></thead><tbody>${incidentRows}</tbody></table>`
}
<h2>Por jornada</h2>
<table><thead><tr><th>Servicio</th><th>Prog.</th><th>Pres.</th><th>Sin llegada</th><th>Sin salida</th><th>Tarde</th><th>Anticipada</th><th>No asiste</th></tr></thead>
<tbody>${operationRows || "<tr><td colspan='8'>Sin jornadas</td></tr>"}</tbody></table>
</div></body></html>`;

  return { subject, text: textLines.join("\n"), html };
};
