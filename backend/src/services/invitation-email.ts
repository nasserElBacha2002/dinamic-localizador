import { env } from "../config/env";
import type { UserInvitationOrigin } from "../types/user-invitation";

export interface InvitationEmailContent {
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

export function buildInvitationAcceptUrl(rawToken: string): string {
  const base = env.FRONTEND_URL.replace(/\/$/, "");
  return `${base}/invitations/accept?token=${encodeURIComponent(rawToken)}`;
}

export function buildInvitationEmail(input: {
  to: string;
  companyName: string;
  inviteeName: string | null;
  userExists: boolean;
  origin: UserInvitationOrigin;
  expiresAt: Date;
  rawToken: string;
}): InvitationEmailContent {
  const acceptUrl = buildInvitationAcceptUrl(input.rawToken);
  const expiryLabel = formatExpiry(input.expiresAt);
  const company = input.companyName.trim();
  const greetingName = input.inviteeName?.trim() || null;

  const isOwnerCreate = input.origin === "COMPANY_CREATE";

  let subject: string;
  let intro: string;
  let cta: string;

  if (isOwnerCreate) {
    subject = `Activá tu acceso como dueño de ${company}`;
    intro = `Fuiste designado como dueño de la empresa "${company}" en Dinamic Attendance.`;
    cta = input.userExists
      ? "Iniciá sesión con tu cuenta actual y aceptá la invitación para activar tu acceso."
      : "Creá tu cuenta y definí tu contraseña para activar el acceso como dueño.";
  } else if (input.userExists) {
    subject = `Invitación a unirte a ${company}`;
    intro = `La empresa "${company}" te invitó a unirte en Dinamic Attendance.`;
    cta = "Podés aceptar con tu cuenta actual. Si no tenés sesión iniciada, te pediremos iniciar sesión.";
  } else {
    subject = `Invitación para crear tu cuenta en ${company}`;
    intro = `La empresa "${company}" te invitó a crear tu cuenta en Dinamic Attendance.`;
    cta = "Usá el enlace para crear tu cuenta, definir tu contraseña y aceptar la invitación.";
  }

  const greeting = greetingName ? `Hola ${greetingName},` : "Hola,";
  const text = [
    greeting,
    "",
    intro,
    cta,
    "",
    `El enlace vence el ${expiryLabel}.`,
    `Aceptar invitación: ${acceptUrl}`,
    "",
    "Si no reconocés esta invitación, ignorá este mensaje.",
  ].join("\n");

  const safeCompany = escapeHtml(company);
  const safeGreeting = escapeHtml(greeting);
  const safeIntro = escapeHtml(intro);
  const safeCta = escapeHtml(cta);
  const safeExpiry = escapeHtml(expiryLabel);
  const safeUrl = escapeHtml(acceptUrl);

  const html = `
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="referrer" content="no-referrer" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="font-family: Arial, sans-serif; line-height: 1.5; color: #1a1a1a;">
    <p>${safeGreeting}</p>
    <p>${safeIntro}</p>
    <p>${safeCta}</p>
    <p><strong>Vencimiento:</strong> ${safeExpiry}</p>
    <p>
      <a href="${safeUrl}" style="display:inline-block;padding:10px 16px;background:#1c7ed6;color:#fff;text-decoration:none;border-radius:6px;">
        Aceptar invitación
      </a>
    </p>
    <p style="font-size: 12px; color: #666;">
      Si el botón no funciona, copiá y pegá este enlace:<br />
      ${safeUrl}
    </p>
    <p style="font-size: 12px; color: #666;">
      Si no reconocés esta invitación a <strong>${safeCompany}</strong>, ignorá este mensaje.
    </p>
  </body>
</html>`.trim();

  return { to: input.to, subject, text, html };
}
