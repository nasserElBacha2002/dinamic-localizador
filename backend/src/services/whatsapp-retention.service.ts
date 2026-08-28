import { env } from "../config/env";
import {
  WHATSAPP_RETENTION_LOCK_RESOURCE,
  WHATSAPP_RETENTION_TABLE_KEYS,
  type WhatsappRetentionTableKey,
} from "../constants/whatsapp-retention";
import {
  defaultWhatsappRetentionPolicyParams,
  whatsappRetentionRepository,
} from "../repositories/whatsapp-retention.repository";
import { computeRetentionCutoff } from "../utils/retention-cutoff";
import { withDedicatedSessionAppLock } from "../utils/whatsapp-retention-lock";

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
  const policyParams = defaultWhatsappRetentionPolicyParams(input.cutoff, input.batchSize);
  const candidates = await whatsappRetentionRepository.countEligible(input.table, policyParams);
  if (input.dryRun || candidates === 0) {
    return { candidates, deleted: 0, batches: 0 };
  }

  let deleted = 0;
  let batches = 0;
  while (batches < input.maxBatches) {
    const removed = await whatsappRetentionRepository.deleteBatch(input.table, policyParams);
    if (removed === 0) {
      break;
    }
    deleted += removed;
    batches += 1;
  }

  return { candidates, deleted, batches };
};

const runCleanupBody = async (input: {
  dryRun: boolean;
  cutoff: Date;
  retentionDays: number;
  batchSize: number;
  maxBatchesPerTable: number;
  simulateTableError?: WhatsappRetentionTableKey;
}): Promise<WhatsappRetentionRunResult["tables"]> => {
  const tables = emptyTableMetrics();

  for (const table of WHATSAPP_RETENTION_TABLE_KEYS) {
    if (input.simulateTableError === table) {
      tables[table] = {
        candidates: tables[table]?.candidates ?? 0,
        deleted: tables[table]?.deleted ?? 0,
        batches: tables[table]?.batches ?? 0,
        errors: "SIMULATED_TABLE_FAILURE",
      };
      console.error("[whatsapp-retention] table cleanup failed", {
        table,
        cutoff: input.cutoff.toISOString(),
        error: "SIMULATED_TABLE_FAILURE",
      });
      continue;
    }

    try {
      tables[table] = await purgeTable({
        table,
        cutoff: input.cutoff,
        batchSize: input.batchSize,
        maxBatches: input.maxBatchesPerTable,
        dryRun: input.dryRun,
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
        cutoff: input.cutoff.toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return tables;
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
    /** Integration-test hook to simulate a single table failure without aborting the run. */
    simulateTableError?: WhatsappRetentionTableKey;
  }): Promise<WhatsappRetentionRunResult> {
    const started = Date.now();
    const dryRun = input?.dryRun ?? env.WHATSAPP_RETENTION_DRY_RUN;
    const nowUtc = input?.nowUtc ?? new Date();
    const retentionDays = input?.retentionDays ?? env.WHATSAPP_RETENTION_DAYS;
    const batchSize = input?.batchSize ?? env.WHATSAPP_RETENTION_BATCH_SIZE;
    const maxBatchesPerTable =
      input?.maxBatchesPerTable ?? env.WHATSAPP_RETENTION_MAX_BATCHES_PER_TABLE;
    const cutoff = computeRetentionCutoff(nowUtc, retentionDays);

    if (!env.WHATSAPP_RETENTION_CLEANUP_JOB_ENABLED) {
      return {
        skipped: true,
        dryRun,
        cutoff: cutoff.toISOString(),
        retentionDays,
        durationMs: Date.now() - started,
        tables: emptyTableMetrics(),
      };
    }

    const lockResult = await withDedicatedSessionAppLock(
      WHATSAPP_RETENTION_LOCK_RESOURCE,
      async () =>
        runCleanupBody({
          dryRun,
          cutoff,
          retentionDays,
          batchSize,
          maxBatchesPerTable,
          simulateTableError: input?.simulateTableError,
        }),
    );

    if (lockResult.outcome === "skipped") {
      return {
        lockSkipped: true,
        dryRun,
        cutoff: cutoff.toISOString(),
        retentionDays,
        durationMs: Date.now() - started,
        tables: emptyTableMetrics(),
      };
    }

    const tables = lockResult.value;
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
