import { toCompanySettingsInput } from "../constants/company-settings";
import { roleHasPermission } from "../constants/company-permissions";
import {
  WHATSAPP_QUOTA_DEFAULTS,
  type WhatsAppQuotaMode,
} from "../constants/whatsapp-usage-quota";
import { AppError } from "../errors/app-error";
import { companyRepository } from "../repositories/company.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { getPool } from "../database/connection";
import sql from "mssql";
import type { UpdateWhatsAppQuotaSettingsInput } from "../schemas/whatsapp-quota-settings.schema";
import type { CompanyMembershipSummary } from "../types/company";
import { systemLogger } from "../utils/system-logs/logger";
import { auditService } from "./audit.service";
import {
  explainEffectiveQuotaMode,
  type EffectiveQuotaModeReason,
} from "./whatsapp-usage-quota.service";
import { env } from "../config/env";

export type WhatsAppQuotaSettingsView = {
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

const parseGlobalMode = (): WhatsAppQuotaMode => {
  const raw = env.WHATSAPP_QUOTA_GLOBAL_MODE;
  if (raw === "SHADOW" || raw === "ENFORCE" || raw === "OFF") return raw;
  return "OFF";
};

const assertActiveCompany = async (companyId: string): Promise<void> => {
  const company = await companyRepository.findById(companyId);
  if (!company || company.status !== "ACTIVE") {
    throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
  }
};

const buildView = async (
  companyId: string,
  settings: {
    whatsappQuotaMode: WhatsAppQuotaMode;
    whatsappQuotaDailyTurns: number;
    whatsappQuotaWeeklyTurns: number;
    whatsappQuotaBurstTurns: number;
    whatsappQuotaBurstWindowSeconds: number;
    whatsappQuotaDailyOutbounds: number;
    whatsappQuotaWeeklyOutbounds: number;
    whatsappQuotaCompanyDailyOutbounds: number;
    whatsappQuotaLimitNoticeEnabled: boolean;
    operationTimezone: string;
    updatedAt: string;
  },
  includeShadow: boolean,
): Promise<WhatsAppQuotaSettingsView> => {
  const globalMode = parseGlobalMode();
  const companyMode = settings.whatsappQuotaMode;
  const { effectiveMode, effectiveModeReason } = explainEffectiveQuotaMode(
    globalMode,
    companyMode,
  );

  let shadowSummary: WhatsAppQuotaShadowSummary | null = null;
  if (includeShadow) {
    try {
      shadowSummary = await loadShadowSummary(companyId, 7);
    } catch (error) {
      systemLogger.warn({
        module: "whatsapp-quota-settings",
        event: "whatsapp.quota.settings.shadow_summary_failed",
        message: "Shadow summary query failed; returning settings without metrics",
        error,
        metadata: { companyId },
      });
      shadowSummary = null;
    }
  }

  return {
    companyId,
    globalMode,
    companyMode,
    effectiveMode,
    effectiveModeReason,
    timezoneId: settings.operationTimezone,
    dailyTurns: settings.whatsappQuotaDailyTurns,
    weeklyTurns: settings.whatsappQuotaWeeklyTurns,
    burstTurns: settings.whatsappQuotaBurstTurns,
    burstWindowSeconds: settings.whatsappQuotaBurstWindowSeconds,
    dailyOutbounds: settings.whatsappQuotaDailyOutbounds,
    weeklyOutbounds: settings.whatsappQuotaWeeklyOutbounds,
    companyDailyOutbounds: settings.whatsappQuotaCompanyDailyOutbounds,
    limitNoticeEnabled: settings.whatsappQuotaLimitNoticeEnabled,
    updatedAt: settings.updatedAt,
    updatedBy: null,
    limits: {
      maxDailyTurns: WHATSAPP_QUOTA_DEFAULTS.maxDailyTurns,
      maxWeeklyTurns: WHATSAPP_QUOTA_DEFAULTS.maxWeeklyTurns,
      maxBurstTurns: WHATSAPP_QUOTA_DEFAULTS.maxBurstTurns,
      minBurstWindowSeconds: WHATSAPP_QUOTA_DEFAULTS.minBurstWindowSeconds,
      maxBurstWindowSeconds: WHATSAPP_QUOTA_DEFAULTS.maxBurstWindowSeconds,
      maxDailyOutbounds: WHATSAPP_QUOTA_DEFAULTS.maxDailyOutbounds,
      maxWeeklyOutbounds: WHATSAPP_QUOTA_DEFAULTS.maxWeeklyOutbounds,
      maxCompanyDailyOutbounds: WHATSAPP_QUOTA_DEFAULTS.maxCompanyDailyOutbounds,
    },
    shadowSummary,
  };
};

const loadShadowSummary = async (
  companyId: string,
  windowDays: number,
): Promise<WhatsAppQuotaShadowSummary> => {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const pool = getPool();
  const turns = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("since", sql.DateTime2, since)
    .query(`
      SELECT
        COUNT(*) AS turns_evaluated,
        SUM(CASE WHEN decision = N'SHADOW_WOULD_ADMIT' THEN 1 ELSE 0 END) AS would_admit,
        SUM(CASE WHEN decision = N'SHADOW_WOULD_REJECT' THEN 1 ELSE 0 END) AS would_reject,
        COUNT(DISTINCT CASE
          WHEN decision IN (N'SHADOW_WOULD_ADMIT', N'SHADOW_WOULD_REJECT')
          THEN employee_id END) AS employees_affected,
        MAX(created_at) AS last_event_at
      FROM dbo.whatsapp_quota_turn_admissions
      WHERE company_id = @companyId
        AND mode = N'SHADOW'
        AND created_at >= @since
        AND decision IN (N'SHADOW_WOULD_ADMIT', N'SHADOW_WOULD_REJECT');
    `);

  const reasons = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("since", sql.DateTime2, since)
    .query(`
      SELECT reason_code, COUNT(*) AS cnt
      FROM dbo.whatsapp_quota_turn_admissions
      WHERE company_id = @companyId
        AND mode = N'SHADOW'
        AND decision = N'SHADOW_WOULD_REJECT'
        AND created_at >= @since
      GROUP BY reason_code;
    `);

  const outbounds = await pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("since", sql.DateTime2, since)
    .query(`
      SELECT COUNT(*) AS cnt
      FROM dbo.whatsapp_quota_outbound_reservations
      WHERE company_id = @companyId
        AND status = N'SHADOW_WOULD_REJECT'
        AND created_at >= @since;
    `);

  const row = turns.recordset[0] as Record<string, unknown>;
  const rejectReasons: Record<string, number> = {};
  for (const r of reasons.recordset as Array<Record<string, unknown>>) {
    rejectReasons[String(r.reason_code)] = Number(r.cnt);
  }

  const last = row.last_event_at;
  return {
    windowDays,
    turnsEvaluated: Number(row.turns_evaluated ?? 0),
    wouldAdmit: Number(row.would_admit ?? 0),
    wouldReject: Number(row.would_reject ?? 0),
    rejectReasons,
    employeesAffected: Number(row.employees_affected ?? 0),
    outboundWouldReject: Number(
      (outbounds.recordset[0] as Record<string, unknown> | undefined)?.cnt ?? 0,
    ),
    lastShadowEventAt: last
      ? last instanceof Date
        ? last.toISOString()
        : new Date(String(last)).toISOString()
      : null,
  };
};

export const whatsappQuotaSettingsService = {
  async getSettings(companyId: string): Promise<WhatsAppQuotaSettingsView> {
    await assertActiveCompany(companyId);
    const settings = await companySettingsRepository.findOrCreateByCompanyId(
      companyId,
      toCompanySettingsInput(),
    );
    return buildView(companyId, settings, true);
  },

  async updateSettings(
    companyId: string,
    role: CompanyMembershipSummary["role"],
    userId: string,
    input: UpdateWhatsAppQuotaSettingsInput,
  ): Promise<WhatsAppQuotaSettingsView> {
    if (!roleHasPermission(role, "company:settings:update")) {
      systemLogger.warn({
        module: "whatsapp-quota-settings",
        event: "whatsapp.quota.settings.unauthorized",
        message: "Unauthorized WhatsApp quota settings update",
        metadata: { companyId, userId, role },
      });
      throw new AppError(403, "FORBIDDEN", "No tiene permisos para actualizar la configuración.");
    }

    await assertActiveCompany(companyId);

    const existing = await companySettingsRepository.findOrCreateByCompanyId(
      companyId,
      toCompanySettingsInput(),
    );

    const globalMode = parseGlobalMode();
    const previousEffective = explainEffectiveQuotaMode(globalMode, existing.whatsappQuotaMode);
    const nextEffective = explainEffectiveQuotaMode(globalMode, input.companyMode);

    const result = await companySettingsRepository.updateWhatsAppQuotaSettings(companyId, {
      companyMode: input.companyMode,
      dailyTurns: input.dailyTurns,
      weeklyTurns: input.weeklyTurns,
      burstTurns: input.burstTurns,
      burstWindowSeconds: input.burstWindowSeconds,
      dailyOutbounds: input.dailyOutbounds,
      weeklyOutbounds: input.weeklyOutbounds,
      companyDailyOutbounds: input.companyDailyOutbounds,
      limitNoticeEnabled: input.limitNoticeEnabled,
      expectedUpdatedAt: input.expectedUpdatedAt,
    });

    if (!result) {
      throw new AppError(
        404,
        "COMPANY_SETTINGS_NOT_FOUND",
        "Configuración de empresa no encontrada.",
      );
    }
    if ("conflict" in result) {
      systemLogger.warn({
        module: "whatsapp-quota-settings",
        event: "whatsapp.quota.settings.conflict",
        message: "Concurrent WhatsApp quota settings update",
        metadata: { companyId, userId },
      });
      throw new AppError(
        409,
        "SETTINGS_CONFLICT",
        "La configuración fue modificada por otro usuario. Recargá los valores antes de volver a guardar.",
      );
    }

    const previousPayload = {
      companyMode: existing.whatsappQuotaMode,
      dailyTurns: existing.whatsappQuotaDailyTurns,
      weeklyTurns: existing.whatsappQuotaWeeklyTurns,
      burstTurns: existing.whatsappQuotaBurstTurns,
      burstWindowSeconds: existing.whatsappQuotaBurstWindowSeconds,
      dailyOutbounds: existing.whatsappQuotaDailyOutbounds,
      weeklyOutbounds: existing.whatsappQuotaWeeklyOutbounds,
      companyDailyOutbounds: existing.whatsappQuotaCompanyDailyOutbounds,
      limitNoticeEnabled: existing.whatsappQuotaLimitNoticeEnabled,
      effectiveMode: previousEffective.effectiveMode,
    };
    const newPayload = {
      companyMode: input.companyMode,
      dailyTurns: input.dailyTurns,
      weeklyTurns: input.weeklyTurns,
      burstTurns: input.burstTurns,
      burstWindowSeconds: input.burstWindowSeconds,
      dailyOutbounds: input.dailyOutbounds,
      weeklyOutbounds: input.weeklyOutbounds,
      companyDailyOutbounds: input.companyDailyOutbounds,
      limitNoticeEnabled: input.limitNoticeEnabled,
      effectiveMode: nextEffective.effectiveMode,
    };

    await auditService.log(companyId, {
      entityType: "company_settings_whatsapp_quotas",
      entityId: companyId,
      action: "WHATSAPP_QUOTA_SETTINGS_UPDATE",
      previousData: previousPayload,
      newData: newPayload,
      userId,
    });

    systemLogger.info({
      module: "whatsapp-quota-settings",
      event: "whatsapp.quota.settings.updated",
      message: "WhatsApp quota settings updated",
      metadata: {
        companyId,
        userId,
        previousMode: existing.whatsappQuotaMode,
        newMode: input.companyMode,
        previousEffective: previousEffective.effectiveMode,
        newEffective: nextEffective.effectiveMode,
      },
    });

    return buildView(companyId, result.settings, true);
  },
};
