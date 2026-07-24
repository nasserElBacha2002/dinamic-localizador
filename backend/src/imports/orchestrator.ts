import { AppError } from "../errors/app-error";
import { importJobRepository } from "../repositories/import-job.repository";
import { auditService } from "../services/audit.service";
import { logAuditSafe } from "../utils/audit-post-commit";
import { IMPORT_JOB_TTL_MINUTES } from "./constants";
import { assertPreparedCanPersist } from "./create-only-executor";
import { decodeImportBase64 } from "./parse-import-file";
import {
  createConfirmationToken,
  preparedToPreviewResult,
  resolveImportOutcomeStatus,
  type PreparedImport,
} from "./prepared-import";
import { importStrategyRegistry } from "./registry";
import type { ImportExecuteResult, ImportPreviewResult, ImportTemplate } from "./types";

const logImportEvent = (event: string, payload: Record<string, unknown>): void => {
  console.info(
    JSON.stringify({
      event,
      at: new Date().toISOString(),
      ...payload,
    }),
  );
};

export type ImportPreviewResponse = ImportPreviewResult & {
  importJobId: string;
  confirmationToken: string;
  fileHash: string;
  strategyVersion: string;
  expiresAt: string;
};

export type ImportExecuteInput = {
  fileName?: string;
  fileContentBase64?: string;
  importJobId?: string;
  confirmationToken?: string;
  idempotencyKey?: string | null;
  /**
   * When true with the same file hash, creates a new import job intentionally
   * instead of reusing a prior completed job for the same idempotency key.
   */
  forceNew?: boolean;
};

const jobExpiresAt = (): Date => {
  const expires = new Date();
  expires.setUTCMinutes(expires.getUTCMinutes() + IMPORT_JOB_TTL_MINUTES);
  return expires;
};

const createReadyJob = async (input: {
  companyId: string;
  userId: string | null;
  entityType: string;
  prepared: PreparedImport;
  idempotencyKey: string | null;
}) => {
  const confirmationToken = createConfirmationToken();
  const job = await importJobRepository.create({
    companyId: input.companyId,
    userId: input.userId,
    entityType: input.prepared.entityType,
    strategyVersion: input.prepared.strategyVersion,
    fileName: input.prepared.fileName,
    fileHash: input.prepared.fileHash,
    confirmationToken,
    idempotencyKey: input.idempotencyKey,
    status: "READY",
    totalRows: input.prepared.rows.length,
    prepared: input.prepared,
    expiresAt: jobExpiresAt(),
  });

  await logAuditSafe("import.job.ready", () =>
    auditService.log(input.companyId, {
      entityType: "import_job",
      entityId: job.id,
      action: "import.preview",
      newData: {
        entityType: input.entityType,
        importJobId: job.id,
        strategyVersion: input.prepared.strategyVersion,
        totalRows: input.prepared.rows.length,
        validRows: input.prepared.summary.validRows,
        invalidRows: input.prepared.summary.invalidRows,
      },
      reason: "generic_import",
      userId: input.userId,
    }),
  );

  logImportEvent("import.job.ready", {
    importJobId: job.id,
    entityType: input.entityType,
    companyId: input.companyId,
    totalRows: input.prepared.rows.length,
    strategyVersion: input.prepared.strategyVersion,
  });

  return job;
};

export const importOrchestrator = {
  getStrategy(entityType: string) {
    return importStrategyRegistry.get(entityType);
  },

  getTemplate(entityType: string): ImportTemplate {
    return importStrategyRegistry.get(entityType).buildTemplate();
  },

  async preview(
    companyId: string,
    entityType: string,
    input: { fileName: string; fileContentBase64: string; idempotencyKey?: string | null },
    userId?: string | null,
  ): Promise<ImportPreviewResponse> {
    const strategy = importStrategyRegistry.get(entityType);
    const buffer = decodeImportBase64(input.fileContentBase64);
    const prepared = await strategy.prepare(companyId, buffer, input.fileName);
    const job = await createReadyJob({
      companyId,
      userId: userId ?? null,
      entityType,
      prepared,
      idempotencyKey: input.idempotencyKey ?? null,
    });

    return {
      ...preparedToPreviewResult(prepared),
      importJobId: job.id,
      confirmationToken: job.confirmationToken,
      fileHash: prepared.fileHash,
      strategyVersion: prepared.strategyVersion,
      expiresAt: job.expiresAt.toISOString(),
    };
  },

  async execute(
    companyId: string,
    entityType: string,
    input: ImportExecuteInput,
    userId?: string | null,
  ): Promise<ImportExecuteResult & { importJobId: string; status: string }> {
    const strategy = importStrategyRegistry.get(entityType);
    const started = Date.now();

    if (input.idempotencyKey && !input.forceNew) {
      const existing = await importJobRepository.findByIdempotencyKey(
        companyId,
        strategy.entityType,
        input.idempotencyKey,
      );
      if (
        existing &&
        (existing.status === "COMPLETED" || existing.status === "PARTIAL" || existing.status === "FAILED")
      ) {
        const cached = importJobRepository.parseResult(existing);
        if (cached) {
          logImportEvent("import.job.idempotent_replay", {
            importJobId: existing.id,
            entityType,
            companyId,
            status: existing.status,
          });
          return { ...cached, importJobId: existing.id, status: existing.status };
        }
      }
    }

    let jobId: string | null = null;
    let prepared: PreparedImport;

    if (input.importJobId && input.confirmationToken) {
      const job = await importJobRepository.findById(companyId, input.importJobId);
      if (!job || job.confirmationToken !== input.confirmationToken) {
        throw new AppError(
          400,
          "IMPORT_CONFIRMATION_INVALID",
          "La confirmación de importación es inválida o expiró. Volvé a validar el archivo.",
        );
      }
      if (job.entityType !== strategy.entityType) {
        throw new AppError(400, "IMPORT_ENTITY_MISMATCH", "El tipo de entidad no coincide con el job.");
      }
      if (job.userId && userId && job.userId !== userId) {
        throw new AppError(403, "IMPORT_JOB_FORBIDDEN", "No podés confirmar una importación de otro usuario.");
      }
      if (job.expiresAt.getTime() <= Date.now()) {
        throw new AppError(
          400,
          "IMPORT_CONFIRMATION_EXPIRED",
          "La vista previa expiró. Volvé a cargar el archivo.",
        );
      }
      if (job.status === "COMPLETED" || job.status === "PARTIAL" || job.status === "FAILED") {
        const cached = importJobRepository.parseResult(job);
        if (cached) {
          return { ...cached, importJobId: job.id, status: job.status };
        }
      }
      if (job.status === "PROCESSING") {
        throw new AppError(
          409,
          "IMPORT_ALREADY_PROCESSING",
          "La importación ya está en proceso. Esperá a que finalice.",
        );
      }

      const claimed = await importJobRepository.tryClaimProcessing(companyId, job.id);
      if (!claimed) {
        const refreshed = await importJobRepository.findById(companyId, job.id);
        const cached = refreshed ? importJobRepository.parseResult(refreshed) : null;
        if (cached && refreshed) {
          return { ...cached, importJobId: refreshed.id, status: refreshed.status };
        }
        throw new AppError(
          409,
          "IMPORT_ALREADY_PROCESSING",
          "La importación ya está en proceso o no está lista para confirmar.",
        );
      }

      jobId = claimed.id;
      prepared = importJobRepository.parsePreparedPlan(claimed);
      if (prepared.strategyVersion !== strategy.strategyVersion) {
        await importJobRepository.markFailed(
          companyId,
          jobId,
          "La versión de estrategia cambió desde la vista previa.",
        );
        throw new AppError(
          409,
          "IMPORT_STRATEGY_VERSION_MISMATCH",
          "La versión de importación cambió. Volvé a validar el archivo.",
        );
      }
    } else if (input.fileName && input.fileContentBase64) {
      const buffer = decodeImportBase64(input.fileContentBase64);
      prepared = await strategy.prepare(companyId, buffer, input.fileName);
      assertPreparedCanPersist(prepared, strategy.requireAllRowsValid);
      const job = await createReadyJob({
        companyId,
        userId: userId ?? null,
        entityType,
        prepared,
        idempotencyKey: input.idempotencyKey ?? null,
      });
      const claimed = await importJobRepository.tryClaimProcessing(companyId, job.id);
      if (!claimed) {
        throw new AppError(409, "IMPORT_ALREADY_PROCESSING", "No se pudo iniciar la importación.");
      }
      jobId = claimed.id;
    } else {
      throw new AppError(
        400,
        "IMPORT_EXECUTE_INPUT_INVALID",
        "Debés enviar importJobId+confirmationToken o el archivo a importar.",
      );
    }

    assertPreparedCanPersist(prepared, strategy.requireAllRowsValid);

    logImportEvent("import.job.processing", {
      importJobId: jobId,
      entityType,
      companyId,
      totalRows: prepared.rows.length,
      strategyVersion: prepared.strategyVersion,
    });

    try {
      const result = await strategy.persist(companyId, prepared, {
        userId,
        importJobId: jobId,
        revalidateConcurrency: true,
      });
      const status = resolveImportOutcomeStatus(result.summary.created, result.summary.rejected);
      if (jobId) {
        await importJobRepository.markFinished(companyId, jobId, {
          status,
          createdCount: result.summary.created,
          updatedCount: result.summary.updated,
          rejectedCount: result.summary.rejected,
          result,
        });
      }

      logImportEvent("import.job.finished", {
        importJobId: jobId,
        entityType,
        companyId,
        status,
        durationMs: Date.now() - started,
        total: result.summary.totalRows,
        created: result.summary.created,
        rejected: result.summary.rejected,
        strategyVersion: prepared.strategyVersion,
      });

      return { ...result, importJobId: jobId!, status };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed";
      if (jobId) {
        await importJobRepository.markFailed(companyId, jobId, message);
      }
      logImportEvent("import.job.failed", {
        importJobId: jobId,
        entityType,
        companyId,
        durationMs: Date.now() - started,
        strategyVersion: prepared.strategyVersion,
      });
      throw error;
    }
  },
};
