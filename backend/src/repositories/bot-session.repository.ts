import sql from "mssql";
import { getPool } from "../database/connection";
import type { BotSession, BotSessionState } from "../types/twilio.types";
import {
  ACTIVE_BOT_SESSION_STATES_SQL,
} from "../utils/bot-session-states";
import {
  applyBotSessionScope,
  getBotSessionCreateFlags,
  resolveBotSessionScope,
  type BotSessionScope,
} from "../utils/bot-session-scope";
import { mapBotSessionRow } from "../utils/row-mappers";

const ACTIVE_STATE_SQL = ACTIVE_BOT_SESSION_STATES_SQL;

const withLock = (transaction?: sql.Transaction): string =>
  transaction ? "WITH (UPDLOCK, HOLDLOCK)" : "";

const mapRow = (row: Record<string, unknown> | undefined): BotSession | null =>
  row ? mapBotSessionRow(row) : null;

const isUniqueConstraintError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.message.includes("UX_bot_sessions_active_employee") ||
    error.message.includes("UX_bot_sessions_active_simulation") ||
    error.message.includes("unique index"));

export type RecordFailedAttemptPersistenceResult =
  | { kind: "applied"; session: BotSession }
  | { kind: "idempotent_replay"; session: BotSession }
  | { kind: "cas_conflict"; session: BotSession }
  | { kind: "missing" };

export const botSessionRepository = {
  async findValidActiveByPhone(
    companyId: string,
    phoneNumber: string,
    transaction?: sql.Transaction,
    scope?: BotSessionScope,
  ): Promise<BotSession | null> {
    const resolvedScope = resolveBotSessionScope(scope);
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    request.input("companyId", sql.UniqueIdentifier, companyId);
    request.input("phoneNumber", sql.NVarChar(30), phoneNumber);
    const scopeSql = applyBotSessionScope(request, resolvedScope);
    const result = await request.query(`
      SELECT TOP 1 *
      FROM bot_sessions ${withLock(transaction)}
      WHERE phone_number = @phoneNumber
        AND company_id = @companyId
        AND state IN ${ACTIVE_STATE_SQL}
        AND expires_at > SYSUTCDATETIME()
        ${scopeSql}
      ORDER BY created_at DESC
    `);

    return mapRow(result.recordset[0] as Record<string, unknown> | undefined);
  },

  /**
   * Company-resolution only. Must not be used after WhatsApp company context is resolved.
   * When multiple active sessions exist for the same phone, returns the most recent one.
   */
  async findLatestValidActiveByPhoneForCompanyResolutionOnly(
    phoneNumber: string,
    scope?: BotSessionScope,
  ): Promise<BotSession | null> {
    const resolvedScope = resolveBotSessionScope(scope);
    const request = getPool().request();
    request.input("phoneNumber", sql.NVarChar(30), phoneNumber);
    const scopeSql = applyBotSessionScope(request, resolvedScope);
    const result = await request.query(`
      SELECT TOP 1 *
      FROM bot_sessions
      WHERE phone_number = @phoneNumber
        AND state IN ${ACTIVE_STATE_SQL}
        AND expires_at > SYSUTCDATETIME()
        ${scopeSql}
      ORDER BY created_at DESC
    `);

    return mapRow(result.recordset[0] as Record<string, unknown> | undefined);
  },

  async findStaleActiveByPhone(
    companyId: string,
    phoneNumber: string,
    transaction?: sql.Transaction,
    scope?: BotSessionScope,
  ): Promise<BotSession | null> {
    const resolvedScope = resolveBotSessionScope(scope);
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    request.input("companyId", sql.UniqueIdentifier, companyId);
    request.input("phoneNumber", sql.NVarChar(30), phoneNumber);
    const scopeSql = applyBotSessionScope(request, resolvedScope);
    const result = await request.query(`
      SELECT TOP 1 *
      FROM bot_sessions ${withLock(transaction)}
      WHERE phone_number = @phoneNumber
        AND company_id = @companyId
        AND state IN ${ACTIVE_STATE_SQL}
        AND expires_at <= SYSUTCDATETIME()
        ${scopeSql}
      ORDER BY created_at DESC
    `);

    return mapRow(result.recordset[0] as Record<string, unknown> | undefined);
  },

  async findValidActiveById(
    companyId: string,
    sessionId: string,
    transaction?: sql.Transaction,
    scope?: BotSessionScope,
  ): Promise<BotSession | null> {
    const resolvedScope = resolveBotSessionScope(scope);
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    request.input("companyId", sql.UniqueIdentifier, companyId);
    request.input("sessionId", sql.UniqueIdentifier, sessionId);
    const scopeSql = applyBotSessionScope(request, resolvedScope);
    const result = await request.query(`
      SELECT TOP 1 *
      FROM bot_sessions ${withLock(transaction)}
      WHERE id = @sessionId
        AND company_id = @companyId
        AND state IN ${ACTIVE_STATE_SQL}
        AND expires_at > SYSUTCDATETIME()
        ${scopeSql}
    `);

    return mapRow(result.recordset[0] as Record<string, unknown> | undefined);
  },

  async findStaleActiveById(
    companyId: string,
    sessionId: string,
    transaction?: sql.Transaction,
    scope?: BotSessionScope,
  ): Promise<BotSession | null> {
    const resolvedScope = resolveBotSessionScope(scope);
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    request.input("companyId", sql.UniqueIdentifier, companyId);
    request.input("sessionId", sql.UniqueIdentifier, sessionId);
    const scopeSql = applyBotSessionScope(request, resolvedScope);
    const result = await request.query(`
      SELECT TOP 1 *
      FROM bot_sessions ${withLock(transaction)}
      WHERE id = @sessionId
        AND company_id = @companyId
        AND state IN ${ACTIVE_STATE_SQL}
        AND expires_at <= SYSUTCDATETIME()
        ${scopeSql}
    `);

    return mapRow(result.recordset[0] as Record<string, unknown> | undefined);
  },

  async findById(
    companyId: string,
    sessionId: string,
    scope?: BotSessionScope,
  ): Promise<BotSession | null> {
    const resolvedScope = resolveBotSessionScope(scope);
    const request = getPool().request();
    request.input("companyId", sql.UniqueIdentifier, companyId);
    request.input("sessionId", sql.UniqueIdentifier, sessionId);
    const scopeSql = applyBotSessionScope(request, resolvedScope);
    const result = await request.query(`
      SELECT TOP 1 *
      FROM bot_sessions
      WHERE id = @sessionId
        AND company_id = @companyId
        ${scopeSql}
    `);
    return mapRow(result.recordset[0] as Record<string, unknown> | undefined);
  },

  async findLatestByPhone(
    companyId: string,
    phoneNumber: string,
    scope?: BotSessionScope,
  ): Promise<BotSession | null> {
    const resolvedScope = resolveBotSessionScope(scope);
    const request = getPool().request();
    request.input("companyId", sql.UniqueIdentifier, companyId);
    request.input("phoneNumber", sql.NVarChar(30), phoneNumber);
    const scopeSql = applyBotSessionScope(request, resolvedScope);
    const result = await request.query(`
      SELECT TOP 1 *
      FROM bot_sessions
      WHERE phone_number = @phoneNumber
        AND company_id = @companyId
        ${scopeSql}
      ORDER BY created_at DESC
    `);

    return mapRow(result.recordset[0] as Record<string, unknown> | undefined);
  },

  async expireSessionById(
    companyId: string,
    sessionId: string,
    transaction?: sql.Transaction,
    scope?: BotSessionScope,
  ): Promise<boolean> {
    const resolvedScope = resolveBotSessionScope(scope);
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    request.input("companyId", sql.UniqueIdentifier, companyId);
    request.input("sessionId", sql.UniqueIdentifier, sessionId);
    const scopeSql = applyBotSessionScope(request, resolvedScope);
    const result = await request.query(`
      UPDATE bot_sessions
      SET state = N'EXPIRED',
          intent = NULL,
          context_json = NULL,
          session_version = session_version + 1,
          updated_at = SYSUTCDATETIME()
      WHERE id = @sessionId
        AND company_id = @companyId
        AND state IN ${ACTIVE_STATE_SQL}
        ${scopeSql}
    `);

    return Number(result.rowsAffected[0] ?? 0) > 0;
  },

  async expireStaleSessionsForParticipant(
    companyId: string,
    employeeId: string,
    phoneNumber: string,
    transaction?: sql.Transaction,
    scope?: BotSessionScope,
  ): Promise<number> {
    const resolvedScope = resolveBotSessionScope(scope);
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("phoneNumber", sql.NVarChar(30), phoneNumber);
    const scopeSql = applyBotSessionScope(request, resolvedScope);
    const result = await request.query(`
      UPDATE bot_sessions
      SET state = N'EXPIRED',
          intent = NULL,
          context_json = NULL,
          session_version = session_version + 1,
          updated_at = SYSUTCDATETIME()
      WHERE company_id = @companyId
        AND state IN ${ACTIVE_STATE_SQL}
        AND expires_at <= SYSUTCDATETIME()
        AND (employee_id = @employeeId OR phone_number = @phoneNumber)
        ${scopeSql}
    `);

    return Number(result.rowsAffected[0] ?? 0);
  },

  async cancelValidActiveSessions(
    companyId: string,
    employeeId: string,
    phoneNumber: string,
    transaction?: sql.Transaction,
    scope?: BotSessionScope,
  ): Promise<number> {
    const resolvedScope = resolveBotSessionScope(scope);
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("phoneNumber", sql.NVarChar(30), phoneNumber);
    const scopeSql = applyBotSessionScope(request, resolvedScope);
    const result = await request.query(`
      UPDATE bot_sessions
      SET state = N'CANCELLED',
          intent = NULL,
          context_json = NULL,
          session_version = session_version + 1,
          updated_at = SYSUTCDATETIME()
      WHERE company_id = @companyId
        AND state IN ${ACTIVE_STATE_SQL}
        AND expires_at > SYSUTCDATETIME()
        AND (employee_id = @employeeId OR phone_number = @phoneNumber)
        ${scopeSql}
    `);

    return Number(result.rowsAffected[0] ?? 0);
  },

  async create(
    input: {
      companyId: string;
      employeeId: string;
      operationId: string | null;
      employeeWorkdayId?: string | null;
      attendanceRecordId?: string | null;
      phoneNumber: string;
      state: BotSessionState;
      intent?: import("../types/twilio.types").BotSessionIntent | null;
      contextJson: string | null;
      expiresAt: Date;
    },
    transaction?: sql.Transaction,
    scope?: BotSessionScope,
  ): Promise<BotSession> {
    const resolvedScope = resolveBotSessionScope(scope);
    const createFlags = getBotSessionCreateFlags(resolvedScope);
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("operationId", sql.UniqueIdentifier, input.operationId)
      .input("employeeWorkdayId", sql.UniqueIdentifier, input.employeeWorkdayId ?? null)
      .input("attendanceRecordId", sql.UniqueIdentifier, input.attendanceRecordId ?? null)
      .input("phoneNumber", sql.NVarChar(30), input.phoneNumber)
      .input("state", sql.NVarChar(40), input.state)
      .input("intent", sql.NVarChar(40), input.intent ?? null)
      .input("contextJson", sql.NVarChar(sql.MAX), input.contextJson)
      .input("expiresAt", sql.DateTime2, input.expiresAt)
      .input("isSimulation", sql.Bit, createFlags.isSimulation ? 1 : 0)
      .input("simulationSessionId", sql.UniqueIdentifier, createFlags.simulationSessionId)
      .query(`
        INSERT INTO bot_sessions (
          company_id, employee_id, operation_id, employee_workday_id, attendance_record_id,
          phone_number, state, intent, context_json, expires_at,
          is_simulation, simulation_session_id
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @employeeId, @operationId, @employeeWorkdayId, @attendanceRecordId,
          @phoneNumber, @state, @intent, @contextJson, @expiresAt,
          @isSimulation, @simulationSessionId
        )
      `);

    return mapBotSessionRow(result.recordset[0] as Record<string, unknown>);
  },

  async updateSession(
    companyId: string,
    id: string,
    input: {
      operationId?: string | null;
      employeeWorkdayId?: string | null;
      attendanceRecordId?: string | null;
      state?: BotSessionState;
      intent?: import("../types/twilio.types").BotSessionIntent | null;
      contextJson?: string | null;
      failedAttempts?: number;
      expiresAt?: Date;
      expectedVersion?: number;
      expectedState?: BotSessionState;
    },
    transaction?: sql.Transaction,
    scope?: BotSessionScope,
  ): Promise<BotSession | null> {
    const resolvedScope = resolveBotSessionScope(scope);
    const fields: string[] = [];
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    request.input("companyId", sql.UniqueIdentifier, companyId);
    request.input("id", sql.UniqueIdentifier, id);
    const scopeSql = applyBotSessionScope(request, resolvedScope);

    if (input.operationId !== undefined) {
      request.input("operationId", sql.UniqueIdentifier, input.operationId);
      fields.push("operation_id = @operationId");
    }

    if (input.employeeWorkdayId !== undefined) {
      request.input("employeeWorkdayId", sql.UniqueIdentifier, input.employeeWorkdayId);
      fields.push("employee_workday_id = @employeeWorkdayId");
    }

    if (input.attendanceRecordId !== undefined) {
      request.input("attendanceRecordId", sql.UniqueIdentifier, input.attendanceRecordId);
      fields.push("attendance_record_id = @attendanceRecordId");
    }

    if (input.state !== undefined) {
      request.input("state", sql.NVarChar(40), input.state);
      fields.push("state = @state");
    }

    const terminalState =
      input.state === "COMPLETED" ||
      input.state === "CANCELLED" ||
      input.state === "EXPIRED";
    if (terminalState) {
      fields.push("intent = NULL", "context_json = NULL");
    } else if (input.intent !== undefined) {
      request.input("intent", sql.NVarChar(40), input.intent);
      fields.push("intent = @intent");
    }

    if (!terminalState && input.contextJson !== undefined) {
      request.input("contextJson", sql.NVarChar(sql.MAX), input.contextJson);
      fields.push("context_json = @contextJson");
    }

    if (input.failedAttempts !== undefined) {
      request.input("failedAttempts", sql.Int, input.failedAttempts);
      fields.push("failed_attempts = @failedAttempts");
    }

    if (input.expiresAt !== undefined) {
      request.input("expiresAt", sql.DateTime2, input.expiresAt);
      fields.push("expires_at = @expiresAt");
    }

    if (fields.length === 0) {
      return null;
    }

    fields.push(
      "session_version = session_version + 1",
      "updated_at = SYSUTCDATETIME()",
    );

    const activeStateGuard =
      input.state ? `AND state IN ${ACTIVE_STATE_SQL}` : "";
    const expectedVersionGuard =
      input.expectedVersion === undefined ? "" : "AND session_version = @expectedVersion";
    const expectedStateGuard =
      input.expectedState === undefined ? "" : "AND state = @expectedState";
    if (input.expectedVersion !== undefined) {
      request.input("expectedVersion", sql.BigInt, input.expectedVersion);
    }
    if (input.expectedState !== undefined) {
      request.input("expectedState", sql.NVarChar(40), input.expectedState);
    }

    const result = await request.query(`
      UPDATE bot_sessions
      SET ${fields.join(", ")}
      OUTPUT INSERTED.*
      WHERE id = @id
        AND company_id = @companyId
        ${activeStateGuard}
        ${expectedVersionGuard}
        ${expectedStateGuard}
        ${scopeSql}
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapBotSessionRow(result.recordset[0] as Record<string, unknown>);
  },

  async recordFailedAttempt(input: {
    companyId: string;
    sessionId: string;
    expectedVersion: number;
    messageSid: string;
    maxFailedAttempts: number;
    expiresAt: Date;
    scope?: BotSessionScope;
  }): Promise<RecordFailedAttemptPersistenceResult> {
    const scope = resolveBotSessionScope(input.scope);
    const request = getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("sessionId", sql.UniqueIdentifier, input.sessionId)
      .input("expectedVersion", sql.BigInt, input.expectedVersion)
      .input("messageSid", sql.NVarChar(100), input.messageSid)
      .input("maxFailedAttempts", sql.Int, input.maxFailedAttempts)
      .input("expiresAt", sql.DateTime2, input.expiresAt);
    const scopeSql = applyBotSessionScope(request, scope);
    const result = await request.query(`
        UPDATE bot_sessions
        SET failed_attempts = failed_attempts + 1,
            state = CASE
              WHEN failed_attempts + 1 >= @maxFailedAttempts THEN N'CANCELLED'
              ELSE state
            END,
            intent = CASE
              WHEN failed_attempts + 1 >= @maxFailedAttempts THEN NULL
              ELSE intent
            END,
            context_json = CASE
              WHEN failed_attempts + 1 >= @maxFailedAttempts THEN NULL
              ELSE context_json
            END,
            expires_at = CASE
              WHEN failed_attempts + 1 >= @maxFailedAttempts THEN expires_at
              ELSE @expiresAt
            END,
            last_message_sid = @messageSid,
            session_version = session_version + 1,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @sessionId
          AND company_id = @companyId
          AND state IN ${ACTIVE_STATE_SQL}
          AND expires_at > SYSUTCDATETIME()
          AND session_version = @expectedVersion
          AND (last_message_sid IS NULL OR last_message_sid <> @messageSid)
          ${scopeSql}
      `);

    const updated = mapRow(result.recordset[0] as Record<string, unknown> | undefined);
    if (updated) {
      return { kind: "applied", session: updated };
    }

    const currentRequest = getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("sessionId", sql.UniqueIdentifier, input.sessionId)
      .input("messageSid", sql.NVarChar(100), input.messageSid);
    const currentScopeSql = applyBotSessionScope(currentRequest, scope);
    const currentResult = await currentRequest.query(`
        SELECT TOP 1 *
        FROM bot_sessions
        WHERE id = @sessionId
          AND company_id = @companyId
          ${currentScopeSql}
      `);
    const current = mapRow(
      currentResult.recordset[0] as Record<string, unknown> | undefined,
    );
    if (!current) {
      return { kind: "missing" };
    }
    return current.lastMessageSid === input.messageSid
      ? { kind: "idempotent_replay", session: current }
      : { kind: "cas_conflict", session: current };
  },

  isUniqueConstraintError,
};
