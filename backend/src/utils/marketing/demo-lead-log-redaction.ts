/** Redact SMTP / transport errors before logging (no credentials or addresses). */
export function redactSmtpErrorSnippet(message: string): string {
  return message
    .replace(/pass(word)?[=:]\S+/gi, "password=[REDACTED]")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]")
    .slice(0, 120);
}