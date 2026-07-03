export const normalizePhoneNumber = (phoneNumber: string): string => {
  const trimmed = phoneNumber.trim();
  const digitsOnly = trimmed.replace(/[^\d+]/g, "");

  if (!digitsOnly.startsWith("+")) {
    throw new Error("INVALID_PHONE_FORMAT");
  }

  const normalized = `+${digitsOnly.slice(1).replace(/\D/g, "")}`;

  if (normalized.length < 8 || normalized.length > 16) {
    throw new Error("INVALID_PHONE_FORMAT");
  }

  return normalized;
};

export const normalizeWhatsAppPhone = (from: string): string => {
  const withoutPrefix = from.trim().replace(/^whatsapp:/i, "");
  return normalizePhoneNumber(withoutPrefix);
};

export const tryNormalizeWhatsAppPhone = (from: string): string | null => {
  try {
    return normalizeWhatsAppPhone(from);
  } catch {
    return null;
  }
};

/** Masks phone numbers for structured logs (e.g. +54911******11). */
export const maskPhoneNumberForLog = (phoneNumber: string): string => {
  let normalized = phoneNumber.trim();
  try {
    normalized = normalizeWhatsAppPhone(
      normalized.startsWith("whatsapp:") ? normalized : `whatsapp:${normalized}`,
    );
  } catch {
  }

  if (normalized.length <= 8) {
    return "***";
  }

  return `${normalized.slice(0, 6)}******${normalized.slice(-2)}`;
};
