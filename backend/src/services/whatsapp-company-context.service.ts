import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { botSessionRepository } from "../repositories/bot-session.repository";
import { companyRepository } from "../repositories/company.repository";
import { employeeRepository } from "../repositories/employee.repository";
import type {
  ResolveWhatsAppCompanyContextInput,
  WhatsAppCompanyResolution,
  WhatsAppInboundContext,
  WhatsAppResolutionSource,
} from "../types/whatsapp-company-context";
import { getBotRuntimeContext } from "../utils/bot-runtime-context";
import { normalizeWhatsAppPhone, tryNormalizeWhatsAppPhone } from "../utils/phone";
import {
  AMBIGUOUS_COMPANY_MESSAGE,
  COMPANY_CONTEXT_UNAVAILABLE_MESSAGE,
} from "./bot/bot-response.builder";
import { selectDefaultBotCompanyId } from "./company-context.service";

const logResolution = (context: WhatsAppInboundContext): void => {
  console.info("[whatsapp-company-context] resolved", {
    resolutionSource: context.resolutionSource,
    companyId: context.companyId,
    employeeId: context.employeeId ?? undefined,
    hasActiveSession: Boolean(context.session),
  });
};

const buildResolvedContext = (input: {
  companyId: string;
  employeeId: string | null;
  phoneNumber: string;
  session: WhatsAppInboundContext["session"];
  resolutionSource: WhatsAppResolutionSource;
}): WhatsAppCompanyResolution => {
  const context: WhatsAppInboundContext = {
    companyId: input.companyId,
    employeeId: input.employeeId,
    phoneNumber: input.phoneNumber,
    session: input.session,
    resolutionSource: input.resolutionSource,
  };
  logResolution(context);
  return { kind: "resolved", context };
};

const resolveForcedCompany = async (
  companyId: string,
  phoneNumber: string,
): Promise<WhatsAppCompanyResolution> => {
  const simulation = getBotRuntimeContext();
  const session = await botSessionRepository.findValidActiveByPhoneGlobal(phoneNumber);
  const scopedSession =
    session?.companyId === companyId ? session : await botSessionRepository.findValidActiveByPhone(companyId, phoneNumber);

  let employeeId: string | null = null;
  if (simulation?.employeeIdOverride) {
    employeeId = simulation.employeeIdOverride;
  } else {
    const employee = await employeeRepository.findByPhone(companyId, phoneNumber);
    employeeId = employee?.active ? employee.id : null;
  }

  return buildResolvedContext({
    companyId,
    employeeId,
    phoneNumber,
    session: scopedSession,
    resolutionSource: "simulation_forced_company",
  });
};

const resolveFromActiveSession = async (
  phoneNumber: string,
): Promise<WhatsAppCompanyResolution | null> => {
  const session = await botSessionRepository.findValidActiveByPhoneGlobal(phoneNumber, {
    mode: "production",
  });
  if (!session) {
    return null;
  }

  const employee = await employeeRepository.findById(session.companyId, session.employeeId);
  const employeeId = employee?.active ? employee.id : session.employeeId;

  return buildResolvedContext({
    companyId: session.companyId,
    employeeId,
    phoneNumber,
    session,
    resolutionSource: "active_session",
  });
};

const resolveFromReceivingNumber = async (
  phoneTo: string,
  phoneNumber: string,
): Promise<WhatsAppCompanyResolution | null> => {
  const configuredNumber = env.TWILIO_WHATSAPP_NUMBER;
  if (!configuredNumber) {
    return null;
  }

  const normalizedTo = tryNormalizeWhatsAppPhone(phoneTo);
  const normalizedConfigured = tryNormalizeWhatsAppPhone(configuredNumber);
  if (!normalizedTo || !normalizedConfigured || normalizedTo !== normalizedConfigured) {
    return null;
  }

  const activeCompanies = await companyRepository.listActive();
  if (activeCompanies.length !== 1) {
    return null;
  }

  const companyId = activeCompanies[0].id;
  const employee = await employeeRepository.findByPhone(companyId, phoneNumber);
  const session = await botSessionRepository.findValidActiveByPhone(companyId, phoneNumber, undefined, {
    mode: "production",
  });

  return buildResolvedContext({
    companyId,
    employeeId: employee?.active ? employee.id : null,
    phoneNumber,
    session,
    resolutionSource: "receiving_number",
  });
};

const resolveFromEmployeePhone = async (
  phoneNumber: string,
): Promise<WhatsAppCompanyResolution | null> => {
  const matches = await employeeRepository.listActiveByPhone(phoneNumber);

  if (matches.length > 1) {
    console.info("[whatsapp-company-context] ambiguous employee phone match", {
      phoneNumber,
      companyCount: matches.length,
    });
    return {
      kind: "blocked",
      message: AMBIGUOUS_COMPANY_MESSAGE,
      reason: "ambiguous_company",
    };
  }

  if (matches.length === 1) {
    const employee = matches[0];
    const session = await botSessionRepository.findValidActiveByPhone(employee.companyId, phoneNumber, undefined, {
      mode: "production",
    });

    return buildResolvedContext({
      companyId: employee.companyId,
      employeeId: employee.id,
      phoneNumber,
      session,
      resolutionSource: "employee_phone_unique_match",
    });
  }

  return null;
};

const resolveFromDefaultCompany = async (
  phoneNumber: string,
): Promise<WhatsAppCompanyResolution> => {
  const activeCompanies = await companyRepository.listActive();
  const companyId = selectDefaultBotCompanyId(activeCompanies, {
    defaultCompanyId: process.env.BOT_DEFAULT_COMPANY_ID ?? env.BOT_DEFAULT_COMPANY_ID,
    defaultCompanyName: process.env.BOT_DEFAULT_COMPANY_NAME ?? env.BOT_DEFAULT_COMPANY_NAME,
  });

  console.info("[whatsapp-company-context] using default company fallback", {
    companyId,
    phoneNumber,
  });

  const employee = await employeeRepository.findByPhone(companyId, phoneNumber);
  const session = await botSessionRepository.findValidActiveByPhone(companyId, phoneNumber, undefined, {
    mode: "production",
  });

  return buildResolvedContext({
    companyId,
    employeeId: employee?.active ? employee.id : null,
    phoneNumber,
    session,
    resolutionSource: "default_company_fallback",
  });
};

export const whatsappCompanyContextService = {
  async resolve(input: ResolveWhatsAppCompanyContextInput): Promise<WhatsAppCompanyResolution> {
    const phoneNumber = normalizeWhatsAppPhone(input.phoneFrom);

    if (input.forcedCompanyId) {
      return resolveForcedCompany(input.forcedCompanyId, phoneNumber);
    }

    const fromSession = await resolveFromActiveSession(phoneNumber);
    if (fromSession) {
      return fromSession;
    }

    const fromReceivingNumber = await resolveFromReceivingNumber(input.phoneTo, phoneNumber);
    if (fromReceivingNumber) {
      return fromReceivingNumber;
    }

    const fromEmployeePhone = await resolveFromEmployeePhone(phoneNumber);
    if (fromEmployeePhone) {
      return fromEmployeePhone;
    }

    try {
      return await resolveFromDefaultCompany(phoneNumber);
    } catch (error) {
      if (error instanceof AppError && error.code === "BOT_COMPANY_SELECTION_REQUIRED") {
        console.info("[whatsapp-company-context] company selection required", {
          phoneNumber,
          messageSid: input.messageSid,
        });
        return {
          kind: "blocked",
          message: COMPANY_CONTEXT_UNAVAILABLE_MESSAGE,
          reason: "company_unavailable",
        };
      }

      throw error;
    }
  },
};
