import sql from "mssql";
import { getPool } from "../database/connection";
import type { BotSession, BotSessionState } from "../types/twilio.types";
import { ACTIVE_BOT_SESSION_STATES_SQL } from "../utils/bot-session-states";
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
      SET state = 'EXPIRED', updated_at = SYSUTCDATETIME()
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
      SET state = 'EXPIRED', updated_at = SYSUTCDATETIME()
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
      SET state = 'CANCELLED', updated_at = SYSUTCDATETIME()
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
      inventoryId: string | null;
      phoneNumber: string;
      state: BotSessionState;
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
      .input("inventoryId", sql.UniqueIdentifier, input.inventoryId)
      .input("phoneNumber", sql.NVarChar(30), input.phoneNumber)
      .input("state", sql.NVarChar(40), input.state)
      .input("contextJson", sql.NVarChar(sql.MAX), input.contextJson)
      .input("expiresAt", sql.DateTime2, input.expiresAt)
      .input("isSimulation", sql.Bit, createFlags.isSimulation ? 1 : 0)
      .input("simulationSessionId", sql.UniqueIdentifier, createFlags.simulationSessionId)
      .query(`
        INSERT INTO bot_sessions (
          company_id, employee_id, inventory_id, phone_number, state, context_json, expires_at,
          is_simulation, simulation_session_id
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @employeeId, @inventoryId, @phoneNumber, @state, @contextJson, @expiresAt,
          @isSimulation, @simulationSessionId
        )
      `);

    return mapBotSessionRow(result.recordset[0] as Record<string, unknown>);
  },

  async updateSession(
    companyId: string,
    id: string,
    input: {
      inventoryId?: string | null;
      state?: BotSessionState;
      contextJson?: string | null;
      expiresAt?: Date;
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

    if (input.inventoryId !== undefined) {
      request.input("inventoryId", sql.UniqueIdentifier, input.inventoryId);
      fields.push("inventory_id = @inventoryId");
    }

    if (input.state !== undefined) {
      request.input("state", sql.NVarChar(40), input.state);
      fields.push("state = @state");
    }

    if (input.contextJson !== undefined) {
      request.input("contextJson", sql.NVarChar(sql.MAX), input.contextJson);
      fields.push("context_json = @contextJson");
    }

    if (input.expiresAt !== undefined) {
      request.input("expiresAt", sql.DateTime2, input.expiresAt);
      fields.push("expires_at = @expiresAt");
    }

    if (fields.length === 0) {
      return null;
    }

    fields.push("updated_at = SYSUTCDATETIME()");

    const activeStateGuard =
      input.state === "WAITING_LOCATION" ||
      input.state === "WAITING_INVENTORY_SELECTION" ||
      input.state === "WAITING_CHECKOUT_LOCATION" ||
      input.state === "WAITING_CHECKOUT_INVENTORY_SELECTION" ||
      input.state === "WAITING_ABSENCE_TYPE" ||
      input.state === "WAITING_ABSENCE_START_DATE" ||
      input.state === "WAITING_ABSENCE_END_DATE" ||
      input.state === "WAITING_ABSENCE_REASON" ||
      input.state === "WAITING_ABSENCE_CONFIRMATION"
        ? `AND state IN ${ACTIVE_STATE_SQL}`
        : "";

    const result = await request.query(`
      UPDATE bot_sessions
      SET ${fields.join(", ")}
      OUTPUT INSERTED.*
      WHERE id = @id
        AND company_id = @companyId
        ${activeStateGuard}
        ${scopeSql}
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapBotSessionRow(result.recordset[0] as Record<string, unknown>);
  },

  isUniqueConstraintError,
};
