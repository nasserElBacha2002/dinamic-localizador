export type LegacyCompanyLocationTypeSeed = {
  code: string;
  name: string;
  sortOrder: number;
};

/**
 * Legacy compatibility seeds from the previous global store_format model.
 * Not universal defaults — each company can edit, disable, or replace these types.
 */
export const LEGACY_COMPANY_LOCATION_TYPE_SEEDS: LegacyCompanyLocationTypeSeed[] = [
  { code: "Express", name: "Express", sortOrder: 1 },
  { code: "Express Interior MZA", name: "Express Interior MZA", sortOrder: 2 },
  { code: "Express Interior SALTA", name: "Express Interior SALTA", sortOrder: 3 },
  { code: "EXPRESS PLUS INTERIOR", name: "EXPRESS PLUS INTERIOR", sortOrder: 4 },
  { code: "Market Bs As", name: "Market Bs As", sortOrder: 5 },
];
