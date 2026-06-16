import sql from "mssql";
import { getPool } from "../database/connection";
import type { PublicUser, User } from "../types/auth";
import { mapUserRow } from "../utils/row-mappers";

export const userRepository = {
  async create(input: {
    name: string;
    email: string;
    passwordHash: string;
    role?: "ADMIN";
  }): Promise<User> {
    const pool = getPool();
    const result = await pool
      .request()
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

  async findByEmail(email: string): Promise<User | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("email", sql.NVarChar(255), email)
      .query("SELECT * FROM users WHERE email = @email");

    if (!result.recordset[0]) {
      return null;
    }

    return mapUserRow(result.recordset[0] as Record<string, unknown>);
  },

  async findById(id: string): Promise<User | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query("SELECT * FROM users WHERE id = @id");

    if (!result.recordset[0]) {
      return null;
    }

    return mapUserRow(result.recordset[0] as Record<string, unknown>);
  },

  async updateLastLogin(id: string): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        UPDATE users
        SET last_login_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
  },
};

export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
});
