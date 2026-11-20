import { tryNormalizeWhatsAppPhone } from "../phone";

/**
 * Best-effort ISO-3166 alpha-2 from E.164 (no external lib).
 * Returns null when the prefix is ambiguous or unknown — Meta tariffs must not guess.
 */
export const deriveDestinationCountryCode = (phone: string | null | undefined): string | null => {
  if (!phone?.trim()) {
    return null;
  }
  const normalized = tryNormalizeWhatsAppPhone(
    phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`,
  );
  if (!normalized) {
    return null;
  }
  const digits = normalized.slice(1);

  const prefixes: Array<{ prefix: string; country: string }> = [
    { prefix: "549", country: "AR" },
    { prefix: "54", country: "AR" },
    { prefix: "598", country: "UY" },
    { prefix: "595", country: "PY" },
    { prefix: "56", country: "CL" },
    { prefix: "55", country: "BR" },
    { prefix: "52", country: "MX" },
    { prefix: "57", country: "CO" },
    { prefix: "51", country: "PE" },
    { prefix: "1", country: "US" },
    { prefix: "34", country: "ES" },
  ];

  for (const entry of prefixes.sort((a, b) => b.prefix.length - a.prefix.length)) {
    if (digits.startsWith(entry.prefix)) {
      return entry.country;
    }
  }
  return null;
};