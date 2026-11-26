import { Router } from "express";
import { billingCommercialController } from "../controllers/billing-commercial.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePlatformAdmin } from "../middleware/require-platform-admin";
import { validate } from "../middleware/validate";
import {
  companyIdParamsSchema,
  createNegotiatedAgreementSchema,
  modifyContractualTermsSchema,
  subscriptionIdParamsSchema,
} from "../schemas/billing-negotiated-contract.schema";
import { registerCommercialBenefitSchema } from "../schemas/billing-commercial-benefit.schema";
import { updateCommercialSeatQuotaSettingsSchema } from "../schemas/commercial-seat-quota-settings.schema";

export const billingCommercialRouter = Router();

billingCommercialRouter.use(asyncHandler(requirePlatformAdmin));

billingCommercialRouter.get(
  "/companies/:companyId/contracts",
  validate(companyIdParamsSchema, "params"),
  asyncHandler(billingCommercialController.getCompanyCommercialContracts),
);

billingCommercialRouter.post(
  "/companies/:companyId/negotiated-agreements",
  validate(companyIdParamsSchema, "params"),
  validate(createNegotiatedAgreementSchema),
  asyncHandler(billingCommercialController.createNegotiatedAgreement),
);

billingCommercialRouter.post(
  "/companies/:companyId/subscriptions/:subscriptionId/contractual-terms",
  validate(subscriptionIdParamsSchema, "params"),
  validate(modifyContractualTermsSchema),
  asyncHandler(billingCommercialController.modifyContractualTerms),
);

billingCommercialRouter.get(
  "/companies/:companyId/commercial-benefits",
  validate(companyIdParamsSchema, "params"),
  asyncHandler(billingCommercialController.listCompanyCommercialBenefits),
);

billingCommercialRouter.post(
  "/companies/:companyId/subscriptions/:subscriptionId/commercial-benefits",
  validate(subscriptionIdParamsSchema, "params"),
  validate(registerCommercialBenefitSchema),
  asyncHandler(billingCommercialController.registerCommercialBenefit),
);

billingCommercialRouter.get(
  "/companies/:companyId/commercial-seat-quota-settings",
  validate(companyIdParamsSchema, "params"),
  asyncHandler(billingCommercialController.getCommercialSeatQuotaSettings),
);

billingCommercialRouter.patch(
  "/companies/:companyId/commercial-seat-quota-settings",
  validate(companyIdParamsSchema, "params"),
  validate(updateCommercialSeatQuotaSettingsSchema),
  asyncHandler(billingCommercialController.updateCommercialSeatQuotaSettings),
);