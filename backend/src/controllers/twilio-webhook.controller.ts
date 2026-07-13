import type { Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { twilioWebhookSchema } from "../schemas/twilio-webhook.schema";
import { whatsappBotService } from "../services/whatsapp-bot.service";
import { whatsappCompanyContextService } from "../services/whatsapp-company-context.service";

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
};
