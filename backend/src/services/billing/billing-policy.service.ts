import sql from "mssql";
import { billingCompanyExemptionRepository } from "../../repositories/billing/billing-company-exemption.repository";
import type { CompanyBillingPolicy } from "../../types/billing-company-exemption";
import {
  findProtectedStrategicExemptionByCompanyId,
  normalizeCompanyId,
} from "../../utils/billing/protected-company-exemption";

const defaultCommercialPolicy = (companyId: string): CompanyBillingPolicy => ({
  companyId: normalizeCompanyId(companyId),
  isExempt: false,
  exemptionReason: null,
  requiresPayment: true,
  enforceSeatLimit: true,
  allowCommercialSuspension: false,
});

const exemptCommercialPolicy = (
  companyId: string,
  exemptionReason: string,
): CompanyBillingPolicy => ({
  companyId: normalizeCompanyId(companyId),
  isExempt: true,
  exemptionReason,
  requiresPayment: false,
  enforceSeatLimit: false,
  allowCommercialSuspension: false,
});

/**
 * Strategic UUID registry takes precedence over SQL rows for exempt policy fields.
 * Non-strategic companies may still be exempt only through persisted billing_company_exemptions.
 */
export const billingPolicyService = {
  async getCompanyBillingPolicy(companyId: string): Promise<CompanyBillingPolicy> {
    const normalizedId = normalizeCompanyId(companyId);
    const strategic = findProtectedStrategicExemptionByCompanyId(normalizedId);
    const persisted = await billingCompanyExemptionRepository.findOpenPermanentByCompanyId(
      normalizedId,
    );

    if (strategic) {
      const exemptionReason = persisted?.exemptionReason ?? strategic.exemptionReason;
      return exemptCommercialPolicy(normalizedId, exemptionReason);
    }

    if (persisted) {
      return exemptCommercialPolicy(normalizedId, persisted.exemptionReason);
    }

    return defaultCommercialPolicy(normalizedId);
  },

  async getCompanyBillingPolicyInTransaction(
    transaction: sql.Transaction,
    companyId: string,
  ): Promise<CompanyBillingPolicy> {
    const normalizedId = normalizeCompanyId(companyId);
    const strategic = findProtectedStrategicExemptionByCompanyId(normalizedId);
    const persisted = await billingCompanyExemptionRepository.findOpenPermanentByCompanyIdInTransaction(
      transaction,
      normalizedId,
    );

    if (strategic) {
      const exemptionReason = persisted?.exemptionReason ?? strategic.exemptionReason;
      return exemptCommercialPolicy(normalizedId, exemptionReason);
    }

    if (persisted) {
      return exemptCommercialPolicy(normalizedId, persisted.exemptionReason);
    }

    return defaultCommercialPolicy(normalizedId);
  },
};