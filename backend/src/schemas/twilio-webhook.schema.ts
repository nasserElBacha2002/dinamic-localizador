import { z } from "zod";

/**
 * Known Twilio inbound fields used by the bot.
 * Forwarded / FrequentlyForwarded are the official Twilio WhatsApp forward contract.
 * `.passthrough()` keeps unrelated provider fields for raw_payload compatibility only —
 * anti-forward detection uses only Forwarded / FrequentlyForwarded.
 */
export const twilioWebhookSchema = z
  .object({
    MessageSid: z.string().trim().min(1),
    From: z.string().trim().min(1),
    To: z.string().trim().min(1),
    Body: z.string().optional(),
    Latitude: z.string().optional(),
    Longitude: z.string().optional(),
    Address: z.string().optional(),
    Label: z.string().optional(),
    NumMedia: z.string().optional(),
    Forwarded: z.string().optional(),
    FrequentlyForwarded: z.string().optional(),
  })
  .passthrough();

export type TwilioWebhookInput = z.infer<typeof twilioWebhookSchema>;
