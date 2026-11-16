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