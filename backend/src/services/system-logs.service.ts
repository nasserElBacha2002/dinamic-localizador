import { AppError } from "../errors/app-error";
import { env } from "../config/env";
import {
  DEFAULT_SYSTEM_LOGS_INFO_EVENT_ALLOWLIST,
  SYSTEM_LOG_EVENTS,
  SYSTEM_LOG_LEVELS,
  SYSTEM_LOG_MODULES,
  SYSTEM_LOG_RETENTION_LOCK_RESOURCE,
} from "../constants/system-logs";
import { systemRuntimeLogRepository } from "../repositories/system-runtime-log.repository";
import type { SystemLogsListQuery } from "../schemas/system-logs.schema";
import { platformAuditService } from "./platform-audit.service";
import { systemLogger } from "../utils/system-logs/logger";
import {
  toSystemRuntimeLogDetail,
  toSystemRuntimeLogSummary,
} from "../utils/system-logs/present";
import { assertSystemLogsStorageAvailable } from "../utils/system-logs/storage-availability";
import { withDedicatedSessionAppLock } from "../utils/whatsapp-retention-lock";

const clampPage = (page: number): number => {
  const n = Number(page);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
};
const clampLimit = (limit: number): number => {
  const n = Number(limit);
  if (!Number.isFinite(n)) {
    return 20;
  }
  return Math.min(Math.max(Math.floor(n), 1), 50);
};

const resolveRange = (from?: string, to?: string): { from: Date; to: Date } => {
  const now = new Date();
  const resolvedTo = to ? new Date(to) : now;
  const defaultFrom = new Date(resolvedTo.getTime() - 24 * 60 * 60 * 1000);
  const resolvedFrom = from ? new Date(from) : defaultFrom;
  const maxMs = env.SYSTEM_LOGS_QUERY_MAX_DAYS * 24 * 60 * 60 * 1000;
  if (resolvedTo.getTime() - resolvedFrom.getTime() > maxMs) {
    throw new AppError(
      400,
      "SYSTEM_LOGS_RANGE_TOO_LARGE",
      `El rango máximo es de ${env.SYSTEM_LOGS_QUERY_MAX_DAYS} días.`,
    );
  }
  return { from: resolvedFrom, to: resolvedTo };
};

const auditSystemLogAccess = async (input: {
  companyId: string | null;
  userId: string;
  entityId: string;
  action: string;
}): Promise<void> => {
  try {
    await platformAuditService.logSystemLogAccess(input);
  } catch (error) {
    systemLogger.warn({
      module: "http",
      event: "system-logs.audit.failed",
      message: "Failed to persist system log access audit",
      error,
      metadata: {
        action: input.action,
        entityId: input.entityId,
        userId: input.userId,
      },
    });
  }
};

export const systemLogsService = {
  assertUiEnabled(): void {
    if (env.SYSTEM_LOGS_UI_ENABLED === false) {
      throw new AppError(404, "SYSTEM_LOGS_UI_DISABLED", "Logs del sistema deshabilitados.");
    }
  },

  async assertStorageReady(): Promise<void> {
    this.assertUiEnabled();
    await assertSystemLogsStorageAvailable();
  },

  async list(query: SystemLogsListQuery) {
    await this.assertStorageReady();
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit);
    const range = resolveRange(query.from, query.to);
    const result = await systemRuntimeLogRepository.listRaw({
      from: range.from,
      to: range.to,
      level: query.level,
      module: query.module,
      event: query.event,
      companyId: query.companyId,
      requestId: query.requestId,
      correlationId: query.correlationId,
      operationId: query.operationId,
      employeeId: query.employeeId,
      conversationId: query.conversationId,
      jobExecutionId: query.jobExecutionId,
      q: query.q,
      page,
      limit,
    });
    return {
      data: result.data.map(toSystemRuntimeLogSummary),
      meta: {
        page,
        limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / limit)),
      },
    };
  },

  async getById(id: string, userId: string) {
    await this.assertStorageReady();
    const row = await systemRuntimeLogRepository.findByIdRaw(id);
    if (!row) {
      throw new AppError(404, "SYSTEM_LOG_NOT_FOUND", "Log no encontrado.");
    }
    const detail = toSystemRuntimeLogDetail(row);
    await auditSystemLogAccess({
      companyId: detail.companyId,
      userId,
      entityId: detail.id,
      action: "SYSTEM_LOGS_VIEW_DETAIL",
    });
    return detail;
  },

  async getContext(id: string, userId: string) {
    await this.assertStorageReady();
    const row = await systemRuntimeLogRepository.findByIdRaw(id);
    if (!row) {
      throw new AppError(404, "SYSTEM_LOG_NOT_FOUND", "Log no encontrado.");
    }

    const hasKey = Boolean(row.requestId || row.correlationId || row.jobExecutionId);
    if (!hasKey) {
      await auditSystemLogAccess({
        companyId: row.companyId,
        userId,
        entityId: row.id,
        action: "SYSTEM_LOGS_VIEW_CONTEXT",
      });
      return { data: [], meta: { correlationKey: null as string | null } };
    }

    const context = await systemRuntimeLogRepository.listContextRaw({
      requestId: row.requestId,
      correlationId: row.requestId ? null : row.correlationId,
      jobExecutionId: row.requestId || row.correlationId ? null : row.jobExecutionId,
      around: new Date(row.occurredAt),
      windowMinutes: 60,
      limit: 50,
    });

    await auditSystemLogAccess({
      companyId: row.companyId,
      userId,
      entityId: row.id,
      action: "SYSTEM_LOGS_VIEW_CONTEXT",
    });

    return {
      data: context.map(toSystemRuntimeLogSummary),
      meta: {
        correlationKey: row.requestId
          ? "requestId"
          : row.correlationId
            ? "correlationId"
            : "jobExecutionId",
      },
    };
  },

  getOptions() {
    this.assertUiEnabled();
    return {
      levels: [...SYSTEM_LOG_LEVELS],
      modules: [...SYSTEM_LOG_MODULES],
      events: [...SYSTEM_LOG_EVENTS],
      infoEventAllowlist: env.SYSTEM_LOGS_INFO_EVENT_ALLOWLIST
        ? env.SYSTEM_LOGS_INFO_EVENT_ALLOWLIST.split(",").map((s) => s.trim()).filter(Boolean)
        : [...DEFAULT_SYSTEM_LOGS_INFO_EVENT_ALLOWLIST],
      queryMaxDays: env.SYSTEM_LOGS_QUERY_MAX_DAYS,
      retentionDays: env.SYSTEM_LOGS_RETENTION_DAYS,
    };
  },

  async runRetention(): Promise<{
    deleted: number;
    batches: number;
    lockSkipped: boolean;
  }> {
    const lockResult = await withDedicatedSessionAppLock(
      SYSTEM_LOG_RETENTION_LOCK_RESOURCE,
      async () => {
        const cutoff = new Date(
          Date.now() - env.SYSTEM_LOGS_RETENTION_DAYS * 24 * 60 * 60 * 1000,
        );
        let deleted = 0;
        let batches = 0;
        const maxBatches = 50;
        while (batches < maxBatches) {
          const n = await systemRuntimeLogRepository.deleteOlderThan(
            cutoff,
            env.SYSTEM_LOGS_RETENTION_BATCH_SIZE,
          );
          batches += 1;
          deleted += n;
          if (n < env.SYSTEM_LOGS_RETENTION_BATCH_SIZE) {
            break;
          }
        }
        return { deleted, batches };
      },
      { lockTimeoutMs: 0 },
    );

    if (lockResult.outcome === "skipped") {
      return { deleted: 0, batches: 0, lockSkipped: true };
    }
    return { ...lockResult.value, lockSkipped: false };
  },
};
