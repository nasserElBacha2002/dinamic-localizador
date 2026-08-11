import sql from "mssql";
import { getPool } from "../database/connection";
import {
  OPERATION_ASSIGNMENT_NOTIFICATION_DEFAULT_MAX_ATTEMPTS,
  OPERATION_ASSIGNMENT_NOTIFICATION_TYPE,
  type OperationAssignmentNotificationStatus,
  type OperationAssignmentNotificationType,
  type OperationAssignmentSendAttemptStatus,
} from "../constants/operation-assignment-notification";
import type {
  OperationAssignmentNotification,
  OperationAssignmentNotificationSendAttempt,
} from "../types/operation-assignment-notification";
import { isDuplicateKeyError } from "../utils/sql-server-errors";
import { operationAssignmentNotificationMetrics } from "../utils/operation-assignment-notification/metrics";

const requestFrom = (transaction?: sql.Transaction) =>
  transaction ? new sql.Request(transaction) : getPool().request();

const mapRow = (row: Record<string, unknown>): OperationAssignmentNotification => ({
  id: String(row.id),
  companyId: String(row.company_id),
  operationAssignmentId: String(row.operation_assignment_id),
  operationId: String(row.operation_id),
  employeeId: String(row.employee_id),
  notificationType: String(row.notification_type) as OperationAssignmentNotificationType,
  status: String(row.status) as OperationAssignmentNotificationStatus,
  attemptCount: Number(row.attempt_count ?? 0),
  nextAttemptAt: row.next_attempt_at
    ? new Date(row.next_attempt_at as Date | string).toISOString()
    : null,
  leaseOwner: row.lease_owner ? String(row.lease_owner) : null,
  leaseExpiresAt: row.lease_expires_at
    ? new Date(row.lease_expires_at as Date | string).toISOString()
    : null,
  providerMessageSid: row.provider_message_sid ? String(row.provider_message_sid) : null,
  providerStatus: row.provider_status ? String(row.provider_status) : null,
  cancelRequestedAt: row.cancel_requested_at
    ? new Date(row.cancel_requested_at as Date | string).toISOString()
    : null,
  activeSendAttemptId: row.active_send_attempt_id
    ? String(row.active_send_attempt_id)
    : null,
  lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
  lastErrorMessage: row.last_error_message ? String(row.last_error_message) : null,
  sentAt: row.sent_at ? new Date(row.sent_at as Date | string).toISOString() : null,
  createdAt: new Date(row.created_at as Date | string).toISOString(),
  updatedAt: new Date(row.updated_at as Date | string).toISOString(),
});

const mapAttemptRow = (
  row: Record<string, unknown>,
): OperationAssignmentNotificationSendAttempt => ({
  id: String(row.id),
  companyId: String(row.company_id),
  notificationId: String(row.notification_id),
  attemptNumber: Number(row.attempt_number),
  status: String(row.status) as OperationAssignmentSendAttemptStatus,
  providerMessageSid: row.provider_message_sid ? String(row.provider_message_sid) : null,
  lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
  lastErrorMessage: row.last_error_message ? String(row.last_error_message) : null,
  startedAt: new Date(row.started_at as Date | string).toISOString(),
  finishedAt: row.finished_at
    ? new Date(row.finished_at as Date | string).toISOString()
    : null,
  createdAt: new Date(row.created_at as Date | string).toISOString(),
  updatedAt: new Date(row.updated_at as Date | string).toISOString(),
});

const findExisting = async (
  companyId: string,
  assignmentId: string,
  notificationType: string,
  transaction?: sql.Transaction,
): Promise<OperationAssignmentNotification | null> => {
  const result = await requestFrom(transaction)
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("assignmentId", sql.UniqueIdentifier, assignmentId)
    .input("notificationType", sql.NVarChar(40), notificationType)
    .query(`
      SELECT TOP 1 *
      FROM whatsapp_operation_assignment_notifications WITH (UPDLOCK, HOLDLOCK)
      WHERE company_id = @companyId
        AND operation_assignment_id = @assignmentId
        AND notification_type = @notificationType
    `);
  if (!result.recordset[0]) {
    return null;
  }
  return mapRow(result.recordset[0] as Record<string, unknown>);
};

export const operationAssignmentNotificationRepository = {
  /**
   * Enqueue EVENTUAL_OPERATION_ASSIGNED for a ONE_TIME assignment.
   * MUST be called within the same transaction as the assignment insert.
   */
  async enqueueAssigned(
    companyId: string,
    assignmentId: string,
    operationId: string,
    employeeId: string,
    transaction?: sql.Transaction,
  ): Promise<OperationAssignmentNotification> {
    const notificationType = OPERATION_ASSIGNMENT_NOTIFICATION_TYPE;
    try {
      const inserted = await requestFrom(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("assignmentId", sql.UniqueIdentifier, assignmentId)
        .input("operationId", sql.UniqueIdentifier, operationId)
        .input("employeeId", sql.UniqueIdentifier, employeeId)
        .input("notificationType", sql.NVarChar(40), notificationType)
        .query(`
          INSERT INTO whatsapp_operation_assignment_notifications (
            company_id, operation_assignment_id, operation_id, employee_id, notification_type, status
          )
          OUTPUT INSERTED.*
          VALUES (
            @companyId, @assignmentId, @operationId, @employeeId, @notificationType, N'PENDING'
          )
        `);
      const created = mapRow(inserted.recordset[0] as Record<string, unknown>);
      operationAssignmentNotificationMetrics.notificationCreated({ status: "PENDING" });
      return created;
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      const existing = await findExisting(companyId, assignmentId, notificationType, transaction);
      if (existing) {
        return existing;
      }
      throw error;
    }
  },

  /**
   * Soft-cancel race: set cancel_requested_at for in-flight rows;
   * CANCELLED immediately for PENDING/FAILED only.
   */
  async requestCancelForAssignment(
    companyId: string,
    assignmentId: string,
    transaction?: sql.Transaction,
  ): Promise<number> {
    const result = await requestFrom(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignmentId)
      .query(`
        UPDATE whatsapp_operation_assignment_notifications
        SET cancel_requested_at = COALESCE(cancel_requested_at, SYSUTCDATETIME()),
            status = CASE
              WHEN status IN (N'PENDING', N'FAILED') THEN N'CANCELLED'
              ELSE status
            END,
            lease_owner = CASE
              WHEN status IN (N'PENDING', N'FAILED') THEN NULL
              ELSE lease_owner
            END,
            lease_expires_at = CASE
              WHEN status IN (N'PENDING', N'FAILED') THEN NULL
              ELSE lease_expires_at
            END,
            next_attempt_at = CASE
              WHEN status IN (N'PENDING', N'FAILED') THEN NULL
              ELSE next_attempt_at
            END,
            last_error_code = CASE
              WHEN status IN (N'PENDING', N'FAILED') THEN N'CANCELLED'
              ELSE last_error_code
            END,
            last_error_message = CASE
              WHEN status IN (N'PENDING', N'FAILED') THEN N'Assignment cancelled or removed'
              ELSE last_error_message
            END,
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND operation_assignment_id = @assignmentId
          AND status IN (N'PENDING', N'FAILED', N'PROCESSING', N'SEND_STARTED')
      `);
    return Number(result.rowsAffected[0] ?? 0);
  },

  /**
   * Recover expired leases without bumping attempt_count.
   * SEND_STARTED or open STARTED/AMBIGUOUS attempts → RECONCILIATION_REQUIRED.
   */
  async recoverExpiredLeases(batchSize = 50): Promise<number> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const selected = await new sql.Request(transaction)
        .input("batchSize", sql.Int, batchSize)
        .query(`
          SELECT TOP (@batchSize) id, company_id
          FROM whatsapp_operation_assignment_notifications WITH (UPDLOCK, READPAST, ROWLOCK)
          WHERE status IN (N'PROCESSING', N'SEND_STARTED')
            AND lease_expires_at IS NOT NULL
            AND lease_expires_at < SYSUTCDATETIME()
          ORDER BY lease_expires_at ASC
        `);

      let recovered = 0;
      for (const row of selected.recordset as Array<Record<string, unknown>>) {
        const result = await new sql.Request(transaction)
          .input("id", sql.UniqueIdentifier, String(row.id))
          .input("companyId", sql.UniqueIdentifier, String(row.company_id))
          .query(`
            UPDATE n
            SET last_error_code = N'LEASE_EXPIRED',
                last_error_message = N'Lease expired before completion',
                status = CASE
                  WHEN n.status = N'SEND_STARTED' THEN N'RECONCILIATION_REQUIRED'
                  WHEN EXISTS (
                    SELECT 1
                    FROM whatsapp_operation_assignment_notification_send_attempts a
                    WHERE a.id = n.active_send_attempt_id
                      AND a.company_id = n.company_id
                      AND a.status IN (N'STARTED', N'AMBIGUOUS')
                  ) THEN N'RECONCILIATION_REQUIRED'
                  WHEN n.cancel_requested_at IS NOT NULL THEN N'CANCELLED'
                  ELSE N'PENDING'
                END,
                lease_owner = NULL,
                lease_expires_at = NULL,
                next_attempt_at = CASE
                  WHEN n.status = N'SEND_STARTED'
                    OR EXISTS (
                      SELECT 1
                      FROM whatsapp_operation_assignment_notification_send_attempts a
                      WHERE a.id = n.active_send_attempt_id
                        AND a.company_id = n.company_id
                        AND a.status IN (N'STARTED', N'AMBIGUOUS')
                    )
                    OR n.cancel_requested_at IS NOT NULL
                  THEN NULL
                  ELSE SYSUTCDATETIME()
                END,
                updated_at = SYSUTCDATETIME()
            FROM whatsapp_operation_assignment_notifications n
            WHERE n.id = @id
              AND n.company_id = @companyId
              AND n.status IN (N'PROCESSING', N'SEND_STARTED')
              AND n.lease_expires_at IS NOT NULL
              AND n.lease_expires_at < SYSUTCDATETIME()
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
   * Claim ONE due PENDING / retryable FAILED row. Increments attempt_count once.
   */
  async claimNextOne(
    workerId: string,
    leaseSeconds: number,
    maxAttempts = OPERATION_ASSIGNMENT_NOTIFICATION_DEFAULT_MAX_ATTEMPTS,
  ): Promise<OperationAssignmentNotification | null> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const result = await new sql.Request(transaction)
        .input("maxAttempts", sql.Int, maxAttempts)
        .input("leaseOwner", sql.NVarChar(100), workerId)
        .input("leaseSeconds", sql.Int, leaseSeconds)
        .query(`
          ;WITH next_row AS (
            SELECT TOP (1) id, company_id
            FROM whatsapp_operation_assignment_notifications WITH (UPDLOCK, READPAST, ROWLOCK)
            WHERE attempt_count < @maxAttempts
              AND cancel_requested_at IS NULL
              AND (lease_expires_at IS NULL OR lease_expires_at < SYSUTCDATETIME())
              AND (
                status = N'PENDING'
                OR (
                  status = N'FAILED'
                  AND next_attempt_at IS NOT NULL
                  AND next_attempt_at <= SYSUTCDATETIME()
                )
              )
            ORDER BY
              CASE WHEN status = N'PENDING' THEN 0 ELSE 1 END,
              COALESCE(next_attempt_at, created_at) ASC,
              created_at ASC
          )
          UPDATE n
          SET status = N'PROCESSING',
              attempt_count = attempt_count + 1,
              lease_owner = @leaseOwner,
              lease_expires_at = DATEADD(SECOND, @leaseSeconds, SYSUTCDATETIME()),
              next_attempt_at = NULL,
              updated_at = SYSUTCDATETIME()
          OUTPUT INSERTED.*
          FROM whatsapp_operation_assignment_notifications n
          INNER JOIN next_row r ON r.id = n.id AND r.company_id = n.company_id
          WHERE n.status IN (N'PENDING', N'FAILED')
            AND n.cancel_requested_at IS NULL
        `);

      await transaction.commit();
      if (!result.recordset[0]) {
        return null;
      }
      return mapRow(result.recordset[0] as Record<string, unknown>);
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
      throw error;
    }
  },

  /** Compat: claim up to `limit` via repeated claimNextOne. */
  async claimNextBatch(
    workerId: string,
    limit: number,
    leaseSeconds: number,
    maxAttempts = OPERATION_ASSIGNMENT_NOTIFICATION_DEFAULT_MAX_ATTEMPTS,
  ): Promise<OperationAssignmentNotification[]> {
    const claimed: OperationAssignmentNotification[] = [];
    for (let i = 0; i < limit; i += 1) {
      const row = await this.claimNextOne(workerId, leaseSeconds, maxAttempts);
      if (!row) {
        break;
      }
      claimed.push(row);
    }
    return claimed;
  },

  async beginSendAttempt(input: {
    companyId: string;
    notificationId: string;
    leaseOwner: string;
    attemptNumber: number;
  }): Promise<OperationAssignmentNotificationSendAttempt | null> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const inserted = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("notificationId", sql.UniqueIdentifier, input.notificationId)
        .input("attemptNumber", sql.Int, input.attemptNumber)
        .query(`
          INSERT INTO whatsapp_operation_assignment_notification_send_attempts (
            company_id, notification_id, attempt_number, status
          )
          OUTPUT INSERTED.*
          VALUES (
            @companyId, @notificationId, @attemptNumber, N'STARTED'
          )
        `);
      const attempt = mapAttemptRow(inserted.recordset[0] as Record<string, unknown>);

      const cas = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("id", sql.UniqueIdentifier, input.notificationId)
        .input("leaseOwner", sql.NVarChar(100), input.leaseOwner)
        .input("attemptId", sql.UniqueIdentifier, attempt.id)
        .query(`
          UPDATE whatsapp_operation_assignment_notifications
          SET status = N'SEND_STARTED',
              active_send_attempt_id = @attemptId,
              updated_at = SYSUTCDATETIME()
          WHERE id = @id
            AND company_id = @companyId
            AND lease_owner = @leaseOwner
            AND status = N'PROCESSING'
            AND cancel_requested_at IS NULL
        `);

      if ((cas.rowsAffected[0] ?? 0) === 0) {
        await transaction.rollback();
        return null;
      }

      await transaction.commit();
      return attempt;
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        /* ignore */
      }
      throw error;
    }
  },

  async markSendAttemptAccepted(input: {
    companyId: string;
    attemptId: string;
    providerMessageSid: string;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.attemptId)
      .input("providerMessageSid", sql.NVarChar(100), input.providerMessageSid)
      .query(`
        UPDATE whatsapp_operation_assignment_notification_send_attempts
        SET status = N'PROVIDER_ACCEPTED',
            provider_message_sid = @providerMessageSid,
            finished_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId
      `);
  },

  async markSendAttemptFailed(input: {
    companyId: string;
    attemptId: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.attemptId)
      .input("errorCode", sql.NVarChar(80), input.errorCode.slice(0, 80))
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage.slice(0, 1000))
      .query(`
        UPDATE whatsapp_operation_assignment_notification_send_attempts
        SET status = N'PROVIDER_FAILED',
            last_error_code = @errorCode,
            last_error_message = @errorMessage,
            finished_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId
      `);
  },

  async markSendAttemptAmbiguous(input: {
    companyId: string;
    attemptId: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.attemptId)
      .input("errorCode", sql.NVarChar(80), input.errorCode.slice(0, 80))
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage.slice(0, 1000))
      .query(`
        UPDATE whatsapp_operation_assignment_notification_send_attempts
        SET status = N'AMBIGUOUS',
            last_error_code = @errorCode,
            last_error_message = @errorMessage,
            finished_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId
      `);
  },

  async markSendAccepted(input: {
    companyId: string;
    notificationId: string;
    providerMessageSid: string;
    sentAt?: Date;
  }): Promise<void> {
    const sentAt = input.sentAt ?? new Date();
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.notificationId)
      .input("providerMessageSid", sql.NVarChar(100), input.providerMessageSid)
      .input("sentAt", sql.DateTime2, sentAt)
      .query(`
        UPDATE whatsapp_operation_assignment_notifications
        SET status = N'SEND_ACCEPTED',
            provider_message_sid = @providerMessageSid,
            sent_at = @sentAt,
            lease_owner = NULL,
            lease_expires_at = NULL,
            next_attempt_at = NULL,
            last_error_code = NULL,
            last_error_message = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND company_id = @companyId
          AND status IN (N'PROCESSING', N'SEND_STARTED')
      `);
    if ((result.rowsAffected[0] ?? 0) === 0) {
      throw new Error("MARK_SEND_ACCEPTED_NOOP");
    }
  },

  async markFailed(input: {
    companyId: string;
    notificationId: string;
    errorCode: string;
    errorMessage: string;
    /** null = permanent (no automatic retry). */
    nextAttemptAt: Date | null;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.notificationId)
      .input("errorCode", sql.NVarChar(80), input.errorCode.slice(0, 80))
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage.slice(0, 1000))
      .input("nextAttemptAt", sql.DateTime2, input.nextAttemptAt)
      .query(`
        UPDATE whatsapp_operation_assignment_notifications
        SET status = N'FAILED',
            last_error_code = @errorCode,
            last_error_message = @errorMessage,
            next_attempt_at = @nextAttemptAt,
            lease_owner = NULL,
            lease_expires_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND company_id = @companyId
          AND status IN (N'PROCESSING', N'SEND_STARTED')
      `);
  },

  async markCancelled(input: {
    companyId: string;
    notificationId: string;
    errorCode?: string;
    errorMessage?: string;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.notificationId)
      .input("errorCode", sql.NVarChar(80), (input.errorCode ?? "CANCELLED").slice(0, 80))
      .input(
        "errorMessage",
        sql.NVarChar(1000),
        (input.errorMessage ?? "Notification cancelled").slice(0, 1000),
      )
      .query(`
        UPDATE whatsapp_operation_assignment_notifications
        SET status = N'CANCELLED',
            last_error_code = @errorCode,
            last_error_message = @errorMessage,
            lease_owner = NULL,
            lease_expires_at = NULL,
            next_attempt_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND company_id = @companyId
          AND status IN (N'PROCESSING', N'SEND_STARTED')
      `);
  },

  async markSentRecoveryRequired(input: {
    companyId: string;
    notificationId: string;
    providerMessageSid: string;
    errorMessage: string;
  }): Promise<void> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.notificationId)
      .input("providerMessageSid", sql.NVarChar(100), input.providerMessageSid)
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage.slice(0, 1000))
      .query(`
        UPDATE whatsapp_operation_assignment_notifications
        SET status = N'SENT_RECOVERY_REQUIRED',
            provider_message_sid = @providerMessageSid,
            last_error_code = N'MARK_SEND_ACCEPTED_FAILED',
            last_error_message = @errorMessage,
            lease_owner = NULL,
            lease_expires_at = NULL,
            next_attempt_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND company_id = @companyId
          AND status IN (N'PROCESSING', N'SEND_STARTED')
      `);
    if ((result.rowsAffected[0] ?? 0) === 0) {
      throw new Error("MARK_SENT_RECOVERY_REQUIRED_NOOP");
    }
  },

  async markReconciliationRequired(input: {
    companyId: string;
    notificationId: string;
    errorCode?: string;
    errorMessage?: string;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.notificationId)
      .input("errorCode", sql.NVarChar(80), (input.errorCode ?? "AMBIGUOUS_SEND").slice(0, 80))
      .input(
        "errorMessage",
        sql.NVarChar(1000),
        (input.errorMessage ?? "Send outcome ambiguous; manual reconcile required").slice(
          0,
          1000,
        ),
      )
      .query(`
        UPDATE whatsapp_operation_assignment_notifications
        SET status = N'RECONCILIATION_REQUIRED',
            last_error_code = @errorCode,
            last_error_message = @errorMessage,
            lease_owner = NULL,
            lease_expires_at = NULL,
            next_attempt_at = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND company_id = @companyId
          AND status IN (N'PROCESSING', N'SEND_STARTED')
      `);
  },

  async isCancelRequested(companyId: string, notificationId: string): Promise<boolean> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, notificationId)
      .query(`
        SELECT TOP 1 cancel_requested_at
        FROM whatsapp_operation_assignment_notifications
        WHERE id = @id AND company_id = @companyId
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return Boolean(row?.cancel_requested_at);
  },

  /**
   * Promote recoverable terminal states when provider SID is known.
   * Does not call Twilio.
   */
  async reconcileTerminalStates(batchSize = 50): Promise<number> {
    const pool = getPool();
    let promoted = 0;

    const recovery = await pool
      .request()
      .input("batchSize", sql.Int, batchSize)
      .query(`
        ;WITH due AS (
          SELECT TOP (@batchSize) id, company_id
          FROM whatsapp_operation_assignment_notifications WITH (UPDLOCK, READPAST, ROWLOCK)
          WHERE status = N'SENT_RECOVERY_REQUIRED'
            AND provider_message_sid IS NOT NULL
          ORDER BY updated_at ASC
        )
        UPDATE n
        SET status = N'SEND_ACCEPTED',
            sent_at = COALESCE(n.sent_at, SYSUTCDATETIME()),
            last_error_code = NULL,
            last_error_message = NULL,
            lease_owner = NULL,
            lease_expires_at = NULL,
            next_attempt_at = NULL,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.id
        FROM whatsapp_operation_assignment_notifications n
        INNER JOIN due d ON d.id = n.id AND d.company_id = n.company_id
        WHERE n.status = N'SENT_RECOVERY_REQUIRED'
          AND n.provider_message_sid IS NOT NULL
      `);
    promoted += recovery.recordset.length;

    const reconciliation = await pool
      .request()
      .input("batchSize", sql.Int, batchSize)
      .query(`
        ;WITH due AS (
          SELECT TOP (@batchSize) n.id, n.company_id
          FROM whatsapp_operation_assignment_notifications n WITH (UPDLOCK, READPAST, ROWLOCK)
          INNER JOIN whatsapp_operation_assignment_notification_send_attempts a
            ON a.id = n.active_send_attempt_id
           AND a.company_id = n.company_id
          WHERE n.status = N'RECONCILIATION_REQUIRED'
            AND (
              a.status = N'PROVIDER_ACCEPTED'
              OR a.provider_message_sid IS NOT NULL
            )
          ORDER BY n.updated_at ASC
        )
        UPDATE n
        SET status = N'SEND_ACCEPTED',
            provider_message_sid = COALESCE(n.provider_message_sid, a.provider_message_sid),
            sent_at = COALESCE(n.sent_at, SYSUTCDATETIME()),
            last_error_code = NULL,
            last_error_message = NULL,
            lease_owner = NULL,
            lease_expires_at = NULL,
            next_attempt_at = NULL,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.id
        FROM whatsapp_operation_assignment_notifications n
        INNER JOIN due d ON d.id = n.id AND d.company_id = n.company_id
        INNER JOIN whatsapp_operation_assignment_notification_send_attempts a
          ON a.id = n.active_send_attempt_id
         AND a.company_id = n.company_id
        WHERE n.status = N'RECONCILIATION_REQUIRED'
      `);
    promoted += reconciliation.recordset.length;

    return promoted;
  },

  async findLatestSendAttempt(
    companyId: string,
    notificationId: string,
  ): Promise<OperationAssignmentNotificationSendAttempt | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("notificationId", sql.UniqueIdentifier, notificationId)
      .query(`
        SELECT TOP 1 *
        FROM whatsapp_operation_assignment_notification_send_attempts
        WHERE company_id = @companyId
          AND notification_id = @notificationId
        ORDER BY attempt_number DESC
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapAttemptRow(result.recordset[0] as Record<string, unknown>);
  },
};
