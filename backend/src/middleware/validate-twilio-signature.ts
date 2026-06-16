import type { NextFunction, Request, Response } from "express";
import twilio from "twilio";
import { env } from "../config/env";

export const validateTwilioSignature = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!env.TWILIO_VALIDATE_SIGNATURE) {
    next();
    return;
  }

  const signature = req.get("X-Twilio-Signature");
  if (!signature || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WEBHOOK_URL) {
    console.warn("[twilio-webhook] missing signature validation configuration");
    res.status(403).json({
      error: {
        code: "TWILIO_SIGNATURE_INVALID",
        message: "Firma de Twilio inválida",
      },
    });
    return;
  }

  const isValid = twilio.validateRequest(
    env.TWILIO_AUTH_TOKEN,
    signature,
    env.TWILIO_WEBHOOK_URL,
    req.body as Record<string, string>,
  );

  if (!isValid) {
    console.warn("[twilio-webhook] invalid signature");
    res.status(403).json({
      error: {
        code: "TWILIO_SIGNATURE_INVALID",
        message: "Firma de Twilio inválida",
      },
    });
    return;
  }

  next();
};
