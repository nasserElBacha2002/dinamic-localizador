import type {
  WhatsAppQuotaMode,
  WhatsAppQuotaOutboundStatus,
  WhatsAppQuotaTurnDecision,
} from "../constants/whatsapp-usage-quota";

export type WhatsAppQuotaPolicy = {
  mode: WhatsAppQuotaMode;
  dailyTurns: number;
  weeklyTurns: number;
  burstTurns: number;
  burstWindowSeconds: number;
  dailyOutbounds: number;
  weeklyOutbounds: number;
  companyDailyOutbounds: number;
  limitNoticeEnabled: boolean;
  timezoneId: string;
};

export type QuotaTurnAdmissionResult = {
  decision: WhatsAppQuotaTurnDecision;
  reasonCode: string;
  mode: WhatsAppQuotaMode;
  /** When blocked, earliest UTC instant when the blocking control may recover. */
  recoverAtUtc?: string | null;
  duplicate?: boolean;
};

export type QuotaOutboundReserveResult =
  | {
      ok: true;
      reservationId: string;
      status: WhatsAppQuotaOutboundStatus;
      reused: boolean;
    }
  | {
      ok: false;
      reasonCode: string;
      recoverAtUtc?: string | null;
    };

export type PlannedTurnDestination = {
  /** Authoritative planned handler family before side effects. */
  resolvedHandler: string | null;
  resolvedIntent: string | null;
  relatedOperationId: string | null;
  globalCommand: "cancel" | "back" | "help" | "menu" | null;
  /** Menu option key when applicable. */
  menuOptionKey?: string | null;
};
