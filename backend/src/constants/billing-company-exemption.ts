/** Audit source for rows inserted by the disposable-environment seed script only. */
export const BILLING_EXEMPTION_CREATED_SOURCES = [
  "DISPOSABLE_SEED",
  "PLATFORM_MIGRATION",
  "MANUAL_BREAKGLASS",
] as const;
export type BillingExemptionCreatedSource = (typeof BILLING_EXEMPTION_CREATED_SOURCES)[number];

/**
 * Strategic companies with irrevocable commercial exemption (identity = company UUID).
 * Names are verified at seed time only; never used as lookup keys in runtime policy.
 */
export const PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS = [
  {
    companyId: "AF61492A-F135-490B-A39E-5D0B07E4B0FE",
    expectedName: "Dinamic Clean",
    exemptionReason:
      "Exención comercial permanente estratégica Dinamic Systems (Dinamic Clean).",
  },
  {
    companyId: "59D5FF94-6614-419A-9C9D-485383CDE043",
    expectedName: "Dinamic Systems",
    exemptionReason:
      "Exención comercial permanente estratégica Dinamic Systems (empresa matriz).",
  },
  {
    companyId: "04144E8E-C8DE-4EE5-8249-54F30E56176C",
    expectedName: "pruebas-nasser",
    exemptionReason:
      "Exención comercial permanente estratégica Dinamic Systems (entorno pruebas-nasser).",
  },
] as const;

export type ProtectedStrategicCompanyExemption =
  (typeof PROTECTED_STRATEGIC_COMPANY_EXEMPTIONS)[number];