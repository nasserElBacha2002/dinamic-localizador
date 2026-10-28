export function normalizeLocationTypeCode(value: string): string {
  const normalized = value
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

  return normalized.slice(0, 80) || "TYPE";
}
