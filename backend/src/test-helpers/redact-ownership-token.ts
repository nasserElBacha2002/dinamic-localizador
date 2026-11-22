/** Redact ownership tokens in logs and operator-facing errors. */
export const maskOwnershipToken = (token: string | null | undefined): string => {
  if (!token || typeof token !== "string") {
    return "unknown";
  }
  const trimmed = token.trim();
  if (trimmed.length <= 8) {
    return "****";
  }
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
};

export const redactOwnershipTokensInMessage = (message: string): string =>
  message.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
    (match) => maskOwnershipToken(match),
  );