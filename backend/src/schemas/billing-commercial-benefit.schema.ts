import { z } from "zod";
import { BILLING_PERIODS } from "../constants/billing-catalog";
import { COMMERCIAL_BENEFIT_KINDS } from "../constants/billing-commercial-benefit";

const isoDateTime = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Fecha inválida.",
  });

const monetaryAmountSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^\d+(\.\d{1,6})?$/, "Monto inválido.");

const percentSchema = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .regex(/^\d+(\.\d{1,4})?$/, "Porcentaje inválido.");

const adminRequestKeySchema = z.string().trim().min(1).max(128).optional().nullable();

export const registerCommercialBenefitSchema = z.object({
  benefitKind: z.enum(COMMERCIAL_BENEFIT_KINDS),
  baseAmount: monetaryAmountSchema.optional().nullable(),
  discountPercent: percentSchema.optional().nullable(),
  discountAmount: monetaryAmountSchema.optional().nullable(),
  finalAgreedAmount: monetaryAmountSchema,
  currency: z.string().trim().length(3),
  billingPeriod: z.enum(BILLING_PERIODS),
  seatMin: z.number().int().min(1),
  seatMax: z.number().int().min(1).optional().nullable(),
  effectiveFrom: isoDateTime,
  effectiveTo: isoDateTime.optional().nullable(),
  reason: z.string().trim().min(1).max(500),
  adminRequestKey: adminRequestKeySchema,
});