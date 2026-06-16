import { Router } from "express";
import { twilioWebhookController } from "../controllers/twilio-webhook.controller";
import { asyncHandler } from "../middleware/async-handler";
import { validateTwilioSignature } from "../middleware/validate-twilio-signature";

export const twilioRouter = Router();

twilioRouter.post(
  "/whatsapp",
  validateTwilioSignature,
  asyncHandler(twilioWebhookController.handleWhatsApp),
);
