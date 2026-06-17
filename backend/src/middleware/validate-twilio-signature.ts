import type { NextFunction, Request, Response } from "express";
import {
  getTwilioBodyKeyMetadata,
  runTwilioSignatureValidation,
  type TwilioSignatureFailureCode,
  type TwilioSignatureValidationConfig,
} from "../utils/twilio-webhook-signature";

const signatureErrorMessages: Record<TwilioSignatureFailureCode, string> = {
  TWILIO_SIGNATURE_CONFIG_MISSING: "No fue posible validar la solicitud de Twilio",
  TWILIO_SIGNATURE_INVALID: "Firma de Twilio inválida",
};

const respondWithSignatureError = (
  res: Response,
  code: TwilioSignatureFailureCode,
): void => {
  res.status(403).json({
    error: {
      code,
      message: signatureErrorMessages[code],
    },
  });
};

export const createValidateTwilioSignature = (
  config: TwilioSignatureValidationConfig,
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signature = req.get("X-Twilio-Signature");
    const bodyMetadata = getTwilioBodyKeyMetadata(req.body);

    console.info("[twilio-webhook] signature-validation-start", {
      signaturePresent: Boolean(signature),
      webhookUrl: config.webhookUrl,
      contentType: req.get("content-type"),
      bodyKeys: bodyMetadata.bodyKeys,
      bodyKeyCount: bodyMetadata.bodyKeyCount,
    });

    const result = runTwilioSignatureValidation(config, {
      signature,
      body: req.body,
    });

    if (!result.success) {
      const logPayload = {
        signaturePresent: Boolean(signature),
        webhookUrl: config.webhookUrl,
        contentType: req.get("content-type"),
        bodyKeys: bodyMetadata.bodyKeys,
        reason: result.reason,
      };

      if (config.nodeEnv !== "production") {
        console.warn("[twilio-webhook] signature-validation-failed", logPayload);
      } else {
        console.warn("[twilio-webhook] signature-validation-failed", {
          signaturePresent: logPayload.signaturePresent,
          webhookUrl: logPayload.webhookUrl,
          contentType: logPayload.contentType,
          bodyKeys: logPayload.bodyKeys,
        });
      }

      respondWithSignatureError(res, result.code);
      return;
    }

    req.body = result.params;
    next();
  };
};
