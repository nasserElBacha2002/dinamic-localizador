import sql from "mssql";
import { getPool } from "../database/connection";

const requestFrom = (transaction?: sql.Transaction) =>
  transaction ? new sql.Request(transaction) : getPool().request();

export const twoFactorChallengeRepository = {
  async insert(
    input: { id?: string; userId: string; tokenHash: string; expiresAt: Date },
    transaction?: sql.Transaction,
  ): Promise<{ id: string }> {
    const request = requestFrom(transaction)
      .input("userId", sql.UniqueIdentifier, input.userId)
      .input("tokenHash", sql.Char(64), input.tokenHash)
      .input("expiresAt", sql.DateTime2, input.expiresAt);
    if (input.id) {
      const result = await request.input("id", sql.UniqueIdentifier, input.id).query(`
        INSERT INTO user_two_factor_login_challenges (id, user_id, token_hash, expires_at)
        OUTPUT INSERTED.id
        VALUES (@id, @userId, @tokenHash, @expiresAt)
      `);
      return { id: String(result.recordset[0].id) };
    }
    const result = await request.query(`
      INSERT INTO user_two_factor_login_challenges (user_id, token_hash, expires_at)
      OUTPUT INSERTED.id
      VALUES (@userId, @tokenHash, @expiresAt)
    `);
    return { id: String(result.recordset[0].id) };
  },

  async consumeValidByHash(
    tokenHash: string,
    userId: string,
    transaction: sql.Transaction,
  ): Promise<boolean> {
    const result = await new sql.Request(transaction)
      .input("tokenHash", sql.Char(64), tokenHash)
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        UPDATE user_two_factor_login_challenges
        SET consumed_at = SYSUTCDATETIME()
        WHERE token_hash = @tokenHash
          AND user_id = @userId
          AND consumed_at IS NULL
          AND expires_at > SYSUTCDATETIME()
      `);
    return (result.rowsAffected[0] ?? 0) === 1;
  },

  async deleteStaleForUser(userId: string, transaction?: sql.Transaction): Promise<number> {
    const result = await requestFrom(transaction)
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        DELETE TOP (200)
        FROM user_two_factor_login_challenges
        WHERE user_id = @userId
          AND (
            expires_at <= SYSUTCDATETIME()
            OR (
              consumed_at IS NOT NULL
              AND consumed_at <= DATEADD(HOUR, -24, SYSUTCDATETIME())
            )
          )
      `);
    return result.rowsAffected[0] ?? 0;
  },

  async deleteAllForUser(userId: string, transaction: sql.Transaction): Promise<void> {
    await new sql.Request(transaction)
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        DELETE FROM user_two_factor_login_challenges
        WHERE user_id = @userId
      `);
  },
};
