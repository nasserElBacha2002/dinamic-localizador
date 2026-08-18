/** Client-side mirror of backend location zone name normalization for create-offer UX. */
export function normalizeLocationZoneName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
