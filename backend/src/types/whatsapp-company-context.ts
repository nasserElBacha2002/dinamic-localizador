import type { BotSession } from "./twilio.types";

export type WhatsAppResolutionSource =
  | "active_session"
  | "receiving_number"
  | "employee_phone_unique_match"
  | "default_company_fallback"
  | "simulation_forced_company";

export interface WhatsAppInboundContext {
  companyId: string;
  employeeId: string | null;
  phoneNumber: string;
  session: BotSession | null;
  resolutionSource: WhatsAppResolutionSource;
}

export interface ResolveWhatsAppCompanyContextInput {
  phoneFrom: string;
  phoneTo: string;
  messageSid: string;
  forcedCompanyId?: string;
}

export type WhatsAppCompanyResolution =
  | { kind: "resolved"; context: WhatsAppInboundContext }
  | { kind: "blocked"; message: string; reason: "ambiguous_company" | "company_unavailable" };
