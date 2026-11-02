const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export type WhatsappConversationExportDocument = {
  exportedAt: string;
  header: {
    conversationId: string;
    phoneMasked: string;
    companyId: string | null;
    employeeId: string | null;
    status: string;
    startedAt: string;
    lastActivityAt: string;
    messageCount: number;
    errorCount: number;
    lastResultCode: string | null;
    lastFlowType: string | null;
  };
  messages: Array<{
    id: string;
    createdAt: string;
    direction: string;
    body: string | null;
    providerStatus: string | null;
    messageSid: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
  executions: Array<{
    id: string;
    flowType: string;
    intent: string | null;
    status: string;
    resultCode: string | null;
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    errorCode: string | null;
    errorMessage: string | null;
    metadataJson: string | null;
  }>;
  providerEvents: Array<{
    messageSid: string | null;
    direction: string | null;
    providerStatus: string;
    eventType: string;
    receivedAt: string;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
  technicalIds: {
    conversationId: string;
    employeeId: string | null;
    companyId: string | null;
    messageIds: string[];
    flowExecutionIds: string[];
    requestIds: string[];
  };
  exportMeta: {
    totalMessageCount: number;
    exportedMessageCount: number;
    expectedExportCount: number;
    truncatedByHardCap: boolean;
    incompleteLoad: boolean;
    truncated: boolean;
  };
};

export const renderWhatsappConversationExportHtml = (
  doc: WhatsappConversationExportDocument,
): string => {
  const messageRows = doc.messages
    .map((message) => {
      const speaker = message.direction === "INBOUND" ? "Empleado" : "Sistema";
      const body = message.body?.trim() ? escapeHtml(message.body) : "—";
      return `<tr>
  <td>${escapeHtml(message.createdAt)}</td>
  <td>${escapeHtml(speaker)}</td>
  <td>${escapeHtml(message.direction)}</td>
  <td><pre class="body">${body}</pre></td>
  <td>${escapeHtml(message.providerStatus ?? "—")}</td>
  <td>${escapeHtml(message.messageSid ?? "—")}</td>
  <td>${escapeHtml(message.errorCode ?? "—")}</td>
</tr>`;
    })
    .join("\n");

  const executionRows = doc.executions
    .map(
      (execution) => `<tr>
  <td>${escapeHtml(execution.flowType)}</td>
  <td>${escapeHtml(execution.intent ?? "—")}</td>
  <td>${escapeHtml(execution.resultCode ?? "—")}</td>
  <td>${escapeHtml(execution.startedAt)}</td>
  <td>${escapeHtml(execution.finishedAt ?? "—")}</td>
  <td>${escapeHtml(execution.errorCode ?? "—")}</td>
  <td>${escapeHtml(execution.errorMessage ?? "—")}</td>
</tr>`,
    )
    .join("\n");

  const providerRows = doc.providerEvents
    .map(
      (event) => `<tr>
  <td>${escapeHtml(event.messageSid ?? "—")}</td>
  <td>${escapeHtml(event.direction ?? "—")}</td>
  <td>${escapeHtml(event.providerStatus)}</td>
  <td>${escapeHtml(event.eventType)}</td>
  <td>${escapeHtml(event.receivedAt)}</td>
  <td>${escapeHtml(event.errorCode ?? "—")}</td>
  <td>${escapeHtml(event.errorMessage ?? "—")}</td>
</tr>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Export conversación WhatsApp ${escapeHtml(doc.header.conversationId)}</title>
  <style>
    body { font-family: system-ui, sans-serif; font-size: 12px; color: #111; margin: 24px; }
    h1, h2 { margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0 24px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; vertical-align: top; text-align: left; }
    th { background: #f0f0f0; }
    pre.body { margin: 0; white-space: pre-wrap; font-family: inherit; }
    .meta { margin-bottom: 16px; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>Exportación de conversación WhatsApp</h1>
  <p class="meta">Generado: ${escapeHtml(doc.exportedAt)}</p>
  ${
    doc.exportMeta.truncated
      ? doc.exportMeta.incompleteLoad && !doc.exportMeta.truncatedByHardCap
        ? `<p class="meta"><strong>Export incompleto:</strong> se esperaban ${doc.exportMeta.expectedExportCount} mensajes y se exportaron ${doc.exportMeta.exportedMessageCount}. No fue posible recuperar todos los mensajes.</p>`
        : `<p class="meta"><strong>Export incompleto:</strong> ${doc.exportMeta.exportedMessageCount} de ${doc.exportMeta.totalMessageCount} mensajes exportados.</p>`
      : ""
  }
  <h2>Cabecera</h2>
  <table>
    <tr><th>Conversation ID</th><td>${escapeHtml(doc.header.conversationId)}</td></tr>
    <tr><th>Teléfono (enmascarado)</th><td>${escapeHtml(doc.header.phoneMasked)}</td></tr>
    <tr><th>company_id</th><td>${escapeHtml(doc.header.companyId ?? "—")}</td></tr>
    <tr><th>employee_id</th><td>${escapeHtml(doc.header.employeeId ?? "—")}</td></tr>
    <tr><th>Estado</th><td>${escapeHtml(doc.header.status)}</td></tr>
    <tr><th>Inicio</th><td>${escapeHtml(doc.header.startedAt)}</td></tr>
    <tr><th>Última actividad</th><td>${escapeHtml(doc.header.lastActivityAt)}</td></tr>
    <tr><th>Mensajes</th><td>${doc.header.messageCount}</td></tr>
    <tr><th>Errores</th><td>${doc.header.errorCount}</td></tr>
    <tr><th>Último resultado</th><td>${escapeHtml(doc.header.lastResultCode ?? "—")}</td></tr>
  </table>
  <h2>Chat completo</h2>
  <table>
    <thead><tr><th>Timestamp</th><th>Rol</th><th>Direction</th><th>Body</th><th>Provider status</th><th>Message SID</th><th>Error</th></tr></thead>
    <tbody>${messageRows || "<tr><td colspan=\"7\">Sin mensajes</td></tr>"}</tbody>
  </table>
  <h2>Ejecuciones</h2>
  <table>
    <thead><tr><th>Flow type</th><th>Intent</th><th>Result</th><th>Inicio</th><th>Fin</th><th>Error code</th><th>Error message</th></tr></thead>
    <tbody>${executionRows || "<tr><td colspan=\"7\">Sin ejecuciones</td></tr>"}</tbody>
  </table>
  <h2>Twilio / proveedor</h2>
  <table>
    <thead><tr><th>MessageSid</th><th>Direction</th><th>Status</th><th>Evento</th><th>Recibido</th><th>Error code</th><th>Error message</th></tr></thead>
    <tbody>${providerRows || "<tr><td colspan=\"7\">Sin eventos de proveedor</td></tr>"}</tbody>
  </table>
  <h2>IDs técnicos</h2>
  <table>
    <tr><th>conversation id</th><td>${escapeHtml(doc.technicalIds.conversationId)}</td></tr>
    <tr><th>employee id</th><td>${escapeHtml(doc.technicalIds.employeeId ?? "—")}</td></tr>
    <tr><th>company id</th><td>${escapeHtml(doc.technicalIds.companyId ?? "—")}</td></tr>
    <tr><th>message ids</th><td>${escapeHtml(doc.technicalIds.messageIds.join(", ") || "—")}</td></tr>
    <tr><th>flow execution ids</th><td>${escapeHtml(doc.technicalIds.flowExecutionIds.join(", ") || "—")}</td></tr>
    <tr><th>request ids</th><td>${escapeHtml(doc.technicalIds.requestIds.join(", ") || "—")}</td></tr>
  </table>
</body>
</html>`;
};
