import { z } from "zod";
import { BILLING_PERIODS, BILLING_PRICE_KINDS } from "../constants/billing-catalog";

const isoDateTime = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Fecha inválida.",
  });

const adminRequestKeySchema = z.string().trim().min(1).max(128).optional().nullable();

const commercialReferenceSchema = z.string().trim().min(1).max(500).optional().nullable();

const monetaryAmountSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^\d+(\.\d{1,6})?$/, "Monto inválido.");

export const companyIdParamsSchema = z.object({
  companyId: z.string().uuid("companyId inválido."),
});

export const createNegotiatedAgreementSchema = z.object({
  billingPlanId: z.string().uuid(),
  billingPlanTierId: z.string().uuid().optional().nullable(),
  subscriptionStatus: z.enum(["ACTIVE", "SCHEDULED"]).optional(),
  effectiveFrom: isoDateTime,
  effectiveTo: isoDateTime.optional().nullable(),
  agreedAmount: monetaryAmountSchema,
  currency: z.string().trim().length(3),
  billingPeriod: z.enum(BILLING_PERIODS),
  priceKind: z.enum(BILLING_PRICE_KINDS).optional(),
  seatMin: z.number().int().min(1),
  seatMax: z.number().int().min(1).optional().nullable(),
  commercialReference: commercialReferenceSchema,
  adminRequestKey: adminRequestKeySchema,
});

export const modifyContractualTermsSchema = z.object({
  agreedAmount: monetaryAmountSchema,
  currency: z.string().trim().length(3),
  billingPeriod: z.enum(BILLING_PERIODS),
  priceKind: z.enum(BILLING_PRICE_KINDS).optional(),
  seatMin: z.number().int().min(1),
  seatMax: z.number().int().min(1).optional().nullable(),
  effectiveFrom: isoDateTime,
  effectiveTo: isoDateTime.optional().nullable(),
  commercialReference: commercialReferenceSchema,
  adminRequestKey: adminRequestKeySchema,
});

export const subscriptionIdParamsSchema = z.object({
  companyId: z.string().uuid(),
  subscriptionId: z.string().uuid(),
});