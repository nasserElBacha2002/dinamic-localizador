import { z } from "zod";

/**
 * Known Twilio inbound fields used by the bot.
 * Forwarded / FrequentlyForwarded are the official Twilio WhatsApp forward contract
 * (optional — normal location messages omit them).
 * `.passthrough()` keeps unrelated provider fields (e.g. ChannelMetadata) for raw_payload only;
 * anti-forward enforcement reads only top-level Forwarded / FrequentlyForwarded.
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
    /** Twilio WhatsApp quick-reply postback payload. */
    ButtonPayload: z.string().trim().min(1).optional(),
    /** Twilio WhatsApp reply context: the outbound message containing the button. */
    OriginalRepliedMessageSid: z.string().trim().min(1).optional(),
  })
  .passthrough();

export type TwilioWebhookInput = z.infer<typeof twilioWebhookSchema>;
