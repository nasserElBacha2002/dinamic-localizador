import { z } from "zod";

/**
 * Known Twilio inbound fields used by the bot.
 * Additional provider fields (e.g. forward indicators) survive via `.passthrough()`
 * and are interpreted by `extractLocationMessageMetadata` — do not assume a single
 * hard-coded Twilio key without runtime evidence.
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
    // Optional candidates — presence/absence is evidence, not required by Twilio today.
    Forwarded: z.string().optional(),
    FrequentlyForwarded: z.string().optional(),
    ChannelMetadata: z.string().optional(),
  })
  .passthrough();

export type TwilioWebhookInput = z.infer<typeof twilioWebhookSchema>;
