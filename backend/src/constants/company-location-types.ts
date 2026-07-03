export type StandardCompanyLocationTypeSeed = {
  code: string;
  name: string;
  sortOrder: number;
};

/** Legacy store formats seeded per company (matches migration 026). */
export const STANDARD_COMPANY_LOCATION_TYPE_SEEDS: StandardCompanyLocationTypeSeed[] = [
  { code: "Express", name: "Express", sortOrder: 1 },
  { code: "Express Interior MZA", name: "Express Interior MZA", sortOrder: 2 },
  { code: "Express Interior SALTA", name: "Express Interior SALTA", sortOrder: 3 },
  { code: "EXPRESS PLUS INTERIOR", name: "EXPRESS PLUS INTERIOR", sortOrder: 4 },
  { code: "Market Bs As", name: "Market Bs As", sortOrder: 5 },
];
