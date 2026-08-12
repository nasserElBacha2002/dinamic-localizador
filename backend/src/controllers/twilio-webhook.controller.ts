import type { Request, Response } from "express";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { twilioWebhookSchema } from "../schemas/twilio-webhook.schema";
import { whatsappBotService } from "../services/whatsapp-bot.service";
import { whatsappCompanyContextService } from "../services/whatsapp-company-context.service";
import { whatsappFlowTraceService } from "../services/whatsapp-flow-trace.service";
import { WHATSAPP_RESULT_CODES } from "../constants/whatsapp-observability";
import { tryNormalizeWhatsAppPhone } from "../utils/phone";

const asString = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0].trim();
  }
  return null;
};

/**
 * Inbound WhatsApp webhook handler.
 * X-Twilio-Signature is validated by `createValidateTwilioSignature` middleware
 * before this controller runs; MessageSid idempotency is enforced in
 * `whatsappWebhookEventRepository.claimInboundMessage`.
 */
export const twilioWebhookController = {
  async handleWhatsApp(req: Request, res: Response): Promise<void> {
    const parsed = twilioWebhookSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).type("text/xml").send(whatsappBotService.buildTwiml("Solicitud inválida."));
      return;
    }

    try {
      const resolution = await whatsappCompanyContextService.resolve({
        phoneFrom: parsed.data.From,
        phoneTo: parsed.data.To ?? "",
        messageSid: parsed.data.MessageSid,
      });

      if (resolution.kind === "blocked") {
        const phoneFrom = tryNormalizeWhatsAppPhone(parsed.data.From);
        if (phoneFrom) {
          await whatsappFlowTraceService.recordBlockedCompanyResolution({
            phoneNormalized: phoneFrom,
            messageSid: parsed.data.MessageSid,
            reason: resolution.reason,
            resultCode:
              resolution.reason === "ambiguous_company"
                ? WHATSAPP_RESULT_CODES.AMBIGUOUS_COMPANY
                : WHATSAPP_RESULT_CODES.COMPANY_CONTEXT_UNAVAILABLE,
            responsePreview: resolution.message.slice(0, 200),
          });
        }
        res.status(200).type("text/xml").send(whatsappBotService.buildTwiml(resolution.message));
        return;
      }

      const twiml = await whatsappBotService.handleWebhook(resolution.context, parsed.data);
      res.status(200).type("text/xml").send(twiml);
    } catch (error) {
      const message =
        error instanceof AppError
          ? error.message
          : "No se pudo determinar la empresa para procesar el mensaje.";
      res.status(200).type("text/xml").send(whatsappBotService.buildTwiml(message));
    }
  },

  async handleWhatsAppStatus(req: Request, res: Response): Promise<void> {
    if (!env.WHATSAPP_TWILIO_STATUS_CALLBACK_ENABLED) {
      res.status(204).end();
      return;
    }

    const messageSid = asString(req.body?.MessageSid) ?? asString(req.body?.SmsSid);
    const messageStatus = asString(req.body?.MessageStatus) ?? asString(req.body?.SmsStatus);
    if (!messageSid || !messageStatus) {
      res.status(400).json({ error: "INVALID_STATUS_CALLBACK" });
      return;
    }

    const errorCode = asString(req.body?.ErrorCode);
    const errorMessage = asString(req.body?.ErrorMessage);

    try {
      await whatsappFlowTraceService.recordProviderStatus({
        providerMessageSid: messageSid,
        providerStatus: messageStatus,
        errorCode,
        errorMessage,
        payload: req.body as Record<string, unknown>,
        providerTimestamp: asString(req.body?.Timestamp),
      });
      res.status(204).end();
    } catch (error) {
      console.error("[twilio-status-callback] persistence failed", {
        messageSid,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(503).json({
        error: {
          code: "STATUS_CALLBACK_PERSISTENCE_FAILED",
          message: "No se pudo persistir el estado del mensaje.",
        },
      });
    }
  },
};
