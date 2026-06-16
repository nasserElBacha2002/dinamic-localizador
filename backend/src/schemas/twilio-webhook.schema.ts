import { z } from "zod";

export const twilioWebhookSchema = z.object({
  MessageSid: z.string().trim().min(1),
  From: z.string().trim().min(1),
  To: z.string().trim().min(1),
  Body: z.string().optional(),
  Latitude: z.string().optional(),
  Longitude: z.string().optional(),
  Address: z.string().optional(),
  Label: z.string().optional(),
  NumMedia: z.string().optional(),
});

export type TwilioWebhookInput = z.infer<typeof twilioWebhookSchema>;
