/**
 * Normalizes work team names for uniqueness checks within a company.
 * - trim
 * - lowercase
 * - collapse consecutive whitespace to a single space
 * - Unicode NFKC when available
 */
export const normalizeWorkTeamName = (value: string): string => {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (typeof trimmed.normalize === "function") {
    return trimmed.normalize("NFKC").toLowerCase();
  }
  return trimmed.toLowerCase();
};
