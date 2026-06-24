import sql from "mssql";
import { getPool } from "../database/connection";
import type { BotSession, BotSessionState } from "../types/twilio.types";
import { ACTIVE_BOT_SESSION_STATES_SQL } from "../utils/bot-session-states";
import { mapBotSessionRow } from "../utils/row-mappers";

const ACTIVE_STATE_SQL = ACTIVE_BOT_SESSION_STATES_SQL;

const withLock = (transaction?: sql.Transaction): string =>
  transaction ? "WITH (UPDLOCK, HOLDLOCK)" : "";

const mapRow = (row: Record<string, unknown> | undefined): BotSession | null =>
  row ? mapBotSessionRow(row) : null;

const isUniqueConstraintError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.message.includes("UX_bot_sessions_active_employee") ||
    error.message.includes("unique index"));

export const botSessionRepository = {
  async findValidActiveByPhone(
    phoneNumber: string,
    transaction?: sql.Transaction,
  ): Promise<BotSession | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request.input("phoneNumber", sql.NVarChar(30), phoneNumber).query(`
      SELECT TOP 1 *
      FROM bot_sessions ${withLock(transaction)}
      WHERE phone_number = @phoneNumber
        AND state IN ${ACTIVE_STATE_SQL}
        AND expires_at > SYSUTCDATETIME()
      ORDER BY created_at DESC
    `);

    return mapRow(result.recordset[0] as Record<string, unknown> | undefined);
  },

  async findStaleActiveByPhone(
    phoneNumber: string,
    transaction?: sql.Transaction,
  ): Promise<BotSession | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request.input("phoneNumber", sql.NVarChar(30), phoneNumber).query(`
      SELECT TOP 1 *
      FROM bot_sessions ${withLock(transaction)}
      WHERE phone_number = @phoneNumber
        AND state IN ${ACTIVE_STATE_SQL}
        AND expires_at <= SYSUTCDATETIME()
      ORDER BY created_at DESC
    `);

    return mapRow(result.recordset[0] as Record<string, unknown> | undefined);
  },

  async findValidActiveById(
    sessionId: string,
    transaction?: sql.Transaction,
  ): Promise<BotSession | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request.input("sessionId", sql.UniqueIdentifier, sessionId).query(`
      SELECT TOP 1 *
      FROM bot_sessions ${withLock(transaction)}
      WHERE id = @sessionId
        AND state IN ${ACTIVE_STATE_SQL}
        AND expires_at > SYSUTCDATETIME()
    `);

    return mapRow(result.recordset[0] as Record<string, unknown> | undefined);
  },

  async findStaleActiveById(
    sessionId: string,
    transaction?: sql.Transaction,
  ): Promise<BotSession | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request.input("sessionId", sql.UniqueIdentifier, sessionId).query(`
      SELECT TOP 1 *
      FROM bot_sessions ${withLock(transaction)}
      WHERE id = @sessionId
        AND state IN ${ACTIVE_STATE_SQL}
        AND expires_at <= SYSUTCDATETIME()
    `);

    return mapRow(result.recordset[0] as Record<string, unknown> | undefined);
  },

  async findLatestByPhone(phoneNumber: string): Promise<BotSession | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("phoneNumber", sql.NVarChar(30), phoneNumber)
      .query(`
        SELECT TOP 1 *
        FROM bot_sessions
        WHERE phone_number = @phoneNumber
        ORDER BY created_at DESC
      `);

    return mapRow(result.recordset[0] as Record<string, unknown> | undefined);
  },

  async expireSessionById(sessionId: string, transaction?: sql.Transaction): Promise<boolean> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request.input("sessionId", sql.UniqueIdentifier, sessionId).query(`
      UPDATE bot_sessions
      SET state = 'EXPIRED', updated_at = SYSUTCDATETIME()
      WHERE id = @sessionId
        AND state IN ${ACTIVE_STATE_SQL}
    `);

    return Number(result.rowsAffected[0] ?? 0) > 0;
  },

  async expireStaleSessionsForParticipant(
    employeeId: string,
    phoneNumber: string,
    transaction?: sql.Transaction,
  ): Promise<number> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("phoneNumber", sql.NVarChar(30), phoneNumber)
      .query(`
        UPDATE bot_sessions
        SET state = 'EXPIRED', updated_at = SYSUTCDATETIME()
        WHERE state IN ${ACTIVE_STATE_SQL}
          AND expires_at <= SYSUTCDATETIME()
          AND (employee_id = @employeeId OR phone_number = @phoneNumber)
      `);

    return Number(result.rowsAffected[0] ?? 0);
  },

  async cancelValidActiveSessions(
    employeeId: string,
    phoneNumber: string,
    transaction?: sql.Transaction,
  ): Promise<number> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("phoneNumber", sql.NVarChar(30), phoneNumber)
      .query(`
        UPDATE bot_sessions
        SET state = 'CANCELLED', updated_at = SYSUTCDATETIME()
        WHERE state IN ${ACTIVE_STATE_SQL}
          AND expires_at > SYSUTCDATETIME()
          AND (employee_id = @employeeId OR phone_number = @phoneNumber)
      `);

    return Number(result.rowsAffected[0] ?? 0);
  },

  async create(
    input: {
      employeeId: string;
      inventoryId: string | null;
      phoneNumber: string;
      state: BotSessionState;
      contextJson: string | null;
      expiresAt: Date;
    },
    transaction?: sql.Transaction,
  ): Promise<BotSession> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("inventoryId", sql.UniqueIdentifier, input.inventoryId)
      .input("phoneNumber", sql.NVarChar(30), input.phoneNumber)
      .input("state", sql.NVarChar(40), input.state)
      .input("contextJson", sql.NVarChar(sql.MAX), input.contextJson)
      .input("expiresAt", sql.DateTime2, input.expiresAt)
      .query(`
        INSERT INTO bot_sessions (
          employee_id, inventory_id, phone_number, state, context_json, expires_at
        )
        OUTPUT INSERTED.*
        VALUES (
          @employeeId, @inventoryId, @phoneNumber, @state, @contextJson, @expiresAt
        )
      `);

    return mapBotSessionRow(result.recordset[0] as Record<string, unknown>);
  },

  async updateSession(
    id: string,
    input: {
      inventoryId?: string | null;
      state?: BotSessionState;
      contextJson?: string | null;
      expiresAt?: Date;
    },
    transaction?: sql.Transaction,
  ): Promise<BotSession | null> {
    const fields: string[] = [];
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    request.input("id", sql.UniqueIdentifier, id);

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
      input.state === "WAITING_CHECKOUT_INVENTORY_SELECTION"
        ? `AND state IN ${ACTIVE_STATE_SQL}`
        : "";

    const result = await request.query(`
      UPDATE bot_sessions
      SET ${fields.join(", ")}
      OUTPUT INSERTED.*
      WHERE id = @id
        ${activeStateGuard}
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapBotSessionRow(result.recordset[0] as Record<string, unknown>);
  },

  isUniqueConstraintError,
};
