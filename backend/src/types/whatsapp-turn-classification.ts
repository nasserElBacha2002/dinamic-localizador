import type {
  WhatsAppSystemInteractionCategory,
  WhatsAppSystemInteractionStatus,
  WhatsAppTurnClassification,
  WhatsAppTurnOrigin,
} from "../constants/whatsapp-turn-classification";

export type SystemInteractionContext = {
  id: string;
  companyId: string;
  employeeId: string;
  category: WhatsAppSystemInteractionCategory;
  relatedOperationId: string | null;
  status: WhatsAppSystemInteractionStatus;
  expiresAt: string;
  sourceKey: string;
  providerMessageSid?: string | null;
};

export type TurnClassificationInput = {
  companyId: string | null;
  employeeId: string | null;
  messageSid: string;
  messageType: string;
  activeSessionIntent?: string | null;
  activeSessionState?: string | null;
  resolvedIntent?: string | null;
  resolvedHandler?: string | null;
  /** Operation resolved by the actual turn (post-route), not only pre-session. */
  relatedOperationId?: string | null;
  globalCommand?: "cancel" | "back" | "help" | "menu" | null;
  /**
   * Only a correlated candidate (company/employee/category/operation evidence).
   * Never pass a random TOP-1 interaction.
   */
  correlatedSystemInteraction?: SystemInteractionContext | null;
  /** Injected clock for pure evaluation. */
  nowMs?: number;
};

export type TurnClassificationResult = {
  origin: WhatsAppTurnOrigin;
  classification: WhatsAppTurnClassification;
  category: string;
  reasonCode: string;
  ruleVersion: string;
  relatedOperationId?: string | null;
  systemInteractionId?: string | null;
};

export type WhatsAppTurnClassificationRecord = TurnClassificationResult & {
  companyId: string | null;
  employeeId: string | null;
  messageSid: string;
  messageType: string;
  activeSessionIntent: string | null;
  activeSessionState: string | null;
  resolvedIntent: string | null;
  resolvedHandler: string | null;
  causationMessageSid?: string | null;
  classifiedAt: string;
};
