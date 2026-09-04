/** Client-side mirror of backend location zone name normalization for create-offer UX. */
export function normalizeLocationZoneName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}
