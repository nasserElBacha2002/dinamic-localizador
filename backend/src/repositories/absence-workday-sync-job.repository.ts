import sql from "mssql";
import { getPool } from "../database/connection";

export type AbsenceWorkdaySyncOperation =
  | "APPROVE"
  | "AUTO_APPROVE"
  | "REJECT"
  | "CANCEL"
  | "RESUBMIT_AUTO_APPROVE"
  | "MANUAL_RECONCILE";

export type AbsenceWorkdaySyncJobStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "SUPERSEDED";

export type AbsenceWorkdaySyncJob = {
  id: string;
  companyId: string;
  absenceRequestId: string;
  absenceStatus: string;
  operation: AbsenceWorkdaySyncOperation;
  status: AbsenceWorkdaySyncJobStatus;
  attemptCount: number;
  lastError: string | null;
  expectedOperationalImpactVersion: number;
  supersededAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
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
  expectedOperationalImpactVersion: Number(row.expected_operational_impact_version ?? 1),
  supersededAt: row.superseded_at
    ? new Date(row.superseded_at as Date | string).toISOString()
    : null,
  leaseOwner: row.lease_owner ? String(row.lease_owner) : null,
  leaseExpiresAt: row.lease_expires_at
    ? new Date(row.lease_expires_at as Date | string).toISOString()
    : null,
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
      expectedOperationalImpactVersion: number;
    },
    transaction?: sql.Transaction,
  ): Promise<AbsenceWorkdaySyncJob> {
    // Supersede older active jobs for this request when version/status changes.
    await requestFrom(transaction)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, input.absenceRequestId)
      .input("expectedVersion", sql.Int, input.expectedOperationalImpactVersion)
      .input("absenceStatus", sql.NVarChar(30), input.absenceStatus)
      .query(`
        UPDATE absence_workday_sync_jobs
        SET status = N'SUPERSEDED',
            superseded_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND absence_request_id = @absenceRequestId
          AND status IN (N'PENDING', N'PROCESSING', N'FAILED')
          AND (
            expected_operational_impact_version <> @expectedVersion
            OR absence_status <> @absenceStatus
          )
      `);

    const existing = await requestFrom(transaction)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, input.absenceRequestId)
      .input("absenceStatus", sql.NVarChar(30), input.absenceStatus)
      .input("operation", sql.NVarChar(40), input.operation)
      .input("expectedVersion", sql.Int, input.expectedOperationalImpactVersion)
      .query(`
        SELECT TOP 1 *
        FROM absence_workday_sync_jobs WITH (UPDLOCK, HOLDLOCK)
        WHERE company_id = @companyId
          AND absence_request_id = @absenceRequestId
          AND operation = @operation
          AND absence_status = @absenceStatus
          AND expected_operational_impact_version = @expectedVersion
          AND status IN (N'PENDING', N'PROCESSING')
      `);

    if (existing.recordset[0]) {
      return mapRow(existing.recordset[0] as Record<string, unknown>);
    }

    const inserted = await requestFrom(transaction)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, input.absenceRequestId)
      .input("absenceStatus", sql.NVarChar(30), input.absenceStatus)
      .input("operation", sql.NVarChar(40), input.operation)
      .input("expectedVersion", sql.Int, input.expectedOperationalImpactVersion)
      .query(`
        INSERT INTO absence_workday_sync_jobs (
          company_id, absence_request_id, absence_status, operation, status,
          expected_operational_impact_version
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @absenceRequestId, @absenceStatus, @operation, N'PENDING',
          @expectedVersion
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
        SET status = N'COMPLETED',
            last_error = NULL,
            lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @jobId AND company_id = @companyId
      `);
  },

  async markSuperseded(
    companyId: string,
    jobId: string,
    reason: string,
  ): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("jobId", sql.UniqueIdentifier, jobId)
      .input("reason", sql.NVarChar(1000), reason.slice(0, 1000))
      .query(`
        UPDATE absence_workday_sync_jobs
        SET status = N'SUPERSEDED',
            superseded_at = SYSUTCDATETIME(),
            last_error = @reason,
            updated_at = SYSUTCDATETIME()
        WHERE id = @jobId AND company_id = @companyId
          AND status IN (N'PENDING', N'PROCESSING', N'FAILED')
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
              WHEN attempt_count + 1 >= @maxAttempts THEN N'FAILED'
              ELSE N'PENDING'
            END,
            updated_at = SYSUTCDATETIME()
        WHERE id = @jobId AND company_id = @companyId
      `);
  },

  async claimNextPending(
    maxAttempts: number,
    options?: { leaseOwner?: string; leaseSeconds?: number },
  ): Promise<AbsenceWorkdaySyncJob | null> {
    const leaseOwner = options?.leaseOwner ?? `worker-${process.pid}`;
    const leaseSeconds = options?.leaseSeconds ?? 120;
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      // Recover expired PROCESSING leases so a dead worker does not block forever.
      await new sql.Request(transaction).query(`
        UPDATE absence_workday_sync_jobs
        SET status = N'PENDING',
            lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE status = N'PROCESSING'
          AND lease_expires_at IS NOT NULL
          AND lease_expires_at < SYSUTCDATETIME()
      `);

      const result = await new sql.Request(transaction)
        .input("maxAttempts", sql.Int, maxAttempts)
        .query(`
          SELECT TOP 1 *
          FROM absence_workday_sync_jobs WITH (UPDLOCK, READPAST)
          WHERE status = N'PENDING'
            AND attempt_count < @maxAttempts
            AND (lease_expires_at IS NULL OR lease_expires_at < SYSUTCDATETIME())
          ORDER BY updated_at ASC, created_at ASC
        `);

      const row = result.recordset[0] as Record<string, unknown> | undefined;
      if (!row) {
        await transaction.commit();
        return null;
      }

      const claimed = await new sql.Request(transaction)
        .input("jobId", sql.UniqueIdentifier, String(row.id))
        .input("companyId", sql.UniqueIdentifier, String(row.company_id))
        .input("leaseOwner", sql.NVarChar(80), leaseOwner)
        .input("leaseSeconds", sql.Int, leaseSeconds)
        .query(`
          UPDATE absence_workday_sync_jobs
          SET status = N'PROCESSING',
              lease_owner = @leaseOwner,
              lease_expires_at = DATEADD(SECOND, @leaseSeconds, SYSUTCDATETIME()),
              updated_at = SYSUTCDATETIME()
          OUTPUT INSERTED.*
          WHERE id = @jobId
            AND company_id = @companyId
            AND status = N'PENDING'
        `);

      await transaction.commit();
      if (!claimed.recordset[0]) {
        return null;
      }
      return mapRow(claimed.recordset[0] as Record<string, unknown>);
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

  async clearLease(companyId: string, jobId: string): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("jobId", sql.UniqueIdentifier, jobId)
      .query(`
        UPDATE absence_workday_sync_jobs
        SET lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @jobId AND company_id = @companyId
      `);
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
          AND status IN (N'PENDING', N'PROCESSING', N'FAILED')
        ORDER BY created_at DESC
      `);

    if (!result.recordset[0]) {
      return null;
    }
    return mapRow(result.recordset[0] as Record<string, unknown>);
  },

  async findLatestByRequest(
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
        ORDER BY created_at DESC
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapRow(result.recordset[0] as Record<string, unknown>);
  },

  async findById(
    companyId: string,
    jobId: string,
  ): Promise<AbsenceWorkdaySyncJob | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("jobId", sql.UniqueIdentifier, jobId)
      .query(`
        SELECT TOP 1 *
        FROM absence_workday_sync_jobs
        WHERE company_id = @companyId AND id = @jobId
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapRow(result.recordset[0] as Record<string, unknown>);
  },
};
