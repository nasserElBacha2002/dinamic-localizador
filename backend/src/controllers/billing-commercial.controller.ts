import type { Request, Response } from "express";
import type { BillingPeriod, BillingPriceKind } from "../constants/billing-catalog";
import type { CommercialBenefitKind } from "../constants/billing-commercial-benefit";
import { billingCommercialBenefitService } from "../services/billing/billing-commercial-benefit.service";
import { billingNegotiatedContractService } from "../services/billing/billing-negotiated-contract.service";
import { commercialSeatQuotaSettingsService } from "../services/billing/commercial-seat-quota-settings.service";

const parseDate = (value: string): Date => new Date(value);

export const billingCommercialController = {
  async getCompanyCommercialContracts(req: Request, res: Response) {
    const companyId = String(req.params.companyId);
    const at = req.query.at ? parseDate(String(req.query.at)) : undefined;
    const data = await billingNegotiatedContractService.getCompanyCommercialContracts(companyId, at);
    res.status(200).json({ data });
  },

  async createNegotiatedAgreement(req: Request, res: Response) {
    const companyId = String(req.params.companyId);
    const body = req.body as {
      billingPlanId: string;
      billingPlanTierId?: string | null;
      subscriptionStatus?: "ACTIVE" | "SCHEDULED";
      effectiveFrom: string;
      effectiveTo?: string | null;
      agreedAmount: string;
      currency: string;
      billingPeriod: BillingPeriod;
      priceKind?: BillingPriceKind;
      seatMin: number;
      seatMax?: number | null;
      commercialReference?: string | null;
      adminRequestKey?: string | null;
    };

    const data = await billingNegotiatedContractService.createNegotiatedAgreement({
      companyId,
      billingPlanId: body.billingPlanId,
      billingPlanTierId: body.billingPlanTierId,
      subscriptionStatus: body.subscriptionStatus,
      effectiveFrom: parseDate(body.effectiveFrom),
      effectiveTo: body.effectiveTo ? parseDate(body.effectiveTo) : null,
      agreedAmount: body.agreedAmount,
      currency: body.currency,
      billingPeriod: body.billingPeriod,
      priceKind: body.priceKind,
      seatMin: body.seatMin,
      seatMax: body.seatMax,
      commercialReference: body.commercialReference,
      actorUserId: req.auth!.userId,
      adminRequestKey: body.adminRequestKey,
    });

    res.status(201).json({ data });
  },

  async modifyContractualTerms(req: Request, res: Response) {
    const companyId = String(req.params.companyId);
    const subscriptionId = String(req.params.subscriptionId);
    const body = req.body as {
      agreedAmount: string;
      currency: string;
      billingPeriod: BillingPeriod;
      priceKind?: BillingPriceKind;
      seatMin: number;
      seatMax?: number | null;
      effectiveFrom: string;
      effectiveTo?: string | null;
      commercialReference?: string | null;
      adminRequestKey?: string | null;
    };

    const data = await billingNegotiatedContractService.modifyContractualTerms({
      subscriptionId,
      companyId,
      agreedAmount: body.agreedAmount,
      currency: body.currency,
      billingPeriod: body.billingPeriod,
      priceKind: body.priceKind,
      seatMin: body.seatMin,
      seatMax: body.seatMax,
      effectiveFrom: parseDate(body.effectiveFrom),
      effectiveTo: body.effectiveTo ? parseDate(body.effectiveTo) : null,
      commercialReference: body.commercialReference,
      actorUserId: req.auth!.userId,
      adminRequestKey: body.adminRequestKey,
    });

    res.status(201).json({ data });
  },

  async listCompanyCommercialBenefits(req: Request, res: Response) {
    const companyId = String(req.params.companyId);
    const at = req.query.at ? new Date(String(req.query.at)) : undefined;
    const data = await billingCommercialBenefitService.listCompanyCommercialBenefits(companyId, at);
    res.status(200).json({ data });
  },

  async registerCommercialBenefit(req: Request, res: Response) {
    const companyId = String(req.params.companyId);
    const subscriptionId = String(req.params.subscriptionId);
    const body = req.body as {
      benefitKind: CommercialBenefitKind;
      baseAmount?: string | null;
      discountPercent?: string | null;
      discountAmount?: string | null;
      finalAgreedAmount: string;
      currency: string;
      billingPeriod: BillingPeriod;
      seatMin: number;
      seatMax?: number | null;
      effectiveFrom: string;
      effectiveTo?: string | null;
      reason: string;
      adminRequestKey?: string | null;
    };

    const data = await billingCommercialBenefitService.registerCommercialBenefit({
      companyId,
      subscriptionId,
      benefitKind: body.benefitKind,
      baseAmount: body.baseAmount,
      discountPercent: body.discountPercent,
      discountAmount: body.discountAmount,
      finalAgreedAmount: body.finalAgreedAmount,
      currency: body.currency,
      billingPeriod: body.billingPeriod,
      seatMin: body.seatMin,
      seatMax: body.seatMax,
      effectiveFrom: parseDate(body.effectiveFrom),
      effectiveTo: body.effectiveTo ? parseDate(body.effectiveTo) : null,
      reason: body.reason,
      actorUserId: req.auth!.userId,
      adminRequestKey: body.adminRequestKey,
    });

    res.status(201).json({ data });
  },

  async getCommercialSeatQuotaSettings(req: Request, res: Response) {
    const companyId = String(req.params.companyId);
    const data = await commercialSeatQuotaSettingsService.getSettings(companyId);
    res.status(200).json({ data });
  },

  async updateCommercialSeatQuotaSettings(req: Request, res: Response) {
    const companyId = String(req.params.companyId);
    const data = await commercialSeatQuotaSettingsService.updateSettings(
      companyId,
      req.auth!.userId,
      req.body,
    );
    res.status(200).json({ data });
  },
};