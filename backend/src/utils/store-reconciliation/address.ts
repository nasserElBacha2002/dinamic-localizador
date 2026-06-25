import type { AddressMatchStatus } from "./types";

const EXACT_MATCH_THRESHOLD = 0.99;
const DEFAULT_LIKELY_MATCH_THRESHOLD = 0.85;

const ABBREVIATION_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bavenida\b/g, replacement: "av" },
  { pattern: /\bav\.\b/g, replacement: "av" },
  { pattern: /\bav\b/g, replacement: "av" },
  { pattern: /\bpasaje\b/g, replacement: "pje" },
  { pattern: /\bpje\.\b/g, replacement: "pje" },
  { pattern: /\bgeneral\b/g, replacement: "gral" },
  { pattern: /\bgral\.\b/g, replacement: "gral" },
  { pattern: /\bpresidente\b/g, replacement: "pte" },
  { pattern: /\bpte\.\b/g, replacement: "pte" },
  { pattern: /\bcoronel\b/g, replacement: "cnel" },
  { pattern: /\bcnel\.\b/g, replacement: "cnel" },
  { pattern: /\besquina\b/g, replacement: "esq" },
  { pattern: /\besq\.\b/g, replacement: "esq" },
  { pattern: /\bdoctor\b/g, replacement: "dr" },
  { pattern: /\bdr\.\b/g, replacement: "dr" },
];

const stripAccents = (value: string): string =>
  value.normalize("NFD").replace(/\p{M}/gu, "");

export const normalizeAddress = (address: string): string => {
  let normalized = stripAccents(address.trim().toLowerCase());
  normalized = normalized.replace(/[.,;:!?'"()[\]-]/g, " ");
  normalized = normalized.replace(/\s+/g, " ").trim();

  for (const rule of ABBREVIATION_RULES) {
    normalized = normalized.replace(rule.pattern, rule.replacement);
  }

  return normalized.replace(/\s+/g, " ").trim();
};

const levenshteinDistance = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const matrix: number[][] = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );

  for (let row = 0; row <= left.length; row += 1) {
    matrix[row][0] = row;
  }

  for (let column = 0; column <= right.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      );
    }
  }

  return matrix[left.length][right.length];
};

export const addressSimilarity = (left: string, right: string): number => {
  const normalizedLeft = normalizeAddress(left);
  const normalizedRight = normalizeAddress(right);

  if (!normalizedLeft && !normalizedRight) {
    return 1;
  }

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  const distance = levenshteinDistance(normalizedLeft, normalizedRight);
  const maxLength = Math.max(normalizedLeft.length, normalizedRight.length);
  return 1 - distance / maxLength;
};

export const compareAddresses = (
  officialAddress: string,
  databaseAddress: string,
  likelyMatchThreshold = DEFAULT_LIKELY_MATCH_THRESHOLD,
): { status: AddressMatchStatus; similarity: number } => {
  const similarity = addressSimilarity(officialAddress, databaseAddress);

  if (similarity >= EXACT_MATCH_THRESHOLD) {
    return { status: "exact_match", similarity };
  }

  if (similarity >= likelyMatchThreshold) {
    return { status: "likely_match", similarity };
  }

  return { status: "mismatch", similarity };
};
