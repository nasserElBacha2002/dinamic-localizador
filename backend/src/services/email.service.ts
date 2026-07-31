import type { Transporter } from "nodemailer";
import nodemailer from "nodemailer";
import { env } from "../config/env";
import { redactInvitationSecrets } from "../utils/invitation-token";

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type EmailTransportMode = "smtp" | "console" | "disabled";

export interface EmailSendResult {
  /** True only when the message was accepted by a real SMTP transport. */
  sent: boolean;
  messageId: string | null;
  transport: EmailTransportMode;
  publicErrorCode: string | null;
}

let smtpTransporter: Transporter | null = null;

function getSmtpTransporter(): Transporter {
  if (!smtpTransporter) {
    // Port 587 uses STARTTLS (secure=false). Port 465 uses implicit TLS (secure=true).
    smtpTransporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      requireTLS: !env.SMTP_SECURE,
      connectionTimeout: env.SMTP_CONNECTION_TIMEOUT_MS,
      socketTimeout: env.SMTP_SOCKET_TIMEOUT_MS,
      greetingTimeout: env.SMTP_CONNECTION_TIMEOUT_MS,
      auth:
        env.SMTP_USER && env.SMTP_PASSWORD
          ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
          : undefined,
    });
  }
  return smtpTransporter;
}

/**
 * Sends transactional email according to EMAIL_TRANSPORT.
 * Console logging is never reported as a successful delivery.
 * Never logs plaintext invitation tokens or SMTP credentials.
 */
export async function sendEmail(input: SendEmailInput): Promise<EmailSendResult> {
  const transport = env.EMAIL_TRANSPORT;

  if (transport === "disabled") {
    return {
      sent: false,
      messageId: null,
      transport: "disabled",
      publicErrorCode: "EMAIL_TRANSPORT_DISABLED",
    };
  }

  if (transport === "console") {
    console.info("[email:console]", {
      to: input.to,
      subject: input.subject,
      text: redactInvitationSecrets(input.text),
    });
    return {
      sent: false,
      messageId: null,
      transport: "console",
      publicErrorCode: "EMAIL_CONSOLE_NOT_DELIVERED",
    };
  }

  const from = env.SMTP_FROM || env.SMTP_USER || "noreply@localhost";
  const info = await getSmtpTransporter().sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });

  return {
    sent: true,
    messageId: info.messageId ?? null,
    transport: "smtp",
    publicErrorCode: null,
  };
}
