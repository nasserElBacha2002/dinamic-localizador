import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";

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
  leaseVersion: number;
  enqueueCommandId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobLeaseToken = {
  companyId: string;
  jobId: string;
  leaseOwner: string;
  leaseVersion: number;
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
  leaseVersion: Number(row.lease_version ?? 0),
  enqueueCommandId: row.enqueue_command_id ? String(row.enqueue_command_id) : null,
  createdAt: new Date(row.created_at as Date | string).toISOString(),
  updatedAt: new Date(row.updated_at as Date | string).toISOString(),
});

const requestFrom = (transaction?: sql.Transaction) =>
  transaction ? new sql.Request(transaction) : getPool().request();

const throwIfLeaseLost = (rowsAffected: number): void => {
  if (rowsAffected === 0) {
    throw new AppError(409, "JOB_LEASE_LOST", "El worker perdió el lease del job");
  }
};

const applyLeasePredicate = (request: sql.Request, token: JobLeaseToken): sql.Request =>
  request
    .input("companyId", sql.UniqueIdentifier, token.companyId)
    .input("jobId", sql.UniqueIdentifier, token.jobId)
    .input("leaseOwner", sql.NVarChar(80), token.leaseOwner)
    .input("leaseVersion", sql.BigInt, token.leaseVersion);

export const absenceWorkdaySyncJobRepository = {
  async enqueue(
    input: {
      companyId: string;
      absenceRequestId: string;
      absenceStatus: string;
      operation: AbsenceWorkdaySyncOperation;
      expectedOperationalImpactVersion: number;
      enqueueCommandId?: string | null;
    },
    transaction?: sql.Transaction,
  ): Promise<AbsenceWorkdaySyncJob> {
    if (input.enqueueCommandId) {
      const byCommand = await requestFrom(transaction)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("enqueueCommandId", sql.NVarChar(120), input.enqueueCommandId)
        .query(`
          SELECT TOP 1 *
          FROM absence_workday_sync_jobs WITH (UPDLOCK, HOLDLOCK)
          WHERE company_id = @companyId
            AND enqueue_command_id = @enqueueCommandId
        `);
      if (byCommand.recordset[0]) {
        return mapRow(byCommand.recordset[0] as Record<string, unknown>);
      }
    }

    await requestFrom(transaction)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, input.absenceRequestId)
      .input("expectedVersion", sql.Int, input.expectedOperationalImpactVersion)
      .input("absenceStatus", sql.NVarChar(30), input.absenceStatus)
      .query(`
        UPDATE absence_workday_sync_jobs
        SET status = N'SUPERSEDED',
            superseded_at = SYSUTCDATETIME(),
            last_error = N'SUPERSEDE_REQUESTED',
            lease_owner = NULL,
            lease_expires_at = NULL,
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
      .input("enqueueCommandId", sql.NVarChar(120), input.enqueueCommandId ?? null)
      .query(`
        INSERT INTO absence_workday_sync_jobs (
          company_id, absence_request_id, absence_status, operation, status,
          expected_operational_impact_version, enqueue_command_id
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @absenceRequestId, @absenceStatus, @operation, N'PENDING',
          @expectedVersion, @enqueueCommandId
        )
      `);

    return mapRow(inserted.recordset[0] as Record<string, unknown>);
  },

  /**
   * Recover expired PROCESSING leases in bounded batches (not inside every claim).
   * When attempt_count reaches maxAttempts, jobs become FAILED (never stuck PENDING).
   */
  async recoverExpiredLeases(batchSize = 50, maxAttempts = 8): Promise<number> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const selected = await new sql.Request(transaction)
        .input("batchSize", sql.Int, batchSize)
        .query(`
          SELECT TOP (@batchSize) id, company_id
          FROM absence_workday_sync_jobs WITH (UPDLOCK, READPAST, ROWLOCK)
          WHERE status = N'PROCESSING'
            AND lease_expires_at IS NOT NULL
            AND lease_expires_at < SYSUTCDATETIME()
          ORDER BY lease_expires_at ASC
        `);

      let recovered = 0;
      for (const row of selected.recordset as Array<Record<string, unknown>>) {
        const result = await new sql.Request(transaction)
          .input("jobId", sql.UniqueIdentifier, String(row.id))
          .input("companyId", sql.UniqueIdentifier, String(row.company_id))
          .input("maxAttempts", sql.Int, maxAttempts)
          .query(`
            UPDATE absence_workday_sync_jobs
            SET attempt_count = attempt_count + 1,
                last_error = N'LEASE_EXPIRED',
                status = CASE
                  WHEN attempt_count + 1 >= @maxAttempts THEN N'FAILED'
                  ELSE N'PENDING'
                END,
                lease_owner = NULL,
                lease_expires_at = NULL,
                updated_at = SYSUTCDATETIME()
            WHERE id = @jobId
              AND company_id = @companyId
              AND status = N'PROCESSING'
              AND lease_expires_at IS NOT NULL
              AND lease_expires_at < SYSUTCDATETIME()
          `);
        recovered += result.rowsAffected[0] ?? 0;
      }

      await transaction.commit();
      return recovered;
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
      throw error;
    }
  },

  /**
   * Fail-closed check: worker still owns PROCESSING lease (no expiry extension).
   */
  async assertLeaseHeld(token: JobLeaseToken): Promise<void> {
    const result = await applyLeasePredicate(getPool().request(), token).query(`
      SELECT TOP 1 id
      FROM absence_workday_sync_jobs
      WHERE id = @jobId
        AND company_id = @companyId
        AND status = N'PROCESSING'
        AND lease_owner = @leaseOwner
        AND lease_version = @leaseVersion
        AND (lease_expires_at IS NULL OR lease_expires_at >= SYSUTCDATETIME())
    `);
    if (!result.recordset[0]) {
      throw new AppError(409, "JOB_LEASE_LOST", "El worker perdió el lease del job");
    }
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
      const result = await new sql.Request(transaction)
        .input("maxAttempts", sql.Int, maxAttempts)
        .query(`
          SELECT TOP 1 *
          FROM absence_workday_sync_jobs WITH (UPDLOCK, READPAST, ROWLOCK)
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
              lease_version = lease_version + 1,
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

  async renewLease(
    token: JobLeaseToken,
    leaseSeconds: number,
  ): Promise<void> {
    const result = await applyLeasePredicate(getPool().request(), token)
      .input("leaseSeconds", sql.Int, leaseSeconds)
      .query(`
        UPDATE absence_workday_sync_jobs
        SET lease_expires_at = DATEADD(SECOND, @leaseSeconds, SYSUTCDATETIME()),
            updated_at = SYSUTCDATETIME()
        WHERE id = @jobId
          AND company_id = @companyId
          AND status = N'PROCESSING'
          AND lease_owner = @leaseOwner
          AND lease_version = @leaseVersion
      `);
    throwIfLeaseLost(result.rowsAffected[0] ?? 0);
  },

  /**
   * Worker-owned completion (requires fencing token).
   */
  async markCompletedWithLease(token: JobLeaseToken): Promise<void> {
    const result = await applyLeasePredicate(getPool().request(), token).query(`
      UPDATE absence_workday_sync_jobs
      SET status = N'COMPLETED',
          last_error = NULL,
          lease_owner = NULL,
          lease_expires_at = NULL,
          updated_at = SYSUTCDATETIME()
      WHERE id = @jobId
        AND company_id = @companyId
        AND status = N'PROCESSING'
        AND lease_owner = @leaseOwner
        AND lease_version = @leaseVersion
    `);
    throwIfLeaseLost(result.rowsAffected[0] ?? 0);
  },

  /**
   * Inline sync path: complete only non-claimed PENDING/FAILED jobs (never steal PROCESSING).
   * Throws JOB_STATE_CONFLICT when no row matches.
   */
  async completeInlineJob(
    companyId: string,
    jobId: string,
    transaction?: sql.Transaction,
  ): Promise<void> {
    const result = await requestFrom(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("jobId", sql.UniqueIdentifier, jobId)
      .query(`
        UPDATE absence_workday_sync_jobs
        SET status = N'COMPLETED',
            last_error = NULL,
            lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @jobId
          AND company_id = @companyId
          AND status IN (N'PENDING', N'FAILED')
      `);
    if ((result.rowsAffected[0] ?? 0) === 0) {
      throw new AppError(
        409,
        "JOB_STATE_CONFLICT",
        "No se pudo completar el job (estado inesperado)",
      );
    }
  },

  /** @deprecated Use completeInlineJob or markCompletedWithLease */
  async markCompleted(
    companyId: string,
    jobId: string,
    transaction?: sql.Transaction,
  ): Promise<void> {
    return this.completeInlineJob(companyId, jobId, transaction);
  },

  async markSupersededWithLease(token: JobLeaseToken, reason: string): Promise<void> {
    const result = await applyLeasePredicate(getPool().request(), token)
      .input("reason", sql.NVarChar(1000), reason.slice(0, 1000))
      .query(`
        UPDATE absence_workday_sync_jobs
        SET status = N'SUPERSEDED',
            superseded_at = SYSUTCDATETIME(),
            last_error = @reason,
            lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @jobId
          AND company_id = @companyId
          AND status = N'PROCESSING'
          AND lease_owner = @leaseOwner
          AND lease_version = @leaseVersion
      `);
    throwIfLeaseLost(result.rowsAffected[0] ?? 0);
  },

  /**
   * Inline supersede for PENDING/FAILED only (never clears an active PROCESSING lease
   * without the cooperative enqueue SUPERSEDE_REQUESTED path).
   */
  async supersedeInlineJob(
    companyId: string,
    jobId: string,
    reason: string,
  ): Promise<void> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("jobId", sql.UniqueIdentifier, jobId)
      .input("reason", sql.NVarChar(1000), reason.slice(0, 1000))
      .query(`
        UPDATE absence_workday_sync_jobs
        SET status = N'SUPERSEDED',
            superseded_at = SYSUTCDATETIME(),
            last_error = @reason,
            lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @jobId AND company_id = @companyId
          AND status IN (N'PENDING', N'FAILED')
      `);
    if ((result.rowsAffected[0] ?? 0) === 0) {
      throw new AppError(
        409,
        "JOB_STATE_CONFLICT",
        "No se pudo superseder el job (estado inesperado)",
      );
    }
  },

  /** @deprecated Use supersedeInlineJob or markSupersededWithLease */
  async markSuperseded(
    companyId: string,
    jobId: string,
    reason: string,
  ): Promise<void> {
    return this.supersedeInlineJob(companyId, jobId, reason);
  },

  async markFailedAttemptWithLease(
    token: JobLeaseToken,
    errorMessage: string,
    maxAttempts: number,
  ): Promise<void> {
    const result = await applyLeasePredicate(getPool().request(), token)
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
            lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @jobId
          AND company_id = @companyId
          AND status = N'PROCESSING'
          AND lease_owner = @leaseOwner
          AND lease_version = @leaseVersion
      `);
    throwIfLeaseLost(result.rowsAffected[0] ?? 0);
  },

  /**
   * Inline failure for PENDING/FAILED only (never mutates PROCESSING without lease token).
   */
  async failInlineJob(
    companyId: string,
    jobId: string,
    errorMessage: string,
    maxAttempts: number,
  ): Promise<void> {
    const result = await getPool()
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
            lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @jobId
          AND company_id = @companyId
          AND status IN (N'PENDING', N'FAILED')
      `);
    if ((result.rowsAffected[0] ?? 0) === 0) {
      throw new AppError(
        409,
        "JOB_STATE_CONFLICT",
        "No se pudo marcar fallo del job (estado inesperado)",
      );
    }
  },

  /** @deprecated Use failInlineJob or markFailedAttemptWithLease */
  async markFailedAttempt(
    companyId: string,
    jobId: string,
    errorMessage: string,
    maxAttempts: number,
  ): Promise<void> {
    return this.failInlineJob(companyId, jobId, errorMessage, maxAttempts);
  },

  toLeaseToken(job: AbsenceWorkdaySyncJob): JobLeaseToken {
    if (!job.leaseOwner) {
      throw new AppError(409, "JOB_LEASE_LOST", "El job no tiene lease_owner");
    }
    return {
      companyId: job.companyId,
      jobId: job.id,
      leaseOwner: job.leaseOwner,
      leaseVersion: job.leaseVersion,
    };
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
