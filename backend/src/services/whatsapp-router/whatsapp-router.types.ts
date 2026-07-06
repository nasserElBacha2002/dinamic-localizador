import type { CompanyModuleKey } from "../../constants/company-modules";
import type { TwilioWebhookInput } from "../../schemas/twilio-webhook.schema";
import type { BotSession } from "../../types/twilio.types";

export type WhatsAppRouterMessageType = "TEXT" | "LOCATION" | "UNKNOWN";

export interface WhatsAppRouterRespondInput {
  message: string;
  employeeId: string | null;
  phoneFrom: string;
  phoneTo: string;
}

export interface WhatsAppRouterContext {
  companyId: string;
  employeeId: string | null;
  payload: TwilioWebhookInput;
  messageType: WhatsAppRouterMessageType;
  phoneFrom: string;
  phoneTo: string;
  moduleStates: ReadonlyMap<CompanyModuleKey, boolean>;
  session: BotSession | null;
  recentlyExpired: boolean;
  body: string;
}

export interface WhatsAppRouterHandlers {
  respond: (companyId: string, input: WhatsAppRouterRespondInput) => Promise<string>;
  startCheckIn: (input: {
    companyId: string;
    employeeId: string;
    phoneFrom: string;
    phoneTo: string;
  }) => Promise<string>;
  startCheckout: (input: {
    companyId: string;
    employeeId: string;
    phoneFrom: string;
    phoneTo: string;
    messageSid: string;
  }) => Promise<string>;
  handleInventorySelection: (input: {
    companyId: string;
    session: BotSession;
    body: string;
    employeeId: string;
    phoneFrom: string;
    phoneTo: string;
  }) => Promise<string>;
  handleCheckoutInventorySelection: (input: {
    companyId: string;
    session: BotSession;
    body: string;
    employeeId: string;
    phoneFrom: string;
    phoneTo: string;
    messageSid: string;
  }) => Promise<string>;
  processLocationCheckIn: (input: {
    companyId: string;
    session: BotSession;
    employeeId: string;
    operationId: string;
    latitude: number;
    longitude: number;
    messageSid: string;
    phoneFrom: string;
    phoneTo: string;
  }) => Promise<string>;
  processLocationCheckout: (input: {
    companyId: string;
    session: BotSession;
    employeeId: string;
    operationId: string;
    latitude: number;
    longitude: number;
    messageSid: string;
    phoneFrom: string;
    phoneTo: string;
  }) => Promise<string>;
}
