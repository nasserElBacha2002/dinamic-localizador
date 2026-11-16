import type { Request, Response } from "express";
import type { BillingPeriod, BillingPriceKind } from "../constants/billing-catalog";
import { billingNegotiatedContractService } from "../services/billing/billing-negotiated-contract.service";

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
};