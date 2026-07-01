import sql from "mssql";
import { getPool } from "../database/connection";
import type {
  CompanyMembershipStatus,
  CompanyMembershipSummary,
  CompanyRole,
  UserCompanyMembership,
} from "../types/company";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapMembershipRow = (row: Record<string, unknown>): UserCompanyMembership => ({
  id: String(row.id),
  userId: String(row.user_id),
  companyId: String(row.company_id),
  role: String(row.role) as CompanyRole,
  status: String(row.status) as CompanyMembershipStatus,
  isDefault: Boolean(row.is_default),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const userCompanyMembershipRepository = {
  async listActiveForUser(userId: string): Promise<CompanyMembershipSummary[]> {
    const pool = getPool();
    const result = await pool.request().input("userId", sql.UniqueIdentifier, userId).query(`
      SELECT
        m.company_id,
        c.name AS company_name,
        m.role,
        m.is_default,
        m.status
      FROM user_company_memberships m
      INNER JOIN companies c ON c.id = m.company_id
      WHERE m.user_id = @userId
        AND m.status = 'ACTIVE'
        AND c.status = 'ACTIVE'
      ORDER BY m.is_default DESC, c.name ASC
    `);

    return result.recordset.map((row) => ({
      companyId: String(row.company_id),
      companyName: String(row.company_name),
      role: String(row.role) as CompanyRole,
      isDefault: Boolean(row.is_default),
      status: String(row.status) as CompanyMembershipStatus,
    }));
  },

  async findActiveMembership(
    userId: string,
    companyId: string,
  ): Promise<UserCompanyMembership | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("userId", sql.UniqueIdentifier, userId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT m.*
        FROM user_company_memberships m
        INNER JOIN companies c ON c.id = m.company_id
        WHERE m.user_id = @userId
          AND m.company_id = @companyId
          AND m.status = 'ACTIVE'
          AND c.status = 'ACTIVE'
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapMembershipRow(result.recordset[0] as Record<string, unknown>);
  },

  async create(input: {
    userId: string;
    companyId: string;
    role: CompanyRole;
    isDefault?: boolean;
  }): Promise<UserCompanyMembership> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("userId", sql.UniqueIdentifier, input.userId)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("role", sql.NVarChar(30), input.role)
      .input("isDefault", sql.Bit, input.isDefault ? 1 : 0)
      .query(`
        INSERT INTO user_company_memberships (user_id, company_id, role, status, is_default)
        OUTPUT INSERTED.*
        VALUES (@userId, @companyId, @role, 'ACTIVE', @isDefault)
      `);

    return mapMembershipRow(result.recordset[0] as Record<string, unknown>);
  },
};
