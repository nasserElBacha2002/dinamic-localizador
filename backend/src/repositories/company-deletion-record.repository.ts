import sql from "mssql";
import { getPool } from "../database/connection";

export type CompanyDeletionAttemptStartInput = {
  companyId: string;
  companyName: string;
  previousStatus: string;
  deactivatedAt: Date | null;
  deactivatedByUserId: string | null;
  deactivationReason: string | null;
  scheduledDeletionAt: Date | null;
  startedAt: Date;
  deletionAttempts: number;
  leaseOwner: string;
  purgeStage: string;
};

/**
 * Persistence for `company_deletion_records` (purge attempt audit trail).
 * Stage orchestration stays in company-deletion-purge.service.
 */
export const companyDeletionRecordRepository = {
  async startAttempt(input: CompanyDeletionAttemptStartInput): Promise<string> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("companyName", sql.NVarChar(200), input.companyName)
      .input("previousStatus", sql.NVarChar(30), input.previousStatus)
      .input("deactivatedAt", sql.DateTime2, input.deactivatedAt)
      .input("deactivatedBy", sql.UniqueIdentifier, input.deactivatedByUserId)
      .input("reason", sql.NVarChar(500), input.deactivationReason)
      .input("scheduledAt", sql.DateTime2, input.scheduledDeletionAt)
      .input("startedAt", sql.DateTime2, input.startedAt)
      .input("attempts", sql.Int, input.deletionAttempts)
      .input("leaseOwner", sql.NVarChar(100), input.leaseOwner)
      .input("stage", sql.NVarChar(40), input.purgeStage)
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

  async updateStageIfStarted(
    companyId: string,
    recordId: string,
    stage: string,
  ): Promise<number> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, recordId)
      .input("stage", sql.NVarChar(40), stage)
      .query(`
        UPDATE company_deletion_records
        SET purge_stage = @stage
        WHERE id = @id
          AND company_id = @companyId
          AND outcome = N'STARTED'
      `);
    return Number(result.rowsAffected[0] ?? 0);
  },

  async completeIfStarted(input: {
    recordId: string;
    leaseOwner: string;
    companyId: string;
    now: Date;
  }): Promise<number> {
    const result = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, input.recordId)
      .input("leaseOwner", sql.NVarChar(100), input.leaseOwner)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("now", sql.DateTime2, input.now)
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
    return Number(result.rowsAffected[0] ?? 0);
  },

  async failIfStarted(input: {
    companyId: string;
    recordId: string;
    errorMessage: string;
    leaseOwner?: string;
  }): Promise<number> {
    const request = getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.recordId)
      .input("error", sql.NVarChar(1000), input.errorMessage);

    if (input.leaseOwner) {
      const result = await request.input("leaseOwner", sql.NVarChar(100), input.leaseOwner)
        .query(`
          UPDATE company_deletion_records
          SET outcome = N'FAILED',
              last_error = @error
          WHERE id = @id
            AND company_id = @companyId
            AND outcome = N'STARTED'
            AND lease_owner = @leaseOwner
        `);
      return Number(result.rowsAffected[0] ?? 0);
    }

    const result = await request.query(`
      UPDATE company_deletion_records
      SET outcome = N'FAILED',
          last_error = @error
      WHERE id = @id
        AND company_id = @companyId
        AND outcome = N'STARTED'
    `);
    return Number(result.rowsAffected[0] ?? 0);
  },
};
