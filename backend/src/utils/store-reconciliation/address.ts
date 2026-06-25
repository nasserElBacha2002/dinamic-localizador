import type { AddressMatchStatus } from "./types";

const EXACT_MATCH_THRESHOLD = 0.99;
const DEFAULT_LIKELY_MATCH_THRESHOLD = 0.85;

const LOCATION_SUFFIXES = [
  "provincia de buenos aires",
  "cdad autonoma de buenos aires",
  "ciudad autonoma de buenos aires",
  "capital federal",
  "argentina",
] as const;

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
  { pattern: /\bsanta\b/g, replacement: "sta" },
  { pattern: /\bsta\.\b/g, replacement: "sta" },
  { pattern: /\bjuan domingo\b/g, replacement: "j d" },
  { pattern: /\bj\.\s*d\.\b/g, replacement: "j d" },
  { pattern: /\besquina\b/g, replacement: "esq" },
  { pattern: /\besq\.\b/g, replacement: "esq" },
  { pattern: /\bdoctor\b/g, replacement: "dr" },
  { pattern: /\bdr\.\b/g, replacement: "dr" },
];

const stripAccents = (value: string): string =>
  value.normalize("NFD").replace(/\p{M}/gu, "");

const stripStoreNumberPrefix = (value: string): string =>
  value.replace(/^\d+_/u, "").trim();

const removePostalCodes = (value: string): string =>
  value.replace(/\b[a-z]\d{4}[a-z0-9]*\b/gi, " ");

const removeLocationSuffixes = (value: string): string => {
  let result = value;
  for (const suffix of LOCATION_SUFFIXES) {
    const pattern = new RegExp(`\\b${suffix.replace(/\s+/g, "\\s+")}\\b`, "g");
    result = result.replace(pattern, " ");
  }
  return result;
};

const normalizeStreetNumberRanges = (value: string): string =>
  value
    .replace(/\b(\d+)\s*\/\s*\d+\b/g, "$1")
    .replace(/\b(\d+)\s*-\s*\d+\b/g, "$1");

export const normalizeAddress = (address: string): string => {
  let normalized = stripAccents(address.trim().toLowerCase());
  normalized = normalized.replace(/_/g, " ");
  normalized = stripStoreNumberPrefix(normalized);
  normalized = normalized.replace(/[.,;:!?'"()[\]]/g, " ");
  normalized = normalized.replace(/\s+/g, " ").trim();
  normalized = removePostalCodes(normalized);
  normalized = removeLocationSuffixes(normalized);

  for (const rule of ABBREVIATION_RULES) {
    normalized = normalized.replace(rule.pattern, rule.replacement);
  }

  return normalized.replace(/\s+/g, " ").trim();
};

export const normalizeAddressForRangeComparison = (address: string): string =>
  normalizeStreetNumberRanges(normalizeAddress(address));

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

  const rangeLeft = normalizeAddressForRangeComparison(left);
  const rangeRight = normalizeAddressForRangeComparison(right);
  if (rangeLeft === rangeRight) {
    return 0.98;
  }

  const distance = levenshteinDistance(normalizedLeft, normalizedRight);
  const maxLength = Math.max(normalizedLeft.length, normalizedRight.length);
  return 1 - distance / maxLength;
};

const isRangeOrFormatDifference = (officialAddress: string, databaseAddress: string): boolean => {
  const normalizedOfficial = normalizeAddress(officialAddress);
  const normalizedDatabase = normalizeAddress(databaseAddress);
  if (normalizedOfficial === normalizedDatabase) {
    return true;
  }

  const rangeOfficial = normalizeAddressForRangeComparison(officialAddress);
  const rangeDatabase = normalizeAddressForRangeComparison(databaseAddress);
  if (rangeOfficial === rangeDatabase) {
    return true;
  }

  const officialBaseNumber = rangeOfficial.match(/\b\d+\b/)?.[0];
  const databaseBaseNumber = rangeDatabase.match(/\b\d+\b/)?.[0];
  if (!officialBaseNumber || !databaseBaseNumber || officialBaseNumber !== databaseBaseNumber) {
    return false;
  }

  const officialTail = rangeOfficial.replace(officialBaseNumber, "").trim();
  const databaseTail = rangeDatabase.replace(databaseBaseNumber, "").trim();
  return officialTail === databaseTail;
};

export interface AddressComparisonResult {
  status: AddressMatchStatus;
  similarity: number;
  normalizedOfficialAddress: string;
  normalizedDbAddress: string;
  addressDifferenceReason: string;
}

export const compareAddresses = (
  officialAddress: string,
  databaseAddress: string,
  likelyMatchThreshold = DEFAULT_LIKELY_MATCH_THRESHOLD,
): AddressComparisonResult => {
  const normalizedOfficialAddress = normalizeAddress(officialAddress);
  const normalizedDbAddress = normalizeAddress(databaseAddress);
  const similarity = addressSimilarity(officialAddress, databaseAddress);

  if (isRangeOrFormatDifference(officialAddress, databaseAddress)) {
    return {
      status: similarity >= EXACT_MATCH_THRESHOLD ? "exact_match" : "likely_match",
      similarity: Math.max(similarity, 0.95),
      normalizedOfficialAddress,
      normalizedDbAddress,
      addressDifferenceReason: "range_or_format_difference",
    };
  }

  if (similarity >= EXACT_MATCH_THRESHOLD) {
    return {
      status: "exact_match",
      similarity,
      normalizedOfficialAddress,
      normalizedDbAddress,
      addressDifferenceReason: "",
    };
  }

  if (similarity >= likelyMatchThreshold) {
    return {
      status: "likely_match",
      similarity,
      normalizedOfficialAddress,
      normalizedDbAddress,
      addressDifferenceReason: "format_difference",
    };
  }

  return {
    status: "mismatch",
    similarity,
    normalizedOfficialAddress,
    normalizedDbAddress,
    addressDifferenceReason: "substantive_difference",
  };
};
