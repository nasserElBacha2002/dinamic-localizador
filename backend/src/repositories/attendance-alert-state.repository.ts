import sql from "mssql";
import { getPool } from "../database/connection";
import type { AttendanceAlertBand } from "../constants/attendance-alert";
import {
  ATTENDANCE_ALERT_EVALUATION_LEASE_SECONDS,
  ATTENDANCE_ALERT_EVALUATION_MAX_ATTEMPTS,
} from "../constants/attendance-alert";

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export type EmployeeAttendanceAlertState = {
  id: string;
  companyId: string;
  employeeId: string;
  currentBand: AttendanceAlertBand;
  lastRate: number | null;
  lastPresentWorkdays: number;
  lastAbsentWorkdays: number;
  lastEvaluatedWorkdays: number;
  lastEvaluatedAt: string;
  lastCrossedBelowAt: string | null;
  lastAlertedAt: string | null;
  crossingSequence: number;
  pendingAlertCrossingSequence: number | null;
  pendingAlertOccurredAt: string | null;
  pendingAlertRate: number | null;
  pendingAlertEvaluatedWorkdays: number | null;
  configVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type AttendanceAlertEvaluationQueueItem = {
  id: string;
  companyId: string;
  employeeId: string;
  status: "PENDING" | "PROCESSING" | "FAILED";
  attemptCount: number;
  nextAttemptAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  requestedAt: string;
};

const mapState = (row: Record<string, unknown>): EmployeeAttendanceAlertState => ({
  id: String(row.id),
  companyId: String(row.company_id),
  employeeId: String(row.employee_id),
  currentBand: String(row.current_band) as AttendanceAlertBand,
  lastRate: row.last_rate == null ? null : Number(row.last_rate),
  lastPresentWorkdays: Number(row.last_present_workdays ?? 0),
  lastAbsentWorkdays: Number(row.last_absent_workdays ?? 0),
  lastEvaluatedWorkdays: Number(row.last_evaluated_workdays ?? 0),
  lastEvaluatedAt: toIso(row.last_evaluated_at as Date | string),
  lastCrossedBelowAt: row.last_crossed_below_at
    ? toIso(row.last_crossed_below_at as Date | string)
    : null,
  lastAlertedAt: row.last_alerted_at ? toIso(row.last_alerted_at as Date | string) : null,
  crossingSequence: Number(row.crossing_sequence ?? 0),
  pendingAlertCrossingSequence:
    row.pending_alert_crossing_sequence == null
      ? null
      : Number(row.pending_alert_crossing_sequence),
  pendingAlertOccurredAt: row.pending_alert_occurred_at
    ? toIso(row.pending_alert_occurred_at as Date | string)
    : null,
  pendingAlertRate:
    row.pending_alert_rate == null ? null : Number(row.pending_alert_rate),
  pendingAlertEvaluatedWorkdays:
    row.pending_alert_evaluated_workdays == null
      ? null
      : Number(row.pending_alert_evaluated_workdays),
  configVersion: Number(row.config_version ?? 0),
  createdAt: toIso(row.created_at as Date | string),
  updatedAt: toIso(row.updated_at as Date | string),
});

const mapQueue = (row: Record<string, unknown>): AttendanceAlertEvaluationQueueItem => ({
  id: String(row.id),
  companyId: String(row.company_id),
  employeeId: String(row.employee_id),
  status: String(row.status) as AttendanceAlertEvaluationQueueItem["status"],
  attemptCount: Number(row.attempt_count ?? 0),
  nextAttemptAt: row.next_attempt_at ? toIso(row.next_attempt_at as Date | string) : null,
  leaseOwner: row.lease_owner ? String(row.lease_owner) : null,
  leaseExpiresAt: row.lease_expires_at
    ? toIso(row.lease_expires_at as Date | string)
    : null,
  lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
  lastErrorMessage: row.last_error_message ? String(row.last_error_message) : null,
  requestedAt: toIso(row.requested_at as Date | string),
});

const requestFrom = (transaction?: sql.Transaction) =>
  transaction ? new sql.Request(transaction) : getPool().request();

export type UpsertAttendanceAlertStateInput = {
  companyId: string;
  employeeId: string;
  currentBand: AttendanceAlertBand;
  lastRate: number | null;
  lastPresentWorkdays: number;
  lastAbsentWorkdays: number;
  lastEvaluatedWorkdays: number;
  lastCrossedBelowAt?: Date | null;
  lastAlertedAt?: Date | null;
  crossingSequence: number;
  pendingAlertCrossingSequence?: number | null;
  pendingAlertOccurredAt?: Date | null;
  pendingAlertRate?: number | null;
  pendingAlertEvaluatedWorkdays?: number | null;
  configVersion: number;
  clearPendingAlert?: boolean;
};

export const attendanceAlertStateRepository = {
  async findByEmployee(
    companyId: string,
    employeeId: string,
  ): Promise<EmployeeAttendanceAlertState | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT TOP 1 *
        FROM employee_attendance_alert_state
        WHERE company_id = @companyId AND employee_id = @employeeId
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapState(row) : null;
  },

  async upsertState(
    input: UpsertAttendanceAlertStateInput,
    transaction?: sql.Transaction,
  ): Promise<EmployeeAttendanceAlertState> {
    const result = await requestFrom(transaction)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("currentBand", sql.NVarChar(40), input.currentBand)
      .input("lastRate", sql.Decimal(7, 3), input.lastRate)
      .input("lastPresentWorkdays", sql.Int, input.lastPresentWorkdays)
      .input("lastAbsentWorkdays", sql.Int, input.lastAbsentWorkdays)
      .input("lastEvaluatedWorkdays", sql.Int, input.lastEvaluatedWorkdays)
      .input("lastCrossedBelowAt", sql.DateTime2, input.lastCrossedBelowAt ?? null)
      .input("lastAlertedAt", sql.DateTime2, input.lastAlertedAt ?? null)
      .input("crossingSequence", sql.Int, input.crossingSequence)
      .input(
        "pendingAlertCrossingSequence",
        sql.Int,
        input.clearPendingAlert ? null : (input.pendingAlertCrossingSequence ?? null),
      )
      .input(
        "pendingAlertOccurredAt",
        sql.DateTime2,
        input.clearPendingAlert ? null : (input.pendingAlertOccurredAt ?? null),
      )
      .input(
        "pendingAlertRate",
        sql.Decimal(7, 3),
        input.clearPendingAlert ? null : (input.pendingAlertRate ?? null),
      )
      .input(
        "pendingAlertEvaluatedWorkdays",
        sql.Int,
        input.clearPendingAlert ? null : (input.pendingAlertEvaluatedWorkdays ?? null),
      )
      .input("configVersion", sql.Int, input.configVersion)
      .query(`
        MERGE employee_attendance_alert_state AS target
        USING (SELECT @companyId AS company_id, @employeeId AS employee_id) AS src
          ON target.company_id = src.company_id AND target.employee_id = src.employee_id
        WHEN MATCHED THEN UPDATE SET
          current_band = @currentBand,
          last_rate = @lastRate,
          last_present_workdays = @lastPresentWorkdays,
          last_absent_workdays = @lastAbsentWorkdays,
          last_evaluated_workdays = @lastEvaluatedWorkdays,
          last_evaluated_at = SYSUTCDATETIME(),
          last_crossed_below_at = @lastCrossedBelowAt,
          last_alerted_at = @lastAlertedAt,
          crossing_sequence = @crossingSequence,
          pending_alert_crossing_sequence = @pendingAlertCrossingSequence,
          pending_alert_occurred_at = @pendingAlertOccurredAt,
          pending_alert_rate = @pendingAlertRate,
          pending_alert_evaluated_workdays = @pendingAlertEvaluatedWorkdays,
          config_version = @configVersion,
          updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (
          company_id, employee_id, current_band, last_rate,
          last_present_workdays, last_absent_workdays, last_evaluated_workdays,
          last_crossed_below_at, last_alerted_at, crossing_sequence,
          pending_alert_crossing_sequence, pending_alert_occurred_at,
          pending_alert_rate, pending_alert_evaluated_workdays, config_version
        ) VALUES (
          @companyId, @employeeId, @currentBand, @lastRate,
          @lastPresentWorkdays, @lastAbsentWorkdays, @lastEvaluatedWorkdays,
          @lastCrossedBelowAt, @lastAlertedAt, @crossingSequence,
          @pendingAlertCrossingSequence, @pendingAlertOccurredAt,
          @pendingAlertRate, @pendingAlertEvaluatedWorkdays, @configVersion
        )
        OUTPUT INSERTED.*;
      `);
    return mapState(result.recordset[0] as Record<string, unknown>);
  },

  async clearPendingAlert(
    companyId: string,
    employeeId: string,
    crossingSequence: number,
  ): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("crossingSequence", sql.Int, crossingSequence)
      .query(`
        UPDATE employee_attendance_alert_state
        SET pending_alert_crossing_sequence = NULL,
            pending_alert_occurred_at = NULL,
            pending_alert_rate = NULL,
            pending_alert_evaluated_workdays = NULL,
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND employee_id = @employeeId
          AND pending_alert_crossing_sequence = @crossingSequence
      `);
  },

  async listPendingAlertStates(batchSize = 50): Promise<EmployeeAttendanceAlertState[]> {
    const result = await getPool()
      .request()
      .input("batchSize", sql.Int, batchSize)
      .query(`
        SELECT TOP (@batchSize) s.*
        FROM employee_attendance_alert_state s
        INNER JOIN company_settings cs ON cs.company_id = s.company_id
        WHERE s.pending_alert_crossing_sequence IS NOT NULL
          AND cs.admin_alerts_enabled = 1
          AND cs.attendance_threshold_alerts_enabled = 1
        ORDER BY s.pending_alert_occurred_at ASC
      `);
    return (result.recordset as Record<string, unknown>[]).map(mapState);
  },
};

export const attendanceAlertEvaluationQueueRepository = {
  async markDirty(
    companyId: string,
    employeeId: string,
    transaction?: sql.Transaction,
  ): Promise<void> {
    await requestFrom(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        MERGE attendance_alert_evaluation_queue AS target
        USING (SELECT @companyId AS company_id, @employeeId AS employee_id) AS src
          ON target.company_id = src.company_id AND target.employee_id = src.employee_id
        WHEN MATCHED THEN UPDATE SET
          status = N'PENDING',
          next_attempt_at = NULL,
          lease_owner = NULL,
          lease_expires_at = NULL,
          requested_at = SYSUTCDATETIME(),
          updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (company_id, employee_id, status, requested_at)
          VALUES (@companyId, @employeeId, N'PENDING', SYSUTCDATETIME());
      `);
  },

  async enqueueEmployeesWithWorkdaysInWindow(
    companyId: string,
    windowDays: number,
  ): Promise<number> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("windowDays", sql.Int, windowDays)
      .query(`
        ;WITH candidates AS (
          SELECT DISTINCT ew.employee_id
          FROM employee_workdays ew
          INNER JOIN operation_workdays ow
            ON ow.id = ew.operation_workday_id AND ow.company_id = ew.company_id
          WHERE ew.company_id = @companyId
            AND ow.work_date >= CAST(DATEADD(DAY, -@windowDays, SYSUTCDATETIME()) AS DATE)
            AND ow.work_date <= CAST(SYSUTCDATETIME() AS DATE)
        )
        MERGE attendance_alert_evaluation_queue AS target
        USING candidates AS src
          ON target.company_id = @companyId AND target.employee_id = src.employee_id
        WHEN MATCHED THEN UPDATE SET
          status = N'PENDING',
          next_attempt_at = NULL,
          lease_owner = NULL,
          lease_expires_at = NULL,
          requested_at = SYSUTCDATETIME(),
          updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (company_id, employee_id, status, requested_at)
          VALUES (@companyId, src.employee_id, N'PENDING', SYSUTCDATETIME());
        SELECT @@ROWCOUNT AS affected;
      `);
    return Number(result.recordset[0]?.affected ?? 0);
  },

  async recoverExpiredLeases(batchSize = 50): Promise<number> {
    const result = await getPool()
      .request()
      .input("batchSize", sql.Int, batchSize)
      .query(`
        ;WITH expired AS (
          SELECT TOP (@batchSize) id
          FROM attendance_alert_evaluation_queue WITH (UPDLOCK, READPAST, ROWLOCK)
          WHERE status = N'PROCESSING'
            AND lease_expires_at IS NOT NULL
            AND lease_expires_at < SYSUTCDATETIME()
          ORDER BY lease_expires_at ASC
        )
        UPDATE q
        SET status = N'PENDING',
            lease_owner = NULL,
            lease_expires_at = NULL,
            last_error_code = N'LEASE_EXPIRED',
            last_error_message = N'Evaluation lease expired',
            updated_at = SYSUTCDATETIME()
        FROM attendance_alert_evaluation_queue q
        INNER JOIN expired e ON e.id = q.id;
        SELECT @@ROWCOUNT AS recovered;
      `);
    return Number(result.recordset[0]?.recovered ?? 0);
  },

  async claimNextOne(
    workerId: string,
    leaseSeconds = ATTENDANCE_ALERT_EVALUATION_LEASE_SECONDS,
    maxAttempts = ATTENDANCE_ALERT_EVALUATION_MAX_ATTEMPTS,
  ): Promise<AttendanceAlertEvaluationQueueItem | null> {
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
            SELECT TOP (1) id
            FROM attendance_alert_evaluation_queue WITH (UPDLOCK, READPAST, ROWLOCK)
            WHERE attempt_count < @maxAttempts
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
              COALESCE(next_attempt_at, requested_at) ASC,
              requested_at ASC
          )
          UPDATE q
          SET status = N'PROCESSING',
              lease_owner = @leaseOwner,
              lease_expires_at = DATEADD(SECOND, @leaseSeconds, SYSUTCDATETIME()),
              attempt_count = q.attempt_count + 1,
              updated_at = SYSUTCDATETIME()
          OUTPUT INSERTED.*
          FROM attendance_alert_evaluation_queue q
          INNER JOIN next_row n ON n.id = q.id;
        `);
      await transaction.commit();
      const row = result.recordset[0] as Record<string, unknown> | undefined;
      return row ? mapQueue(row) : null;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async markCompleted(companyId: string, queueId: string, leaseOwner: string): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, queueId)
      .input("leaseOwner", sql.NVarChar(100), leaseOwner)
      .query(`
        DELETE FROM attendance_alert_evaluation_queue
        WHERE id = @id AND company_id = @companyId AND lease_owner = @leaseOwner
      `);
  },

  async markFailed(input: {
    companyId: string;
    queueId: string;
    leaseOwner: string;
    errorCode: string;
    errorMessage: string;
    retryDelayMinutes?: number;
  }): Promise<void> {
    const delay = input.retryDelayMinutes ?? 5;
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.queueId)
      .input("leaseOwner", sql.NVarChar(100), input.leaseOwner)
      .input("errorCode", sql.NVarChar(80), input.errorCode)
      .input("errorMessage", sql.NVarChar(1000), input.errorMessage.slice(0, 1000))
      .input("delayMinutes", sql.Int, delay)
      .query(`
        UPDATE attendance_alert_evaluation_queue
        SET status = N'FAILED',
            lease_owner = NULL,
            lease_expires_at = NULL,
            next_attempt_at = DATEADD(MINUTE, @delayMinutes, SYSUTCDATETIME()),
            last_error_code = @errorCode,
            last_error_message = @errorMessage,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId AND lease_owner = @leaseOwner
      `);
  },
};
