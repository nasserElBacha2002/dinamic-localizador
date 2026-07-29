import sql from "mssql";
import { getPool } from "../database/connection";

export type AbsenceWorkdaySyncOperation =
  | "APPROVE"
  | "AUTO_APPROVE"
  | "REJECT"
  | "CANCEL"
  | "RESUBMIT_AUTO_APPROVE";

export type AbsenceWorkdaySyncJobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export type AbsenceWorkdaySyncJob = {
  id: string;
  companyId: string;
  absenceRequestId: string;
  absenceStatus: string;
  operation: AbsenceWorkdaySyncOperation;
  status: AbsenceWorkdaySyncJobStatus;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

const mapRow = (row: Record<string, unknown>): AbsenceWorkdaySyncJob => ({
  id: String(row.id),
  companyId: String(row.company_id),
  absenceRequestId: String(row.absence_request_id),
  absenceStatus: String(row.absence_status),
  operation: String(row.operation) as AbsenceWorkdaySyncOperation,
  status: String(row.status) as AbsenceWorkdaySyncJobStatus,
  attemptCount: Number(row.attempt_count ?? 0),
  lastError: row.last_error ? String(row.last_error) : null,
  createdAt: new Date(row.created_at as Date | string).toISOString(),
  updatedAt: new Date(row.updated_at as Date | string).toISOString(),
});

const requestFrom = (transaction?: sql.Transaction) =>
  transaction ? new sql.Request(transaction) : getPool().request();

export const absenceWorkdaySyncJobRepository = {
  async enqueue(
    input: {
      companyId: string;
      absenceRequestId: string;
      absenceStatus: string;
      operation: AbsenceWorkdaySyncOperation;
    },
    transaction?: sql.Transaction,
  ): Promise<AbsenceWorkdaySyncJob> {
    const request = requestFrom(transaction)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, input.absenceRequestId)
      .input("absenceStatus", sql.NVarChar(30), input.absenceStatus)
      .input("operation", sql.NVarChar(40), input.operation);

    // Idempotent enqueue: reuse active job if present, otherwise insert.
    const existing = await request.query(`
      SELECT TOP 1 *
      FROM absence_workday_sync_jobs WITH (UPDLOCK, HOLDLOCK)
      WHERE company_id = @companyId
        AND absence_request_id = @absenceRequestId
        AND operation = @operation
        AND status IN ('PENDING', 'PROCESSING')
    `);

    if (existing.recordset[0]) {
      return mapRow(existing.recordset[0] as Record<string, unknown>);
    }

    const inserted = await requestFrom(transaction)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, input.absenceRequestId)
      .input("absenceStatus", sql.NVarChar(30), input.absenceStatus)
      .input("operation", sql.NVarChar(40), input.operation)
      .query(`
        INSERT INTO absence_workday_sync_jobs (
          company_id, absence_request_id, absence_status, operation, status
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @absenceRequestId, @absenceStatus, @operation, 'PENDING'
        )
      `);

    return mapRow(inserted.recordset[0] as Record<string, unknown>);
  },

  async markCompleted(
    companyId: string,
    jobId: string,
    transaction?: sql.Transaction,
  ): Promise<void> {
    await requestFrom(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("jobId", sql.UniqueIdentifier, jobId)
      .query(`
        UPDATE absence_workday_sync_jobs
        SET status = 'COMPLETED',
            last_error = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @jobId AND company_id = @companyId
      `);
  },

  async markFailedAttempt(
    companyId: string,
    jobId: string,
    errorMessage: string,
    maxAttempts: number,
  ): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("jobId", sql.UniqueIdentifier, jobId)
      .input("errorMessage", sql.NVarChar(1000), errorMessage.slice(0, 1000))
      .input("maxAttempts", sql.Int, maxAttempts)
      .query(`
        UPDATE absence_workday_sync_jobs
        SET attempt_count = attempt_count + 1,
            last_error = @errorMessage,
            status = CASE
              WHEN attempt_count + 1 >= @maxAttempts THEN 'FAILED'
              ELSE 'PENDING'
            END,
            updated_at = SYSUTCDATETIME()
        WHERE id = @jobId AND company_id = @companyId
      `);
  },

  async claimNextPending(maxAttempts: number): Promise<AbsenceWorkdaySyncJob | null> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const result = await new sql.Request(transaction)
        .input("maxAttempts", sql.Int, maxAttempts)
        .query(`
          SELECT TOP 1 *
          FROM absence_workday_sync_jobs WITH (UPDLOCK, READPAST)
          WHERE status = 'PENDING'
            AND attempt_count < @maxAttempts
          ORDER BY updated_at ASC, created_at ASC
        `);

      const row = result.recordset[0] as Record<string, unknown> | undefined;
      if (!row) {
        await transaction.commit();
        return null;
      }

      await new sql.Request(transaction)
        .input("jobId", sql.UniqueIdentifier, String(row.id))
        .input("companyId", sql.UniqueIdentifier, String(row.company_id))
        .query(`
          UPDATE absence_workday_sync_jobs
          SET status = 'PROCESSING',
              updated_at = SYSUTCDATETIME()
          WHERE id = @jobId AND company_id = @companyId AND status = 'PENDING'
        `);

      await transaction.commit();
      return mapRow(row);
    } catch (error) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("[absence-workday-sync-job] claim rollback failed", {
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        });
      }
      throw error;
    }
  },

  async findActiveByRequest(
    companyId: string,
    absenceRequestId: string,
  ): Promise<AbsenceWorkdaySyncJob | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, absenceRequestId)
      .query(`
        SELECT TOP 1 *
        FROM absence_workday_sync_jobs
        WHERE company_id = @companyId
          AND absence_request_id = @absenceRequestId
          AND status IN ('PENDING', 'PROCESSING', 'FAILED')
        ORDER BY created_at DESC
      `);

    if (!result.recordset[0]) {
      return null;
    }
    return mapRow(result.recordset[0] as Record<string, unknown>);
  },
};
