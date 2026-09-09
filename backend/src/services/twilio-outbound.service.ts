import twilio from "twilio";
import { env } from "../config/env";
import type { MessageCostFlowLabel, MessageCostKind } from "../constants/whatsapp-message-cost";
import { formatWhatsAppAddress } from "../utils/whatsapp-phone";
import { whatsappMessageCostRecordService } from "./whatsapp-message-cost-record.service";

export interface WhatsAppCostContext {
  companyId: string | null;
  messageKind: MessageCostKind;
  flowLabel?: MessageCostFlowLabel | string | null;
  templateName?: string | null;
}

export interface WhatsAppTemplateSendInput {
  toPhoneNumber: string;
  contentSid: string;
  contentVariables: Record<string, string>;
  costContext?: WhatsAppCostContext;
}

export interface WhatsAppTemplateSendResult {
  messageSid: string;
}

export interface WhatsAppDocumentSendInput {
  toPhoneNumber: string;
  body: string;
  mediaUrl: string;
  costContext?: WhatsAppCostContext;
}

export interface WhatsAppDocumentSendResult {
  messageSid: string;
}

export interface WhatsAppTextSendInput {
  toPhoneNumber: string;
  body: string;
  costContext?: WhatsAppCostContext;
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

const recordCostAfterAccept = async (input: {
  messageSid: string;
  toPhoneNumber: string;
  messageKind: MessageCostKind;
  templateSid?: string | null;
  costContext?: WhatsAppCostContext;
}): Promise<void> => {
  const ctx = input.costContext;
  await whatsappMessageCostRecordService.recordOutboundAccepted({
    companyId: ctx?.companyId ?? null,
    providerMessageSid: input.messageSid,
    toPhoneNumber: input.toPhoneNumber,
    messageKind: ctx?.messageKind ?? input.messageKind,
    templateSid: input.templateSid ?? null,
    templateName: ctx?.templateName ?? null,
    flowLabel: ctx?.flowLabel ?? null,
    providerStatus: "SEND_ACCEPTED",
  });
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

    await recordCostAfterAccept({
      messageSid: message.sid,
      toPhoneNumber: input.toPhoneNumber,
      messageKind: "TEMPLATE",
      templateSid: input.contentSid,
      costContext: input.costContext,
    });

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

    await recordCostAfterAccept({
      messageSid: message.sid,
      toPhoneNumber: input.toPhoneNumber,
      messageKind: "DOCUMENT",
      costContext: input.costContext,
    });

    return {
      messageSid: message.sid,
    };
  },

  async sendWhatsAppText(input: WhatsAppTextSendInput): Promise<{ messageSid: string }> {
    if (!env.TWILIO_WHATSAPP_NUMBER) {
      throw new Error("TWILIO_WHATSAPP_NUMBER_NOT_CONFIGURED");
    }

    const client = getTwilioClient();
    const createParams: {
      from: string;
      to: string;
      body: string;
      statusCallback?: string;
    } = {
      from: formatWhatsAppAddress(env.TWILIO_WHATSAPP_NUMBER),
      to: formatWhatsAppAddress(input.toPhoneNumber),
      body: input.body,
    };

    if (env.WHATSAPP_TWILIO_STATUS_CALLBACK_ENABLED && env.TWILIO_STATUS_CALLBACK_URL) {
      createParams.statusCallback = env.TWILIO_STATUS_CALLBACK_URL;
    }

    const message = await client.messages.create(createParams);

    await recordCostAfterAccept({
      messageSid: message.sid,
      toPhoneNumber: input.toPhoneNumber,
      messageKind: "TEXT",
      costContext: input.costContext,
    });

    return { messageSid: message.sid };
  },
};
