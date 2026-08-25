/**
 * Frontend UX helpers for locality input (Phase C corrections).
 * Backend `LOCALITY_ALIASES` remains the source of truth for canonicalization.
 * Do not duplicate the full alias table here for metrics.
 */

export const SUGGESTED_LOCALITY_LABELS = [
  "CABA",
  "GBA",
  "Buenos Aires",
  "Córdoba",
  "Salta",
  "Mendoza",
] as const;

const normalizeKey = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/**
 * Soft suggestion when the typed locality is a known Capital→CABA display alias.
 * Does not rewrite the input; backend performs canonicalization.
 */
export function localityCapitalHint(locality: string): string | null {
  const key = normalizeKey(locality);
  if (
    key === "capital" ||
    key === "capital federal" ||
    key === "bs as capital" ||
    key === "bs.as. capital"
  ) {
    return "¿Quisiste decir CABA?";
  }
  return null;
}
