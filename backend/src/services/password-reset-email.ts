import { env } from "../config/env";

export interface PasswordResetEmailContent {
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

function formatExpiry(expiresAt: Date): string {
  return expiresAt.toLocaleString("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

export function buildPasswordResetUrl(rawToken: string): string {
  const base = env.FRONTEND_URL.replace(/\/$/, "");
  return `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

export function buildPasswordResetEmail(input: {
  to: string;
  expiresAt: Date;
  rawToken: string;
}): PasswordResetEmailContent {
  const resetUrl = buildPasswordResetUrl(input.rawToken);
  const expiryLabel = formatExpiry(input.expiresAt);
  const subject = "Restablecé tu contraseña en Dinamic Attendance";
  const text = [
    "Hola,",
    "",
    "Recibimos una solicitud para restablecer la contraseña de tu cuenta en Dinamic Attendance.",
    "Si fuiste vos, usá el enlace de abajo. Si no solicitaste este cambio, ignorá este mensaje.",
    "",
    `El enlace vence el ${expiryLabel}.`,
    `Restablecer contraseña: ${resetUrl}`,
    "",
    "Por seguridad, este enlace se puede usar una sola vez.",
  ].join("\n");

  const safeExpiry = escapeHtml(expiryLabel);
  const safeUrl = escapeHtml(resetUrl);

  const html = `
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="referrer" content="no-referrer" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="font-family: Arial, sans-serif; line-height: 1.5; color: #1a1a1a;">
    <p>Hola,</p>
    <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en Dinamic Attendance.</p>
    <p>Si fuiste vos, usá el botón. Si no solicitaste este cambio, ignorá este mensaje.</p>
    <p><strong>Vencimiento:</strong> ${safeExpiry}</p>
    <p>
      <a href="${safeUrl}" style="display:inline-block;padding:10px 16px;background:#1c7ed6;color:#fff;text-decoration:none;border-radius:6px;">
        Restablecer contraseña
      </a>
    </p>
    <p style="font-size: 12px; color: #666;">
      Si el botón no funciona, copiá y pegá este enlace:<br />
      ${safeUrl}
    </p>
    <p style="font-size: 12px; color: #666;">
      El enlace se puede usar una sola vez.
    </p>
  </body>
</html>`.trim();

  return { to: input.to, subject, text, html };
}
