import sql from "mssql";
import { env } from "../config/env";
import { getPool } from "../database/connection";
import { companyRepository } from "../repositories/company.repository";
import type { Company } from "../types/company";
import {
  assertNoCompanyResidues,
  deleteCompanyIdentityAndConfigSetBased,
  deleteCompanyOperationalDataSetBased,
} from "./company-data-cascade.service";
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
      await this.failAttemptRecord(deletionRecordId, message.slice(0, 1000));
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
      await this.updateAttemptStage(deletionRecordId, stage);

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
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, input.company.id)
      .input("companyName", sql.NVarChar(200), input.company.name)
      .input("previousStatus", sql.NVarChar(30), input.previousStatus)
      .input(
        "deactivatedAt",
        sql.DateTime2,
        input.company.deactivatedAt ? new Date(input.company.deactivatedAt) : null,
      )
      .input("deactivatedBy", sql.UniqueIdentifier, input.company.deactivatedByUserId)
      .input("reason", sql.NVarChar(500), input.company.deactivationReason)
      .input(
        "scheduledAt",
        sql.DateTime2,
        input.company.scheduledDeletionAt
          ? new Date(input.company.scheduledDeletionAt)
          : null,
      )
      .input("startedAt", sql.DateTime2, input.now)
      .input("attempts", sql.Int, input.company.deletionAttempts)
      .input("leaseOwner", sql.NVarChar(100), input.leaseOwner)
      .input("stage", sql.NVarChar(40), input.company.deletionPurgeStage ?? "STORAGE_DISCOVERY")
      .query(`
        INSERT INTO company_deletion_records (
          company_id, company_name, previous_status,
          deactivated_at, deactivated_by_user_id, deactivation_reason,
          scheduled_deletion_at, deletion_started_at, deletion_attempts,
          outcome, lease_owner, purge_stage
        )
        OUTPUT INSERTED.id
        VALUES (
          @companyId, @companyName, @previousStatus,
          @deactivatedAt, @deactivatedBy, @reason,
          @scheduledAt, @startedAt, @attempts,
          N'STARTED', @leaseOwner, @stage
        )
      `);
    return String(result.recordset[0].id);
  },

  async updateAttemptStage(recordId: string, stage: string): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, recordId)
      .input("stage", sql.NVarChar(40), stage)
      .query(`
        UPDATE company_deletion_records
        SET purge_stage = @stage
        WHERE id = @id AND outcome = N'STARTED'
      `);
  },

  async completeAttemptRecord(
    recordId: string,
    leaseOwner: string,
    companyId: string,
    now: Date,
  ): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, recordId)
      .input("leaseOwner", sql.NVarChar(100), leaseOwner)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("now", sql.DateTime2, now)
      .query(`
        UPDATE company_deletion_records
        SET outcome = N'COMPLETED',
            deleted_at = @now,
            purge_stage = N'COMPLETED'
        WHERE id = @id
          AND outcome = N'STARTED'
          AND lease_owner = @leaseOwner
          AND company_id = @companyId
      `);
  },

  async failAttemptRecord(recordId: string, errorMessage: string): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, recordId)
      .input("error", sql.NVarChar(1000), errorMessage)
      .query(`
        UPDATE company_deletion_records
        SET outcome = N'FAILED',
            last_error = @error
        WHERE id = @id AND outcome = N'STARTED'
      `);
  },

  async enqueueAttachmentObjectKeys(companyId: string): Promise<void> {
    const pool = getPool();
    const hasTable = await pool.request().query(`
      SELECT CASE WHEN OBJECT_ID(N'dbo.absence_request_attachments', N'U') IS NULL THEN 0 ELSE 1 END AS present
    `);
    if (Number(hasTable.recordset[0]?.present)) {
      await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
        INSERT INTO company_pending_storage_deletions (company_id, storage_object_key)
        SELECT DISTINCT a.company_id, a.object_key
        FROM absence_request_attachments a
        WHERE a.company_id = @companyId
          AND a.object_key IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM company_pending_storage_deletions p
            WHERE p.company_id = a.company_id AND p.storage_object_key = a.object_key
          )
      `);
    }

    const hasPayroll = await pool.request().query(`
      SELECT CASE WHEN OBJECT_ID(N'dbo.payroll_receipts', N'U') IS NULL THEN 0 ELSE 1 END AS present
    `);
    if (!Number(hasPayroll.recordset[0]?.present)) {
      return;
    }

    await pool.request().input("companyId", sql.UniqueIdentifier, companyId).query(`
      INSERT INTO company_pending_storage_deletions (company_id, storage_object_key)
      SELECT DISTINCT r.company_id, r.storage_object_key
      FROM payroll_receipts r
      WHERE r.company_id = @companyId
        AND r.storage_object_key IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM company_pending_storage_deletions p
          WHERE p.company_id = r.company_id AND p.storage_object_key = r.storage_object_key
        )
    `);
  },

  async deletePendingStorageObjects(companyId: string, clock: Clock): Promise<void> {
    const pool = getPool();
    const pending = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("now", sql.DateTime2, clock())
      .query(`
        SELECT id, storage_object_key
        FROM company_pending_storage_deletions
        WHERE company_id = @companyId
          AND status IN (N'PENDING', N'FAILED')
          AND (next_attempt_at IS NULL OR next_attempt_at <= @now)
      `);

    const rows = pending.recordset as Array<{ id: string; storage_object_key: string }>;
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
      const id = String(row.id);
      const objectKey = String(row.storage_object_key);
      try {
        await storage.deleteObject({ objectKey });
        await this.markStorageDeleted(id);
      } catch (error) {
        if (isStorageObjectNotFoundError(error)) {
          await this.markStorageDeleted(id);
          continue;
        }
        const message = error instanceof Error ? error.message : String(error);
        const attemptsResult = await pool
          .request()
          .input("id", sql.UniqueIdentifier, id)
          .input("error", sql.NVarChar(1000), message.slice(0, 1000))
          .input("nextAttemptAt", sql.DateTime2, new Date(clock().getTime() + env.COMPANY_DELETION_RETRY_BASE_MS))
          .query(`
            UPDATE company_pending_storage_deletions
            SET status = N'FAILED',
                updated_at = SYSUTCDATETIME(),
                attempts = attempts + 1,
                last_error = @error,
                next_attempt_at = @nextAttemptAt
            WHERE id = @id
          `);
        void attemptsResult;
        throw error;
      }
    }

    await this.assertNoIncompleteStorage(companyId);
  },

  async markStorageDeleted(id: string): Promise<void> {
    const pool = getPool();
    await pool.request().input("id", sql.UniqueIdentifier, id).query(`
      UPDATE company_pending_storage_deletions
      SET status = N'DELETED',
          deleted_at = SYSUTCDATETIME(),
          updated_at = SYSUTCDATETIME(),
          attempts = attempts + 1,
          last_error = NULL,
          next_attempt_at = NULL
      WHERE id = @id
    `);
  },

  async assertNoIncompleteStorage(companyId: string): Promise<void> {
    const pool = getPool();
    const remaining = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT COUNT(1) AS pending
        FROM company_pending_storage_deletions
        WHERE company_id = @companyId AND status <> N'DELETED'
      `);
    if (Number(remaining.recordset[0]?.pending ?? 0) > 0) {
      throw new Error("Incomplete storage deletions remain for company");
    }
  },
};
