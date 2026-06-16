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
