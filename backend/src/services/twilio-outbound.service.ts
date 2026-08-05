import twilio from "twilio";
import { env } from "../config/env";
import { formatWhatsAppAddress } from "../utils/whatsapp-phone";

export interface WhatsAppTemplateSendInput {
  toPhoneNumber: string;
  contentSid: string;
  contentVariables: Record<string, string>;
}

export interface WhatsAppTemplateSendResult {
  messageSid: string;
}

export interface WhatsAppDocumentSendInput {
  toPhoneNumber: string;
  body: string;
  mediaUrl: string;
}

export interface WhatsAppDocumentSendResult {
  messageSid: string;
}

let twilioClient: ReturnType<typeof twilio> | null = null;

const getTwilioClient = (): ReturnType<typeof twilio> => {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    throw new Error("TWILIO_CREDENTIALS_NOT_CONFIGURED");
  }

  if (!twilioClient) {
    twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }

  return twilioClient;
};

export const twilioOutboundService = {
  isConfigured(): boolean {
    return Boolean(
      env.TWILIO_ACCOUNT_SID &&
        env.TWILIO_AUTH_TOKEN &&
        env.TWILIO_WHATSAPP_NUMBER &&
        env.TWILIO_ARRIVAL_REMINDER_CONTENT_SID &&
        env.TWILIO_EXIT_REMINDER_CONTENT_SID,
    );
  },

  async sendWhatsAppTemplate(
    input: WhatsAppTemplateSendInput,
  ): Promise<WhatsAppTemplateSendResult> {
    if (!env.TWILIO_WHATSAPP_NUMBER) {
      throw new Error("TWILIO_WHATSAPP_NUMBER_NOT_CONFIGURED");
    }

    const client = getTwilioClient();
    const createParams: {
      from: string;
      to: string;
      contentSid: string;
      contentVariables: string;
      statusCallback?: string;
    } = {
      from: formatWhatsAppAddress(env.TWILIO_WHATSAPP_NUMBER),
      to: formatWhatsAppAddress(input.toPhoneNumber),
      contentSid: input.contentSid,
      contentVariables: JSON.stringify(input.contentVariables),
    };

    if (env.WHATSAPP_TWILIO_STATUS_CALLBACK_ENABLED && env.TWILIO_STATUS_CALLBACK_URL) {
      createParams.statusCallback = env.TWILIO_STATUS_CALLBACK_URL;
    }

    const message = await client.messages.create(createParams);

    return {
      messageSid: message.sid,
    };
  },

  async sendWhatsAppDocument(
    input: WhatsAppDocumentSendInput,
  ): Promise<WhatsAppDocumentSendResult> {
    if (!env.TWILIO_WHATSAPP_NUMBER) {
      throw new Error("TWILIO_WHATSAPP_NUMBER_NOT_CONFIGURED");
    }

    const client = getTwilioClient();
    const createParams: {
      from: string;
      to: string;
      body: string;
      mediaUrl: string[];
      statusCallback?: string;
    } = {
      from: formatWhatsAppAddress(env.TWILIO_WHATSAPP_NUMBER),
      to: formatWhatsAppAddress(input.toPhoneNumber),
      body: input.body,
      mediaUrl: [input.mediaUrl],
    };

    if (env.WHATSAPP_TWILIO_STATUS_CALLBACK_ENABLED && env.TWILIO_STATUS_CALLBACK_URL) {
      createParams.statusCallback = env.TWILIO_STATUS_CALLBACK_URL;
    }

    const message = await client.messages.create(createParams);

    return {
      messageSid: message.sid,
    };
  },
};
