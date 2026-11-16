import type { BillingExemptionCreatedSource } from "../constants/billing-company-exemption";

export interface BillingCompanyExemption {
  id: string;
  companyId: string;
  exemptionReason: string;
  isPermanent: boolean;
  expiresAt: string | null;
  createdSource: BillingExemptionCreatedSource | string;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyBillingPolicy {
  companyId: string;
  isExempt: boolean;
  exemptionReason: string | null;
  /** Commercial expectation only; no payment enforcement in Fase 1C. */
  requiresPayment: boolean;
  /** Commercial seat cap expectation; not operationally enforced in Fase 1C. */
  enforceSeatLimit: boolean;
  /** Reserved for future suspension workflows; always false in Fase 1C. */
  allowCommercialSuspension: boolean;
}