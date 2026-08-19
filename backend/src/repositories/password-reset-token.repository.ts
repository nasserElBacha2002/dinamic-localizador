import sql from "mssql";
import { getPool } from "../database/connection";
import type { PasswordResetToken } from "../types/password-reset";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapRow = (row: Record<string, unknown>): PasswordResetToken => ({
  id: String(row.id),
  userId: String(row.user_id),
  tokenHash: String(row.token_hash).trim(),
  expiresAt: toIsoString(row.expires_at as Date | string),
  consumedAt: row.consumed_at ? toIsoString(row.consumed_at as Date | string) : null,
  createdAt: toIsoString(row.created_at as Date | string),
});

const requestFrom = (transaction?: sql.Transaction) =>
  transaction ? new sql.Request(transaction) : getPool().request();

export const passwordResetTokenRepository = {
  async insert(
    input: {
      userId: string;
      tokenHash: string;
      expiresAt: Date;
    },
    transaction?: sql.Transaction,
  ): Promise<PasswordResetToken> {
    const result = await requestFrom(transaction)
      .input("userId", sql.UniqueIdentifier, input.userId)
      .input("tokenHash", sql.Char(64), input.tokenHash)
      .input("expiresAt", sql.DateTime2, input.expiresAt)
      .query(`
        INSERT INTO user_password_reset_tokens (user_id, token_hash, expires_at)
        OUTPUT INSERTED.*
        VALUES (@userId, @tokenHash, @expiresAt)
      `);

    return mapRow(result.recordset[0] as Record<string, unknown>);
  },

  async consumeAllUnconsumedForUser(
    userId: string,
    transaction?: sql.Transaction,
  ): Promise<number> {
    const result = await requestFrom(transaction)
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        UPDATE user_password_reset_tokens
        SET consumed_at = SYSUTCDATETIME()
        WHERE user_id = @userId
          AND consumed_at IS NULL
      `);

    return result.rowsAffected[0] ?? 0;
  },

  async consumeById(id: string, transaction?: sql.Transaction): Promise<void> {
    await requestFrom(transaction)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        UPDATE user_password_reset_tokens
        SET consumed_at = SYSUTCDATETIME()
        WHERE id = @id
          AND consumed_at IS NULL
      `);
  },

  async findValidUnconsumedByHash(
    tokenHash: string,
    transaction: sql.Transaction,
  ): Promise<PasswordResetToken | null> {
    const result = await new sql.Request(transaction)
      .input("tokenHash", sql.Char(64), tokenHash)
      .query(`
        SELECT TOP 1 *
        FROM user_password_reset_tokens
        WHERE token_hash = @tokenHash
          AND consumed_at IS NULL
          AND expires_at > SYSUTCDATETIME()
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapRow(result.recordset[0] as Record<string, unknown>);
  },

  /**
   * CAS consume: succeeds only for an unconsumed, unexpired hash.
   * Returns the consumed row or null if another request won / token invalid.
   */
  async consumeValidByHash(
    tokenHash: string,
    userId: string,
    transaction: sql.Transaction,
  ): Promise<PasswordResetToken | null> {
    const result = await new sql.Request(transaction)
      .input("tokenHash", sql.Char(64), tokenHash)
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        UPDATE user_password_reset_tokens
        SET consumed_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE token_hash = @tokenHash
          AND user_id = @userId
          AND consumed_at IS NULL
          AND expires_at > SYSUTCDATETIME()
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const result = await getPool()
      .request()
      .input("tokenHash", sql.Char(64), tokenHash)
      .query(`
        SELECT TOP 1 *
        FROM user_password_reset_tokens
        WHERE token_hash = @tokenHash
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapRow(result.recordset[0] as Record<string, unknown>);
  },
};
