const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export const normalizeReportEmail = (raw: string): string => raw.trim().toLowerCase();

export const isValidReportEmail = (raw: string): boolean => {
  const email = normalizeReportEmail(raw);
  if (email.length < 5 || email.length > 320) {
    return false;
  }
  return EMAIL_RE.test(email);
};

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
