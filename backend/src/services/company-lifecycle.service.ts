import sql from "mssql";
import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { companyLifecycleRepository } from "../repositories/company-lifecycle.repository";
import { companyRepository } from "../repositories/company.repository";
import { auditService } from "./audit.service";
import { logAuditSafe } from "../utils/audit-post-commit";
import type { Company } from "../types/company";
import {
  LeaseLostError,
  companyDeletionPurgeService,
} from "./company-deletion-purge.service";

export type Clock = () => Date;

const defaultClock: Clock = () => new Date();

const protectedIds = (): Set<string> =>
  new Set(
    env.COMPANY_PROTECTED_IDS.split(",")
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean),
  );

const protectedNames = (): Set<string> =>
  new Set(
    env.COMPANY_PROTECTED_NAMES.split(",")
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  );

const isProtectedCompany = (company: Company): boolean => {
  if (protectedIds().has(company.id.toLowerCase())) {
    return true;
  }
  // Legacy name fallback only when no IDs configured.
  if (protectedIds().size === 0 && protectedNames().has(company.name.trim().toLowerCase())) {
    return true;
  }
  return false;
};

/** Exported for unit tests — scheduled deletion = now + configured grace. */
export const computeScheduledDeletionAt = (now: Date, graceDays = env.COMPANY_DELETION_GRACE_PERIOD_DAYS): Date =>
  new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000);


const computeBackoffMs = (attempts: number): number => {
  const capped = Math.min(Math.max(attempts, 1), 8);
  return env.COMPANY_DELETION_RETRY_BASE_MS * 2 ** (capped - 1);
};

const toLifecycleDto = (company: Company, gracePeriodDays: number, nowMs: number) => {
  const scheduled = company.scheduledDeletionAt
    ? new Date(company.scheduledDeletionAt).getTime()
    : null;
  const daysRemaining =
    scheduled == null ? null : Math.max(0, Math.ceil((scheduled - nowMs) / (24 * 60 * 60 * 1000)));

  return {
    companyId: company.id,
    name: company.name,
    status: company.status,
    deactivatedAt: company.deactivatedAt,
    deactivatedByUserId: company.deactivatedByUserId,
    deactivationReason: company.deactivationReason,
    scheduledDeletionAt: company.scheduledDeletionAt,
    reactivatedAt: company.reactivatedAt,
    reactivatedByUserId: company.reactivatedByUserId,
    deletionStartedAt: company.deletionStartedAt,
    deletedAt: company.deletedAt,
    deletionAttempts: company.deletionAttempts,
    deletionLastError: company.deletionLastError,
    deletionPurgeStage: company.deletionPurgeStage,
    gracePeriodDays,
    daysRemaining,
  };
};

const insertLifecycleEvent = async (
  transaction: sql.Transaction,
  input: {
    companyId: string;
    eventType: string;
    previousStatus: string | null;
    newStatus: string | null;
    actorUserId: string | null;
    reason: string | null;
    correlationId: string;
    detailsJson?: string | null;
  },
): Promise<void> => {
  await companyLifecycleRepository.insertEvent(transaction, input);
};

const revokeCompanyAccessInTransaction = async (
  transaction: sql.Transaction,
  companyId: string,
): Promise<void> => {
  await companyLifecycleRepository.revokeAccessInTransaction(transaction, companyId);
};

export const companyLifecycleService = {
  async deactivate(
    companyId: string,
    actorUserId: string,
    reason: string,
    clock: Clock = defaultClock,
  ) {
    const now = clock();
    const correlationId = randomUUID();
    const company = await companyRepository.findById(companyId);
    if (!company || company.status === "DELETED") {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada");
    }

    if (company.status === "DELETING") {
      throw new AppError(
        409,
        "COMPANY_DELETION_IN_PROGRESS",
        "La empresa está en proceso de eliminación y no puede desactivarse de nuevo.",
      );
    }

    if (isProtectedCompany(company)) {
      throw new AppError(
        409,
        "COMPANY_PROTECTED",
        "Esta empresa está protegida y no puede desactivarse.",
      );
    }

    if (company.status === "PENDING_DELETION" || company.status === "DELETION_FAILED") {
      return toLifecycleDto(company, env.COMPANY_DELETION_GRACE_PERIOD_DAYS, now.getTime());
    }

    const scheduledDeletionAt = computeScheduledDeletionAt(now);
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    let updated: Company | null;
    try {
      // Serialize last-active invariant across concurrent deactivations.
      const lockResult = await companyLifecycleRepository.acquireDeactivateAppLock(transaction);
      if (lockResult < 0) {
        throw new AppError(
          409,
          "COMPANY_STATUS_CONFLICT",
          "No se pudo adquirir el bloqueo para desactivar. Reintentá.",
        );
      }

      if (company.status === "ACTIVE") {
        const activeCount = await companyRepository.countActiveCompanies(transaction);
        if (activeCount <= 1) {
          throw new AppError(
            409,
            "LAST_ACTIVE_COMPANY",
            "No se puede desactivar la última empresa activa de la plataforma.",
          );
        }
      }

      updated = await companyRepository.scheduleDeletion(
        {
          companyId,
          actorUserId,
          reason: reason.trim(),
          scheduledDeletionAt,
          now,
        },
        transaction,
      );
      if (!updated) {
        throw new AppError(
          409,
          "COMPANY_STATUS_CONFLICT",
          "El estado de la empresa cambió. Reintentá la operación.",
        );
      }

      await revokeCompanyAccessInTransaction(transaction, companyId);
      await insertLifecycleEvent(transaction, {
        companyId,
        eventType: "COMPANY_DEACTIVATED",
        previousStatus: company.status,
        newStatus: updated.status,
        actorUserId,
        reason: reason.trim(),
        correlationId,
        detailsJson: JSON.stringify({
          scheduledDeletionAt: updated.scheduledDeletionAt,
        }),
      });

      await transaction.commit();
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // ignore
      }
      throw error;
    }

    logAuditSafe("company.deactivate", () =>
      auditService.log(companyId, {
        entityType: "company",
        entityId: companyId,
        action: "COMPANY_DEACTIVATED",
        previousData: { status: company.status },
        newData: {
          status: updated!.status,
          scheduledDeletionAt: updated!.scheduledDeletionAt,
          correlationId,
        },
        reason: reason.trim(),
        userId: actorUserId,
      }),
    );

    return toLifecycleDto(updated, env.COMPANY_DELETION_GRACE_PERIOD_DAYS, now.getTime());
  },

  async reactivate(companyId: string, actorUserId: string, clock: Clock = defaultClock) {
    const now = clock();
    const correlationId = randomUUID();
    const company = await companyRepository.findById(companyId);
    if (!company || company.status === "DELETED") {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada");
    }

    if (company.status === "DELETING") {
      throw new AppError(
        409,
        "COMPANY_DELETION_IN_PROGRESS",
        "La eliminación ya comenzó y no se puede reactivar la empresa.",
      );
    }

    if (company.status === "ACTIVE") {
      return toLifecycleDto(company, env.COMPANY_DELETION_GRACE_PERIOD_DAYS, now.getTime());
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    let updated: Company | null;
    try {
      updated = await companyRepository.reactivate(
        { companyId, actorUserId, now },
        transaction,
      );
      if (!updated) {
        await transaction.rollback();
        const current = await companyRepository.findById(companyId);
        if (current?.status === "ACTIVE") {
          return toLifecycleDto(current, env.COMPANY_DELETION_GRACE_PERIOD_DAYS, now.getTime());
        }
        if (current?.status === "DELETING") {
          throw new AppError(
            409,
            "COMPANY_DELETION_IN_PROGRESS",
            "La eliminación ya comenzó y no se puede reactivar la empresa.",
          );
        }
        throw new AppError(
          409,
          "COMPANY_STATUS_CONFLICT",
          "El estado de la empresa cambió. Reintentá la operación.",
        );
      }

      await insertLifecycleEvent(transaction, {
        companyId,
        eventType: "COMPANY_REACTIVATED",
        previousStatus: company.status,
        newStatus: updated.status,
        actorUserId,
        reason: null,
        correlationId,
      });

      await transaction.commit();
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // ignore
      }
      throw error;
    }

    logAuditSafe("company.reactivate", () =>
      auditService.log(companyId, {
        entityType: "company",
        entityId: companyId,
        action: "COMPANY_REACTIVATED",
        previousData: { status: company.status },
        newData: { status: updated!.status, correlationId },
        userId: actorUserId,
      }),
    );

    return toLifecycleDto(updated, env.COMPANY_DELETION_GRACE_PERIOD_DAYS, now.getTime());
  },

  async getDeletionStatus(companyId: string, clock: Clock = defaultClock) {
    const company = await companyRepository.findById(companyId);
    if (!company || company.status === "DELETED") {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada");
    }
    return toLifecycleDto(
      company,
      env.COMPANY_DELETION_GRACE_PERIOD_DAYS,
      clock().getTime(),
    );
  },

  async processDueDeletions(clock: Clock = defaultClock): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    const leaseOwner = `company-deletion:${randomUUID()}`;

    for (let i = 0; i < 5; i += 1) {
      const claimed = await companyRepository.claimNextDueForDeletion({
        leaseOwner,
        leaseMs: env.COMPANY_DELETION_LEASE_MS,
        now: clock(),
      });
      if (!claimed) {
        break;
      }
      processed += 1;

      if (claimed.deletionAttempts > env.COMPANY_DELETION_MAX_ATTEMPTS) {
        await companyRepository.markDeletionFailed(
          claimed.id,
          `Exceeded max deletion attempts (${env.COMPANY_DELETION_MAX_ATTEMPTS})`,
          clock(),
          {
            leaseOwner,
            // Far-future backoff — requires manual intervention / config bump.
            nextAttemptAt: new Date(clock().getTime() + 365 * 24 * 60 * 60 * 1000),
          },
        );
        failed += 1;
        continue;
      }

      const auditAction =
        claimed.deletionAttempts > 1
          ? "COMPANY_DELETION_RETRY_STARTED"
          : "COMPANY_DELETION_STARTED";

      logAuditSafe("company.deletion_started", () =>
        auditService.log(claimed.id, {
          entityType: "company",
          entityId: claimed.id,
          action: auditAction,
          previousData: {
            status: claimed.deletionAttempts > 1 ? "DELETION_FAILED" : "PENDING_DELETION",
          },
          newData: {
            status: "DELETING",
            attempt: claimed.deletionAttempts,
            leaseOwner,
            stage: claimed.deletionPurgeStage,
          },
        }),
      );

      try {
        await companyDeletionPurgeService.purgeCompany(claimed, leaseOwner, clock);
        succeeded += 1;
        logAuditSafe("company.deletion_completed", () =>
          auditService.log(claimed.id, {
            entityType: "company",
            entityId: claimed.id,
            action: "COMPANY_DELETION_COMPLETED",
            previousData: { status: "DELETING" },
            newData: { status: "DELETED" },
          }),
        );
      } catch (error) {
        if (error instanceof LeaseLostError) {
          // Another worker owns the company; do not mark failed.
          console.warn("[company-lifecycle] lease lost during purge", {
            companyId: claimed.id,
            leaseOwner,
          });
          continue;
        }
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        const sanitized = message.slice(0, 500);
        const nextAttemptAt = new Date(
          clock().getTime() + computeBackoffMs(claimed.deletionAttempts),
        );
        const marked = await companyRepository.markDeletionFailed(
          claimed.id,
          sanitized,
          clock(),
          { leaseOwner, nextAttemptAt },
        );
        if (!marked) {
          console.warn("[company-lifecycle] could not mark DELETION_FAILED (lease lost)", {
            companyId: claimed.id,
          });
          continue;
        }
        logAuditSafe("company.deletion_failed", () =>
          auditService.log(claimed.id, {
            entityType: "company",
            entityId: claimed.id,
            action: "COMPANY_DELETION_FAILED",
            previousData: { status: "DELETING" },
            newData: { status: "DELETION_FAILED", nextAttemptAt: nextAttemptAt.toISOString() },
            reason: sanitized,
          }),
        );
      }
    }

    return { processed, succeeded, failed };
  },
};
