import type { TwilioWebhookPayload } from "../types/twilio.types";

/**
 * Narrow Twilio webhook payload to string-valued records for persistence / simulation.
 * Avoids `as unknown as Record<…>` while preserving optional and Media* fields.
 */
export const twilioWebhookPayloadToStringRecord = (
  payload: TwilioWebhookPayload,
): Record<string, string> => {
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload as object)) {
    if (typeof value === "string") {
      record[key] = value;
    }
  }
  return record;
};

export const twilioWebhookPayloadToUnknownRecord = (
  payload: TwilioWebhookPayload,
): Record<string, unknown> => {
  const record: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as object)) {
    record[key] = value;
  }
  return record;
};
