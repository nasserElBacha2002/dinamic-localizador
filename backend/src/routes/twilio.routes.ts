import { Router } from "express";
import twilio from "twilio";
import { twilioWebhookController } from "../controllers/twilio-webhook.controller";
import { env } from "../config/env";
import { asyncHandler } from "../middleware/async-handler";
import { createValidateTwilioSignature } from "../middleware/validate-twilio-signature";

export const twilioRouter = Router();

const validateTwilioSignature = createValidateTwilioSignature({
  validateSignature: env.TWILIO_VALIDATE_SIGNATURE,
  authToken: env.TWILIO_AUTH_TOKEN,
  webhookUrl: env.TWILIO_WEBHOOK_URL,
  nodeEnv: env.NODE_ENV,
  validateRequestFn: twilio.validateRequest,
});

twilioRouter.post(
  "/whatsapp",
  validateTwilioSignature,
  asyncHandler(twilioWebhookController.handleWhatsApp),
);
