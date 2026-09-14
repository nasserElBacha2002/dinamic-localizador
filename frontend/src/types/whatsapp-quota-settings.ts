export type WhatsAppQuotaMode = "OFF" | "SHADOW" | "ENFORCE";

export type EffectiveQuotaModeReason =
  | "GLOBAL_MODE_OFF"
  | "COMPANY_MODE_OFF"
  | "BOTH_ENFORCE"
  | "SHADOW_COMBINATION";

export type WhatsAppQuotaShadowSummary = {
  windowDays: number;
  turnsEvaluated: number;
  wouldAdmit: number;
  wouldReject: number;
  rejectReasons: Record<string, number>;
  employeesAffected: number;
  outboundWouldReject: number;
  lastShadowEventAt: string | null;
};

export type WhatsAppQuotaSettings = {
  companyId: string;
  globalMode: WhatsAppQuotaMode;
  companyMode: WhatsAppQuotaMode;
  effectiveMode: WhatsAppQuotaMode;
  effectiveModeReason: EffectiveQuotaModeReason;
  timezoneId: string;
  dailyTurns: number;
  weeklyTurns: number;
  burstTurns: number;
  burstWindowSeconds: number;
  dailyOutbounds: number;
  weeklyOutbounds: number;
  companyDailyOutbounds: number;
  limitNoticeEnabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
  limits: {
    maxDailyTurns: number;
    maxWeeklyTurns: number;
    maxBurstTurns: number;
    minBurstWindowSeconds: number;
    maxBurstWindowSeconds: number;
    maxDailyOutbounds: number;
    maxWeeklyOutbounds: number;
    maxCompanyDailyOutbounds: number;
  };
  shadowSummary: WhatsAppQuotaShadowSummary | null;
};

export type UpdateWhatsAppQuotaSettingsInput = {
  companyMode: WhatsAppQuotaMode;
  dailyTurns: number;
  weeklyTurns: number;
  burstTurns: number;
  burstWindowSeconds: number;
  dailyOutbounds: number;
  weeklyOutbounds: number;
  companyDailyOutbounds: number;
  limitNoticeEnabled: boolean;
  expectedUpdatedAt?: string;
};

export type WhatsAppQuotaFormValues = {
  companyMode: WhatsAppQuotaMode;
  dailyTurns: number;
  weeklyTurns: number;
  burstTurns: number;
  burstWindowSeconds: number;
  dailyOutbounds: number;
  weeklyOutbounds: number;
  companyDailyOutbounds: number;
  limitNoticeEnabled: boolean;
};
