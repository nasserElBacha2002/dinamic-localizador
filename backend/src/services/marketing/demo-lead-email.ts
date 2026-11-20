import { EMPLOYEE_COUNT_RANGE_LABELS } from "./demo-lead.constants";
import type { MarketingDemoRequestInput } from "../../schemas/marketing-demo.schema";

export interface DemoLeadEmailContent {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatLine(label: string, value: string): string {
  return `${label}: ${value}`;
}

export function buildDemoLeadEmail(input: {
  lead: MarketingDemoRequestInput;
  to: string;
  submittedAt: Date;
}): DemoLeadEmailContent {
  const employeeLabel =
    EMPLOYEE_COUNT_RANGE_LABELS[input.lead.employeeRange] ?? input.lead.employeeRange;
  const submittedLabel = input.submittedAt.toLocaleString("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  });

  const subject = `Solicitud de demo — ${input.lead.company}`;

  const textLines = [
    "Nueva solicitud de demo desde la landing de Dinamic Operations.",
    "",
    formatLine("Nombre", input.lead.fullName),
    formatLine("Empresa", input.lead.company),
    formatLine("Email", input.lead.email),
    formatLine("Cantidad de empleados", employeeLabel),
    ...(input.lead.phone ? [formatLine("Teléfono / WhatsApp", input.lead.phone)] : []),
    ...(input.lead.serviceLocations
      ? [formatLine("Servicios / ubicaciones", input.lead.serviceLocations)]
      : []),
    "",
    formatLine("Recibida", submittedLabel),
  ];

  const text = textLines.join("\n");

  const rows = [
    ["Nombre", input.lead.fullName],
    ["Empresa", input.lead.company],
    ["Email", input.lead.email],
    ["Cantidad de empleados", employeeLabel],
    ...(input.lead.phone ? [["Teléfono / WhatsApp", input.lead.phone] as const] : []),
    ...(input.lead.serviceLocations
      ? [["Servicios / ubicaciones", input.lead.serviceLocations] as const]
      : []),
    ["Recibida", submittedLabel],
  ] as const;

  const tableRows = rows
    .map(
      ([label, value]) =>
        `<tr><th align="left" style="padding:6px 12px 6px 0;vertical-align:top;">${escapeHtml(label)}</th><td style="padding:6px 0;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="font-family:system-ui,-apple-system,sans-serif;color:#0f1e2b;line-height:1.5;">
    <p>Nueva solicitud de demo desde la landing de Dinamic Operations.</p>
    <table role="presentation" style="border-collapse:collapse;">${tableRows}</table>
  </body>
</html>`;

  return { to: input.to, subject, text, html };
}