import type { Request, Response } from "express";
import { twilioWebhookSchema } from "../schemas/twilio-webhook.schema";
import { whatsappBotService } from "../services/whatsapp-bot.service";

export const twilioWebhookController = {
  async handleWhatsApp(req: Request, res: Response): Promise<void> {
    const parsed = twilioWebhookSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).type("text/xml").send(whatsappBotService.buildTwiml("Solicitud inválida."));
      return;
    }

    const twiml = await whatsappBotService.handleWebhook(parsed.data);
    res.status(200).type("text/xml").send(twiml);
  },
};
