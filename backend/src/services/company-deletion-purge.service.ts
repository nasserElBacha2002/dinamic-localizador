import sql from "mssql";
import { env } from "../config/env";
import { getPool } from "../database/connection";
import { companyDeletionRecordRepository } from "../repositories/company-deletion-record.repository";
import { companyRepository } from "../repositories/company.repository";
import {
  assertNoCompanyResidues,
  deleteCompanyIdentityAndConfigSetBased,
  deleteCompanyOperationalDataSetBased,
} from "../repositories/company-purge.repository";
import { pendingStorageDeletionRepository } from "../repositories/pending-storage-deletion.repository";
import type { Company } from "../types/company";
import {
  getAttachmentStorage,
  isGcsConfigured,
  isStorageObjectNotFoundError,
} from "./attachment-storage";

export type Clock = () => Date;

export type PurgeStage =
  | "STORAGE_DISCOVERY"
  | "STORAGE_DELETE"
  | "OPERATIONAL_DATA_DELETE"
  | "IDENTITY_CONFIG_DELETE"
  | "VERIFY_EMPTY"
  | "TOMBSTONE"
  | "COMPLETED";

const STAGE_ORDER: PurgeStage[] = [
  "STORAGE_DISCOVERY",
  "STORAGE_DELETE",
  "OPERATIONAL_DATA_DELETE",
  "IDENTITY_CONFIG_DELETE",
  "VERIFY_EMPTY",
  "TOMBSTONE",
  "COMPLETED",
];

export class LeaseLostError extends Error {
  readonly code = "DELETION_LEASE_LOST" as const;
  constructor(companyId: string) {
    super(`Lost deletion lease for company ${companyId}`);
    this.name = "LeaseLostError";
  }
}

const stageIndex = (stage: string | null | undefined): number => {
  const idx = STAGE_ORDER.indexOf((stage as PurgeStage) || "STORAGE_DISCOVERY");
  return idx < 0 ? 0 : idx;
};

export const companyDeletionPurgeService = {
  async purgeCompany(
    company: Company,
    leaseOwner: string,
    clock: Clock,
  ): Promise<{ deletionRecordId: string }> {
    const companyId = company.id;
    const now = clock();
    const previousStatus =
      company.deletionAttempts > 1 ? "DELETION_FAILED" : "PENDING_DELETION";

    const deletionRecordId = await this.startAttemptRecord({
      company,
      leaseOwner,
      previousStatus,
      now,
    });

    try {
      await this.runFromStage(company, leaseOwner, clock, deletionRecordId);
      await this.completeAttemptRecord(deletionRecordId, leaseOwner, companyId, clock());
      return { deletionRecordId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.failAttemptRecord(
        companyId,
        deletionRecordId,
        message.slice(0, 1000),
        leaseOwner,
      );
      throw error;
    }
  },

  async runFromStage(
    company: Company,
    leaseOwner: string,
    clock: Clock,
    deletionRecordId: string,
  ): Promise<void> {
    const companyId = company.id;
    const start = stageIndex(company.deletionPurgeStage);

    for (let i = start; i < STAGE_ORDER.length - 1; i += 1) {
      const stage = STAGE_ORDER[i];
      await this.assertLease(companyId, leaseOwner, clock);
      const advanced = await companyRepository.setDeletionPurgeStage({
        companyId,
        leaseOwner,
        stage,
        now: clock(),
      });
      if (!advanced) {
        throw new LeaseLostError(companyId);
      }
      await this.updateAttemptStage(companyId, deletionRecordId, stage);

      switch (stage) {
        case "STORAGE_DISCOVERY":
          await this.enqueueAttachmentObjectKeys(companyId);
          break;
        case "STORAGE_DELETE":
          await this.deletePendingStorageObjects(companyId, clock);
          break;
        case "OPERATIONAL_DATA_DELETE": {
          const pool = getPool();
          const tx = new sql.Transaction(pool);
          await tx.begin();
          try {
            await deleteCompanyOperationalDataSetBased(companyId, tx);
            await tx.commit();
          } catch (error) {
            try {
              await tx.rollback();
            } catch {
              // ignore
            }
            throw error;
          }
          break;
        }
        case "IDENTITY_CONFIG_DELETE": {
          const pool = getPool();
          const tx = new sql.Transaction(pool);
          await tx.begin();
          try {
            await deleteCompanyIdentityAndConfigSetBased(companyId, tx);
            await tx.commit();
          } catch (error) {
            try {
              await tx.rollback();
            } catch {
              // ignore
            }
            throw error;
          }
          break;
        }
        case "VERIFY_EMPTY":
          await assertNoCompanyResidues(companyId);
          break;
        case "TOMBSTONE": {
          const marked = await companyRepository.markDeleted(companyId, clock(), leaseOwner);
          if (!marked) {
            throw new LeaseLostError(companyId);
          }
          break;
        }
        default:
          break;
      }
    }
  },

  async assertLease(companyId: string, leaseOwner: string, clock: Clock): Promise<void> {
    const renewed = await companyRepository.renewDeletionLease({
      companyId,
      leaseOwner,
      leaseMs: env.COMPANY_DELETION_LEASE_MS,
      now: clock(),
    });
    if (!renewed) {
      throw new LeaseLostError(companyId);
    }
  },

  async startAttemptRecord(input: {
    company: Company;
    leaseOwner: string;
    previousStatus: string;
    now: Date;
  }): Promise<string> {
    return companyDeletionRecordRepository.startAttempt({
      companyId: input.company.id,
      companyName: input.company.name,
      previousStatus: input.previousStatus,
      deactivatedAt: input.company.deactivatedAt
        ? new Date(input.company.deactivatedAt)
        : null,
      deactivatedByUserId: input.company.deactivatedByUserId,
      deactivationReason: input.company.deactivationReason,
      scheduledDeletionAt: input.company.scheduledDeletionAt
        ? new Date(input.company.scheduledDeletionAt)
        : null,
      startedAt: input.now,
      deletionAttempts: input.company.deletionAttempts,
      leaseOwner: input.leaseOwner,
      purgeStage: input.company.deletionPurgeStage ?? "STORAGE_DISCOVERY",
    });
  },

  async updateAttemptStage(
    companyId: string,
    recordId: string,
    stage: string,
  ): Promise<void> {
    await companyDeletionRecordRepository.updateStageIfStarted(companyId, recordId, stage);
  },

  async completeAttemptRecord(
    recordId: string,
    leaseOwner: string,
    companyId: string,
    now: Date,
  ): Promise<void> {
    await companyDeletionRecordRepository.completeIfStarted({
      recordId,
      leaseOwner,
      companyId,
      now,
    });
  },

  async failAttemptRecord(
    companyId: string,
    recordId: string,
    errorMessage: string,
    leaseOwner: string,
  ): Promise<void> {
    await companyDeletionRecordRepository.failIfStarted({
      companyId,
      recordId,
      errorMessage,
      leaseOwner,
    });
  },

  async enqueueAttachmentObjectKeys(companyId: string): Promise<void> {
    await pendingStorageDeletionRepository.enqueueFromAbsenceAttachments(companyId);
    await pendingStorageDeletionRepository.enqueueFromPayrollReceipts(companyId);
  },

  async deletePendingStorageObjects(companyId: string, clock: Clock): Promise<void> {
    const rows = await pendingStorageDeletionRepository.listDueForDeletion(
      companyId,
      clock(),
    );
    if (rows.length === 0) {
      await this.assertNoIncompleteStorage(companyId);
      return;
    }

    if (!isGcsConfigured()) {
      throw new Error(
        "GCS is not configured but company has pending storage object keys; refusing to mark deleted",
      );
    }

    const storage = getAttachmentStorage();
    for (const row of rows) {
      try {
        await storage.deleteObject({ objectKey: row.storageObjectKey });
        await pendingStorageDeletionRepository.markDeleted(companyId, row.id);
      } catch (error) {
        if (isStorageObjectNotFoundError(error)) {
          await pendingStorageDeletionRepository.markDeleted(companyId, row.id);
          continue;
        }
        const message = error instanceof Error ? error.message : String(error);
        await pendingStorageDeletionRepository.markFailed({
          companyId,
          id: row.id,
          errorMessage: message.slice(0, 1000),
          nextAttemptAt: new Date(clock().getTime() + env.COMPANY_DELETION_RETRY_BASE_MS),
        });
        throw error;
      }
    }

    await this.assertNoIncompleteStorage(companyId);
  },

  async assertNoIncompleteStorage(companyId: string): Promise<void> {
    const pending = await pendingStorageDeletionRepository.countIncomplete(companyId);
    if (pending > 0) {
      throw new Error("Incomplete storage deletions remain for company");
    }
  },
};
