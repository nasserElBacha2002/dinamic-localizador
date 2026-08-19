import sql from "mssql";
import { getPool } from "../database/connection";
import type { PublicUser, User } from "../types/auth";
import { mapUserRow } from "../utils/row-mappers";

const requestFrom = (transaction?: sql.Transaction) =>
  transaction ? new sql.Request(transaction) : getPool().request();

export const userRepository = {
  async create(
    input: {
      name: string;
      email: string;
      passwordHash: string;
      role?: "ADMIN";
    },
    transaction?: sql.Transaction,
  ): Promise<User> {
    const result = await requestFrom(transaction)
      .input("name", sql.NVarChar(150), input.name)
      .input("email", sql.NVarChar(255), input.email)
      .input("passwordHash", sql.NVarChar(255), input.passwordHash)
      .input("role", sql.NVarChar(30), input.role ?? "ADMIN")
      .query(`
        INSERT INTO users (name, email, password_hash, role)
        OUTPUT INSERTED.*
        VALUES (@name, @email, @passwordHash, @role)
      `);

    return mapUserRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByEmail(email: string, transaction?: sql.Transaction): Promise<User | null> {
    const result = await requestFrom(transaction)
      .input("email", sql.NVarChar(255), email)
      .query("SELECT * FROM users WHERE email = @email");

    if (!result.recordset[0]) {
      return null;
    }

    return mapUserRow(result.recordset[0] as Record<string, unknown>);
  },

  async findById(id: string, transaction?: sql.Transaction): Promise<User | null> {
    const result = await requestFrom(transaction)
      .input("id", sql.UniqueIdentifier, id)
      .query("SELECT * FROM users WHERE id = @id");

    if (!result.recordset[0]) {
      return null;
    }

    return mapUserRow(result.recordset[0] as Record<string, unknown>);
  },

  async lockByIdForUpdate(id: string, transaction: sql.Transaction): Promise<User | null> {
    const result = await new sql.Request(transaction)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        SELECT *
        FROM users WITH (UPDLOCK, ROWLOCK)
        WHERE id = @id
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapUserRow(result.recordset[0] as Record<string, unknown>);
  },

  async updateLastLogin(id: string, transaction?: sql.Transaction): Promise<void> {
    await requestFrom(transaction)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        UPDATE users
        SET last_login_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
  },

  async updatePasswordAndBumpTokenVersion(
    id: string,
    passwordHash: string,
    transaction?: sql.Transaction,
  ): Promise<number> {
    const result = await requestFrom(transaction)
      .input("id", sql.UniqueIdentifier, id)
      .input("passwordHash", sql.NVarChar(255), passwordHash)
      .query(`
        UPDATE users
        SET password_hash = @passwordHash,
            token_version = token_version + 1,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.token_version
        WHERE id = @id
      `);

    const nextVersion = Number(result.recordset[0]?.token_version);
    if (!Number.isInteger(nextVersion)) {
      throw new Error("Failed to bump user token_version");
    }
    return nextVersion;
  },

  async savePendingTwoFactorSecret(
    id: string,
    encryptedSecret: string,
    transaction?: sql.Transaction,
  ): Promise<boolean> {
    const result = await requestFrom(transaction)
      .input("id", sql.UniqueIdentifier, id)
      .input("secret", sql.NVarChar(512), encryptedSecret)
      .query(`
        UPDATE users
        SET two_factor_secret_encrypted = @secret,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND two_factor_enabled = 0
      `);
    return (result.rowsAffected[0] ?? 0) === 1;
  },

  async enableTwoFactor(
    id: string,
    usedTotpStep: number,
    transaction: sql.Transaction,
  ): Promise<number> {
    const result = await new sql.Request(transaction)
      .input("id", sql.UniqueIdentifier, id)
      .input("usedStep", sql.BigInt, usedTotpStep)
      .query(`
        UPDATE users
        SET two_factor_enabled = 1,
            two_factor_confirmed_at = SYSUTCDATETIME(),
            two_factor_last_used_step = @usedStep,
            token_version = token_version + 1,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.token_version
        WHERE id = @id
          AND two_factor_enabled = 0
          AND two_factor_secret_encrypted IS NOT NULL
      `);
    const nextVersion = Number(result.recordset[0]?.token_version);
    if (!Number.isInteger(nextVersion)) {
      throw new Error("Failed to enable two-factor authentication");
    }
    return nextVersion;
  },

  async disableTwoFactor(id: string, transaction: sql.Transaction): Promise<number> {
    const result = await new sql.Request(transaction)
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        UPDATE users
        SET two_factor_enabled = 0,
            two_factor_secret_encrypted = NULL,
            two_factor_confirmed_at = NULL,
            two_factor_last_used_step = NULL,
            token_version = token_version + 1,
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.token_version
        WHERE id = @id
          AND two_factor_enabled = 1
      `);
    const nextVersion = Number(result.recordset[0]?.token_version);
    if (!Number.isInteger(nextVersion)) {
      throw new Error("Failed to disable two-factor authentication");
    }
    return nextVersion;
  },

  async markTotpStepUsed(
    id: string,
    lastUsedStep: number,
    expectedPrevious: number | null,
    transaction: sql.Transaction,
  ): Promise<boolean> {
    const request = new sql.Request(transaction)
      .input("id", sql.UniqueIdentifier, id)
      .input("lastUsedStep", sql.BigInt, lastUsedStep);
    if (expectedPrevious === null) {
      const result = await request.query(`
        UPDATE users
        SET two_factor_last_used_step = @lastUsedStep,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
          AND two_factor_last_used_step IS NULL
      `);
      return (result.rowsAffected[0] ?? 0) === 1;
    }
    const result = await request.input("expectedPrevious", sql.BigInt, expectedPrevious).query(`
      UPDATE users
      SET two_factor_last_used_step = @lastUsedStep,
          updated_at = SYSUTCDATETIME()
      WHERE id = @id
        AND two_factor_last_used_step = @expectedPrevious
    `);
    return (result.rowsAffected[0] ?? 0) === 1;
  },

  /** Alias: password hash updates always bump token_version in the same statement. */
  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.updatePasswordAndBumpTokenVersion(id, passwordHash);
  },
};

export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  isPlatformAdmin: user.isPlatformAdmin,
});
