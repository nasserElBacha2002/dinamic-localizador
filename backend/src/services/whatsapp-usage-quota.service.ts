import { env } from "../config/env";
import {
  WHATSAPP_QUOTA_DEFAULTS,
  WHATSAPP_QUOTA_REASON_CODES,
  type WhatsAppQuotaMode,
} from "../constants/whatsapp-usage-quota";
import { whatsappUsageQuotaRepository } from "../repositories/whatsapp-usage-quota.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import type {
  QuotaOutboundReserveResult,
  QuotaTurnAdmissionResult,
  WhatsAppQuotaPolicy,
} from "../types/whatsapp-usage-quota";
import { resolveDayPeriod, resolveWeekPeriod } from "../utils/whatsapp-quota-periods";
import { systemLogger } from "../utils/system-logs/logger";
import { DateTime } from "luxon";

type QuotaSettingsFields = {
  whatsappQuotaMode?: string;
  whatsappQuotaDailyTurns?: number;
  whatsappQuotaWeeklyTurns?: number;
  whatsappQuotaBurstTurns?: number;
  whatsappQuotaBurstWindowSeconds?: number;
  whatsappQuotaDailyOutbounds?: number;
  whatsappQuotaWeeklyOutbounds?: number;
  whatsappQuotaCompanyDailyOutbounds?: number;
  whatsappQuotaLimitNoticeEnabled?: boolean;
  operationTimezone: string;
};

const parseMode = (raw: string | null | undefined): WhatsAppQuotaMode => {
  if (raw === "SHADOW" || raw === "ENFORCE" || raw === "OFF") return raw;
  return "OFF";
};

const buildPolicyFromSettings = (
  settings: QuotaSettingsFields | null,
  timezoneFallback: string,
): WhatsAppQuotaPolicy => ({
  mode: parseMode(settings?.whatsappQuotaMode),
  dailyTurns: settings?.whatsappQuotaDailyTurns ?? WHATSAPP_QUOTA_DEFAULTS.dailyTurns,
  weeklyTurns: settings?.whatsappQuotaWeeklyTurns ?? WHATSAPP_QUOTA_DEFAULTS.weeklyTurns,
  burstTurns: settings?.whatsappQuotaBurstTurns ?? WHATSAPP_QUOTA_DEFAULTS.burstTurns,
  burstWindowSeconds:
    settings?.whatsappQuotaBurstWindowSeconds ?? WHATSAPP_QUOTA_DEFAULTS.burstWindowSeconds,
  dailyOutbounds: settings?.whatsappQuotaDailyOutbounds ?? WHATSAPP_QUOTA_DEFAULTS.dailyOutbounds,
  weeklyOutbounds:
    settings?.whatsappQuotaWeeklyOutbounds ?? WHATSAPP_QUOTA_DEFAULTS.weeklyOutbounds,
  companyDailyOutbounds:
    settings?.whatsappQuotaCompanyDailyOutbounds ?? WHATSAPP_QUOTA_DEFAULTS.companyDailyOutbounds,
  limitNoticeEnabled:
    settings?.whatsappQuotaLimitNoticeEnabled ?? WHATSAPP_QUOTA_DEFAULTS.limitNoticeEnabled,
  timezoneId: settings?.operationTimezone ?? timezoneFallback,
});

export const resolveEffectiveQuotaMode = (
  globalMode: WhatsAppQuotaMode,
  companyMode: WhatsAppQuotaMode,
): WhatsAppQuotaMode => {
  if (globalMode === "OFF" || companyMode === "OFF") return "OFF";
  if (globalMode === "ENFORCE" && companyMode === "ENFORCE") return "ENFORCE";
  return "SHADOW";
};

const formatRecoverMessage = (
  reasonCode: string,
  recoverAtUtc: string | null,
  timezoneId: string,
): string => {
  const attendanceHint =
    "Podés seguir registrando llegada, ubicación y salida cuando corresponda.";
  if (!recoverAtUtc) {
    return `Alcanzaste el límite de consultas por WhatsApp. ${attendanceHint}`;
  }
  const local = DateTime.fromISO(recoverAtUtc, { zone: "utc" }).setZone(timezoneId);
  const when = local.isValid ? local.toFormat("dd/MM/yyyy HH:mm") : recoverAtUtc;
  if (reasonCode === "BLOCKED_WEEKLY_TURNS" || reasonCode === "BLOCKED_WEEKLY_OUTBOUNDS") {
    return `Alcanzaste el límite semanal de consultas por WhatsApp. Se restablece el ${when}. ${attendanceHint}`;
  }
  if (reasonCode === "BLOCKED_BURST") {
    return `Estás enviando consultas muy seguido. Probá de nuevo en un minuto. ${attendanceHint}`;
  }
  if (reasonCode === "BLOCKED_COMPANY_DAILY_OUTBOUNDS") {
    return `Se alcanzó el límite diario de mensajes de la empresa. Se restablece el ${when}. ${attendanceHint}`;
  }
  return `Alcanzaste el límite diario de consultas por WhatsApp. Se restablece el ${when}. ${attendanceHint}`;
};

/**
 * Phase 2 usage quotas. Critical attendance paths never call admit/reserve.
 * Fail-closed for EMPLOYEE_LIMITED when quota store is unavailable.
 */
export const whatsappUsageQuotaService = {
  async loadPolicy(companyId: string): Promise<WhatsAppQuotaPolicy> {
    const settings = await companySettingsRepository.findByCompanyId(companyId);
    return buildPolicyFromSettings(
      settings as QuotaSettingsFields | null,
      env.BOT_OPERATION_TIMEZONE,
    );
  },

  effectiveMode(policy: WhatsAppQuotaPolicy): WhatsAppQuotaMode {
    return resolveEffectiveQuotaMode(env.WHATSAPP_QUOTA_GLOBAL_MODE, policy.mode);
  },

  /** Read-only would-block for SHADOW — does not mutate enforcement counters. */
  async evaluateWouldBlockTurn(input: {
    companyId: string;
    employeeId: string;
    policy: WhatsAppQuotaPolicy;
    now: Date;
  }): Promise<{ blocked: boolean; reasonCode: string; recoverAtUtc: string | null }> {
    const day = resolveDayPeriod(input.now, input.policy.timezoneId);
    const week = resolveWeekPeriod(input.now, input.policy.timezoneId);

    const dayUsage = await whatsappUsageQuotaRepository.getEmployeePeriodUsage({
      companyId: input.companyId,
      employeeId: input.employeeId,
      periodKind: day.kind,
      periodKey: day.periodKey,
    });
    const weekUsage = await whatsappUsageQuotaRepository.getEmployeePeriodUsage({
      companyId: input.companyId,
      employeeId: input.employeeId,
      periodKind: week.kind,
      periodKey: week.periodKey,
    });

    const dayUsed = dayUsage?.turnsUsed ?? 0;
    const dayLimit = dayUsage?.turnLimit ?? input.policy.dailyTurns;
    if (dayUsed + 1 > dayLimit) {
      return {
        blocked: true,
        reasonCode: WHATSAPP_QUOTA_REASON_CODES.BLOCKED_DAILY_TURNS,
        recoverAtUtc: (dayUsage?.periodEndUtc ?? day.periodEndUtc).toISOString(),
      };
    }

    const weekUsed = weekUsage?.turnsUsed ?? 0;
    const weekLimit = weekUsage?.turnLimit ?? input.policy.weeklyTurns;
    if (weekUsed + 1 > weekLimit) {
      return {
        blocked: true,
        reasonCode: WHATSAPP_QUOTA_REASON_CODES.BLOCKED_WEEKLY_TURNS,
        recoverAtUtc: (weekUsage?.periodEndUtc ?? week.periodEndUtc).toISOString(),
      };
    }

    const burstSince = new Date(input.now.getTime() - input.policy.burstWindowSeconds * 1000);
    const burstCount = await whatsappUsageQuotaRepository.countRecentAdmissions({
      companyId: input.companyId,
      employeeId: input.employeeId,
      since: burstSince,
    });
    if (burstCount + 1 > input.policy.burstTurns) {
      return {
        blocked: true,
        reasonCode: WHATSAPP_QUOTA_REASON_CODES.BLOCKED_BURST,
        recoverAtUtc: new Date(input.now.getTime() + 60_000).toISOString(),
      };
    }

    return {
      blocked: false,
      reasonCode: WHATSAPP_QUOTA_REASON_CODES.ADMITTED,
      recoverAtUtc: null,
    };
  },

  async admitNonCriticalTurn(input: {
    companyId: string;
    employeeId: string;
    messageSid: string;
    classification: string;
    now?: Date;
  }): Promise<QuotaTurnAdmissionResult> {
    const now = input.now ?? new Date();
    try {
      const existing = await whatsappUsageQuotaRepository.findTurnAdmission(input.messageSid);
      if (existing) {
        return {
          decision: existing.decision as QuotaTurnAdmissionResult["decision"],
          reasonCode: existing.reasonCode,
          mode: existing.mode as WhatsAppQuotaMode,
          duplicate: true,
        };
      }

      const policy = await this.loadPolicy(input.companyId);
      const mode = this.effectiveMode(policy);

      if (mode === "OFF") {
        await whatsappUsageQuotaRepository.insertTurnDecision({
          companyId: input.companyId,
          employeeId: input.employeeId,
          messageSid: input.messageSid,
          decision: "ADMITTED",
          reasonCode: WHATSAPP_QUOTA_REASON_CODES.MODE_OFF,
          classification: input.classification,
          mode,
          admittedAt: now,
        });
        return { decision: "ADMITTED", reasonCode: WHATSAPP_QUOTA_REASON_CODES.MODE_OFF, mode };
      }

      const day = resolveDayPeriod(now, policy.timezoneId);
      const week = resolveWeekPeriod(now, policy.timezoneId);

      if (mode === "SHADOW") {
        const would = await this.evaluateWouldBlockTurn({
          companyId: input.companyId,
          employeeId: input.employeeId,
          policy,
          now,
        });
        const decision = would.blocked ? "SHADOW_WOULD_REJECT" : "SHADOW_WOULD_ADMIT";
        await whatsappUsageQuotaRepository.insertTurnDecision({
          companyId: input.companyId,
          employeeId: input.employeeId,
          messageSid: input.messageSid,
          decision,
          reasonCode: would.reasonCode,
          classification: input.classification,
          mode,
          admittedAt: would.blocked ? null : now,
        });
        return {
          decision,
          reasonCode: would.reasonCode,
          mode,
          recoverAtUtc: would.recoverAtUtc,
        };
      }

      const result = await whatsappUsageQuotaRepository.admitTurnAtomic({
        companyId: input.companyId,
        employeeId: input.employeeId,
        messageSid: input.messageSid,
        classification: input.classification,
        mode,
        day: {
          companyId: input.companyId,
          employeeId: input.employeeId,
          window: day,
          turnLimit: policy.dailyTurns,
          outboundLimit: policy.dailyOutbounds,
        },
        week: {
          companyId: input.companyId,
          employeeId: input.employeeId,
          window: week,
          turnLimit: policy.weeklyTurns,
          outboundLimit: policy.weeklyOutbounds,
        },
        burstTurns: policy.burstTurns,
        burstWindowSeconds: policy.burstWindowSeconds,
        now,
      });

      if (!result.ok) {
        if (result.reasonCode === "DUPLICATE") {
          const again = await whatsappUsageQuotaRepository.findTurnAdmission(input.messageSid);
          return {
            decision: (again?.decision as QuotaTurnAdmissionResult["decision"]) ?? "DUPLICATE",
            reasonCode: again?.reasonCode ?? "DUPLICATE",
            mode,
            duplicate: true,
          };
        }
        await whatsappUsageQuotaRepository.insertTurnDecision({
          companyId: input.companyId,
          employeeId: input.employeeId,
          messageSid: input.messageSid,
          decision: "REJECTED",
          reasonCode: result.reasonCode,
          classification: input.classification,
          mode,
        });
        return {
          decision: "REJECTED",
          reasonCode: result.reasonCode,
          mode,
          recoverAtUtc: result.recoverAtUtc?.toISOString() ?? null,
        };
      }

      return { decision: "ADMITTED", reasonCode: result.reasonCode, mode };
    } catch (error) {
      systemLogger.warn({
        module: "whatsapp-quota",
        event: "whatsapp.quota.admit_failed",
        message: "Quota admit failed (fail-closed for limited)",
        error,
        metadata: {
          companyId: input.companyId,
          employeeId: input.employeeId,
          messageSid: input.messageSid,
        },
      });
      try {
        await whatsappUsageQuotaRepository.insertTurnDecision({
          companyId: input.companyId,
          employeeId: input.employeeId,
          messageSid: input.messageSid,
          decision: "QUOTA_FAILURE",
          reasonCode: WHATSAPP_QUOTA_REASON_CODES.QUOTA_FAILURE,
          classification: input.classification,
          mode: "ENFORCE",
        });
      } catch {
        // ignore duplicate / secondary failure
      }
      return {
        decision: "QUOTA_FAILURE",
        reasonCode: WHATSAPP_QUOTA_REASON_CODES.QUOTA_FAILURE,
        mode: "ENFORCE",
      };
    }
  },

  async recordExemptCritical(input: {
    companyId: string;
    employeeId: string;
    messageSid: string;
    classification: string;
  }): Promise<void> {
    try {
      const policy = await this.loadPolicy(input.companyId);
      const mode = this.effectiveMode(policy);
      if (mode === "OFF") return;
      await whatsappUsageQuotaRepository.insertTurnDecision({
        companyId: input.companyId,
        employeeId: input.employeeId,
        messageSid: input.messageSid,
        decision: "EXEMPT_CRITICAL",
        reasonCode: WHATSAPP_QUOTA_REASON_CODES.EXEMPT_CRITICAL,
        classification: input.classification,
        mode,
      });
    } catch {
      // Critical paths must not fail on quota telemetry.
    }
  },

  async recordAmbiguousHeld(input: {
    companyId: string;
    employeeId: string;
    messageSid: string;
    classification: string;
  }): Promise<void> {
    try {
      const policy = await this.loadPolicy(input.companyId);
      const mode = this.effectiveMode(policy);
      if (mode === "OFF") return;
      await whatsappUsageQuotaRepository.insertTurnDecision({
        companyId: input.companyId,
        employeeId: input.employeeId,
        messageSid: input.messageSid,
        decision: "AMBIGUOUS_HELD",
        reasonCode: WHATSAPP_QUOTA_REASON_CODES.AMBIGUOUS_HELD,
        classification: input.classification,
        mode,
      });
    } catch {
      // ignore
    }
  },

  async reserveOutbound(input: {
    companyId: string;
    employeeId: string;
    turnMessageSid: string;
    logicalOutboundKey: string;
    now?: Date;
  }): Promise<QuotaOutboundReserveResult> {
    const now = input.now ?? new Date();
    try {
      const policy = await this.loadPolicy(input.companyId);
      const mode = this.effectiveMode(policy);
      if (mode === "OFF" || mode === "SHADOW") {
        return {
          ok: true,
          reservationId: `noop:${input.logicalOutboundKey}`,
          status: "ACCEPTED",
          reused: false,
        };
      }
      const day = resolveDayPeriod(now, policy.timezoneId);
      const week = resolveWeekPeriod(now, policy.timezoneId);
      const result = await whatsappUsageQuotaRepository.reserveOutboundAtomic({
        companyId: input.companyId,
        employeeId: input.employeeId,
        turnMessageSid: input.turnMessageSid,
        logicalOutboundKey: input.logicalOutboundKey,
        mode,
        day: {
          companyId: input.companyId,
          employeeId: input.employeeId,
          window: day,
          turnLimit: policy.dailyTurns,
          outboundLimit: policy.dailyOutbounds,
        },
        week: {
          companyId: input.companyId,
          employeeId: input.employeeId,
          window: week,
          turnLimit: policy.weeklyTurns,
          outboundLimit: policy.weeklyOutbounds,
        },
        companyDay: {
          companyId: input.companyId,
          window: day,
          outboundLimit: policy.companyDailyOutbounds,
        },
      });
      if (!result.ok) {
        return {
          ok: false,
          reasonCode: result.reasonCode,
          recoverAtUtc: result.recoverAtUtc?.toISOString() ?? null,
        };
      }
      return {
        ok: true,
        reservationId: result.reservationId,
        status: "RESERVED",
        reused: result.reused,
      };
    } catch (error) {
      systemLogger.warn({
        module: "whatsapp-quota",
        event: "whatsapp.quota.outbound_reserve_failed",
        message: "Outbound reserve failed (fail-closed)",
        error,
        metadata: { logicalOutboundKey: input.logicalOutboundKey },
      });
      return { ok: false, reasonCode: WHATSAPP_QUOTA_REASON_CODES.QUOTA_FAILURE };
    }
  },

  buildLimitNoticeText(input: {
    reasonCode: string;
    recoverAtUtc: string | null;
    timezoneId: string;
  }): string {
    return formatRecoverMessage(input.reasonCode, input.recoverAtUtc, input.timezoneId);
  },

  async tryClaimLimitNotice(input: {
    companyId: string;
    employeeId: string;
    reasonCode: string;
    recoverAtUtc: string | null;
    periodKey: string;
  }): Promise<{ claimed: boolean; episodeKey: string; message: string | null }> {
    const policy = await this.loadPolicy(input.companyId);
    const episodeKey = `${input.reasonCode}:${input.periodKey}`;
    if (!policy.limitNoticeEnabled) {
      return { claimed: false, episodeKey, message: null };
    }
    const claim = await whatsappUsageQuotaRepository.claimLimitNotice({
      companyId: input.companyId,
      employeeId: input.employeeId,
      episodeKey,
      blockingReason: input.reasonCode,
      recoverAtUtc: input.recoverAtUtc ? new Date(input.recoverAtUtc) : null,
    });
    if (claim === "exists") {
      return { claimed: false, episodeKey, message: null };
    }
    return {
      claimed: true,
      episodeKey,
      message: this.buildLimitNoticeText({
        reasonCode: input.reasonCode,
        recoverAtUtc: input.recoverAtUtc,
        timezoneId: policy.timezoneId,
      }),
    };
  },

  markOutboundAccepted: (...args: Parameters<typeof whatsappUsageQuotaRepository.markOutboundAccepted>) =>
    whatsappUsageQuotaRepository.markOutboundAccepted(...args),
  markOutboundAttemptStarted: (
    ...args: Parameters<typeof whatsappUsageQuotaRepository.markOutboundAttemptStarted>
  ) => whatsappUsageQuotaRepository.markOutboundAttemptStarted(...args),
  releaseOutboundIfReserved: (
    ...args: Parameters<typeof whatsappUsageQuotaRepository.releaseOutboundIfReserved>
  ) => whatsappUsageQuotaRepository.releaseOutboundIfReserved(...args),
  markOutboundAmbiguous: (
    ...args: Parameters<typeof whatsappUsageQuotaRepository.markOutboundAmbiguous>
  ) => whatsappUsageQuotaRepository.markOutboundAmbiguous(...args),
  completeLimitNotice: (...args: Parameters<typeof whatsappUsageQuotaRepository.completeLimitNotice>) =>
    whatsappUsageQuotaRepository.completeLimitNotice(...args),
};
