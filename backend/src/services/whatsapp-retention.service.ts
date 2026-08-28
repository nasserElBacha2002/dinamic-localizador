import { env } from "../config/env";
import { getPool } from "../database/connection";
import {
  WHATSAPP_RETENTION_LOCK_RESOURCE,
  WHATSAPP_RETENTION_TABLE_KEYS,
  type WhatsappRetentionTableKey,
} from "../constants/whatsapp-retention";
import { whatsappRetentionRepository } from "../repositories/whatsapp-retention.repository";
import { releaseSessionAppLock, tryAcquireSessionAppLock } from "../utils/sql-app-lock";
import { computeRetentionCutoff } from "../utils/whatsapp-retention-policy";

export type WhatsappRetentionRunResult = {
  skipped?: boolean;
  lockSkipped?: boolean;
  dryRun: boolean;
  cutoff: string;
  retentionDays: number;
  durationMs: number;
  tables: Record<
    WhatsappRetentionTableKey,
    { candidates: number; deleted: number; batches: number; errors?: string }
  >;
};

const emptyTableMetrics = (): WhatsappRetentionRunResult["tables"] => {
  const tables = {} as WhatsappRetentionRunResult["tables"];
  for (const key of WHATSAPP_RETENTION_TABLE_KEYS) {
    tables[key] = { candidates: 0, deleted: 0, batches: 0 };
  }
  return tables;
};

const purgeTable = async (input: {
  table: WhatsappRetentionTableKey;
  cutoff: Date;
  batchSize: number;
  maxBatches: number;
  dryRun: boolean;
}): Promise<{ candidates: number; deleted: number; batches: number }> => {
  const candidates = await whatsappRetentionRepository.countEligible(input.table, input.cutoff);
  if (input.dryRun || candidates === 0) {
    return { candidates, deleted: 0, batches: 0 };
  }

  let deleted = 0;
  let batches = 0;
  while (batches < input.maxBatches) {
    const removed = await whatsappRetentionRepository.deleteBatch(
      input.table,
      input.cutoff,
      input.batchSize,
    );
    if (removed === 0) {
      break;
    }
    deleted += removed;
    batches += 1;
  }

  return { candidates, deleted, batches };
};

export const whatsappRetentionService = {
  computeCutoff(nowUtc: Date = new Date(), retentionDays?: number): Date {
    return computeRetentionCutoff(nowUtc, retentionDays ?? env.WHATSAPP_RETENTION_DAYS);
  },

  async runCleanup(input?: {
    dryRun?: boolean;
    nowUtc?: Date;
    retentionDays?: number;
    batchSize?: number;
    maxBatchesPerTable?: number;
  }): Promise<WhatsappRetentionRunResult> {
    const started = Date.now();
    const dryRun = input?.dryRun ?? env.WHATSAPP_RETENTION_DRY_RUN;
    const nowUtc = input?.nowUtc ?? new Date();
    const retentionDays = input?.retentionDays ?? env.WHATSAPP_RETENTION_DAYS;
    const batchSize = input?.batchSize ?? env.WHATSAPP_RETENTION_BATCH_SIZE;
    const maxBatchesPerTable =
      input?.maxBatchesPerTable ?? env.WHATSAPP_RETENTION_MAX_BATCHES_PER_TABLE;
    const cutoff = computeRetentionCutoff(nowUtc, retentionDays);
    const tables = emptyTableMetrics();

    if (!env.WHATSAPP_RETENTION_CLEANUP_JOB_ENABLED) {
      return {
        skipped: true,
        dryRun,
        cutoff: cutoff.toISOString(),
        retentionDays,
        durationMs: Date.now() - started,
        tables,
      };
    }

    const pool = getPool();
    const lockRequest = pool.request();
    const lockAcquired = await tryAcquireSessionAppLock(lockRequest, {
      resource: WHATSAPP_RETENTION_LOCK_RESOURCE,
      lockTimeoutMs: 0,
    });

    if (!lockAcquired) {
      return {
        lockSkipped: true,
        dryRun,
        cutoff: cutoff.toISOString(),
        retentionDays,
        durationMs: Date.now() - started,
        tables,
      };
    }

    try {
      for (const table of WHATSAPP_RETENTION_TABLE_KEYS) {
        try {
          tables[table] = await purgeTable({
            table,
            cutoff,
            batchSize,
            maxBatches: maxBatchesPerTable,
            dryRun,
          });
        } catch (error) {
          tables[table] = {
            candidates: tables[table]?.candidates ?? 0,
            deleted: tables[table]?.deleted ?? 0,
            batches: tables[table]?.batches ?? 0,
            errors: error instanceof Error ? error.message : String(error),
          };
          console.error("[whatsapp-retention] table cleanup failed", {
            table,
            cutoff: cutoff.toISOString(),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      await releaseSessionAppLock(pool.request(), WHATSAPP_RETENTION_LOCK_RESOURCE);
    }

    const result: WhatsappRetentionRunResult = {
      dryRun,
      cutoff: cutoff.toISOString(),
      retentionDays,
      durationMs: Date.now() - started,
      tables,
    };

    const hasActivity =
      dryRun ||
      Object.values(tables).some((m) => m.candidates > 0 || m.deleted > 0 || m.errors);

    if (hasActivity) {
      const summary = Object.fromEntries(
        WHATSAPP_RETENTION_TABLE_KEYS.map((key) => [
          key,
          dryRun ? tables[key].candidates : tables[key].deleted,
        ]),
      );
      console.info("[whatsapp-retention] run complete", {
        dryRun,
        cutoff: result.cutoff,
        retentionDays: result.retentionDays,
        durationMs: result.durationMs,
        summary,
      });
    }

    return result;
  },
};
