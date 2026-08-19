import sql from "mssql";
import { getPool } from "../database/connection";

const requestFrom = (transaction?: sql.Transaction) =>
  transaction ? new sql.Request(transaction) : getPool().request();

export const twoFactorRecoveryCodeRepository = {
  async replaceAllForUser(
    userId: string,
    codeHashes: string[],
    transaction: sql.Transaction,
  ): Promise<void> {
    await new sql.Request(transaction).input("userId", sql.UniqueIdentifier, userId).query(`
      DELETE FROM user_two_factor_recovery_codes
      WHERE user_id = @userId
    `);

    for (const codeHash of codeHashes) {
      await new sql.Request(transaction)
        .input("userId", sql.UniqueIdentifier, userId)
        .input("codeHash", sql.Char(64), codeHash)
        .query(`
          INSERT INTO user_two_factor_recovery_codes (user_id, code_hash)
          VALUES (@userId, @codeHash)
        `);
    }
  },

  async deleteAllForUser(userId: string, transaction: sql.Transaction): Promise<void> {
    await new sql.Request(transaction).input("userId", sql.UniqueIdentifier, userId).query(`
      DELETE FROM user_two_factor_recovery_codes
      WHERE user_id = @userId
    `);
  },

  async consumeValidByHash(
    userId: string,
    codeHash: string,
    transaction: sql.Transaction,
  ): Promise<boolean> {
    const result = await new sql.Request(transaction)
      .input("userId", sql.UniqueIdentifier, userId)
      .input("codeHash", sql.Char(64), codeHash)
      .query(`
        UPDATE user_two_factor_recovery_codes
        SET consumed_at = SYSUTCDATETIME()
        WHERE user_id = @userId
          AND code_hash = @codeHash
          AND consumed_at IS NULL
      `);
    return (result.rowsAffected[0] ?? 0) === 1;
  },

  async countUnconsumed(userId: string, transaction?: sql.Transaction): Promise<number> {
    const result = await requestFrom(transaction)
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT COUNT(1) AS remaining
        FROM user_two_factor_recovery_codes
        WHERE user_id = @userId
          AND consumed_at IS NULL
      `);
    return Number(result.recordset[0]?.remaining ?? 0);
  },
};
