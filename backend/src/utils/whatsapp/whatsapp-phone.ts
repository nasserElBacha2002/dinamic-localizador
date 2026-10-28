export const formatWhatsAppAddress = (phoneNumber: string): string => {
  const normalized = phoneNumber.replace(/^whatsapp:/i, "").trim();

  if (!normalized) {
    throw new Error("INVALID_WHATSAPP_PHONE_NUMBER");
  }

  const withPlus = normalized.startsWith("+") ? normalized : `+${normalized}`;

  if (!/^\+\d{8,15}$/.test(withPlus)) {
    throw new Error("INVALID_WHATSAPP_PHONE_NUMBER");
  }

  return `whatsapp:${withPlus}`;
};
