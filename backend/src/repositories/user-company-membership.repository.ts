import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import type {
  CompanyMembershipStatus,
  CompanyMembershipSummary,
  CompanyRole,
  UserCompanyMembership,
} from "../types/company";

const wouldRemoveActiveOwner = (
  existing: UserCompanyMembership,
  patch: {
    role?: CompanyRole;
    status?: CompanyMembershipStatus;
  },
): boolean => {
  if (existing.role !== "OWNER" || existing.status !== "ACTIVE") {
    return false;
  }
  const deactivating = patch.status === "INACTIVE";
  const demoting = patch.role !== undefined && patch.role !== "OWNER";
  return deactivating || demoting;
};

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

  async create(
    input: {
      userId: string;
      companyId: string;
      role: CompanyRole;
      status?: CompanyMembershipStatus;
      isDefault?: boolean;
    },
    transaction?: sql.Transaction,
  ): Promise<UserCompanyMembership> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("userId", sql.UniqueIdentifier, input.userId)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("role", sql.NVarChar(30), input.role)
      .input("status", sql.NVarChar(20), input.status ?? "ACTIVE")
      .input("isDefault", sql.Bit, input.isDefault ? 1 : 0)
      .query(`
        INSERT INTO user_company_memberships (user_id, company_id, role, status, is_default)
        OUTPUT INSERTED.*
        VALUES (@userId, @companyId, @role, @status, @isDefault)
      `);

    return mapMembershipRow(result.recordset[0] as Record<string, unknown>);
  },

  async findMembership(
    userId: string,
    companyId: string,
    transaction?: sql.Transaction,
  ): Promise<UserCompanyMembership | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("userId", sql.UniqueIdentifier, userId)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT m.*
        FROM user_company_memberships m
        WHERE m.user_id = @userId
          AND m.company_id = @companyId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapMembershipRow(result.recordset[0] as Record<string, unknown>);
  },

  async listByCompany(
    companyId: string,
    query: {
      page: number;
      limit: number;
      search?: string;
      role?: CompanyRole;
      status?: CompanyMembershipStatus;
    },
  ): Promise<{ items: Record<string, unknown>[]; total: number }> {
    const pool = getPool();
    const offset = (query.page - 1) * query.limit;
    const request = pool.request().input("companyId", sql.UniqueIdentifier, companyId);

    const filters = ["m.company_id = @companyId"];

    if (query.role) {
      request.input("role", sql.NVarChar(30), query.role);
      filters.push("m.role = @role");
    }

    if (query.status) {
      request.input("status", sql.NVarChar(20), query.status);
      filters.push("m.status = @status");
    }

    if (query.search) {
      request.input("search", sql.NVarChar(255), `%${query.search}%`);
      filters.push("(u.name LIKE @search OR u.email LIKE @search)");
    }

    const whereClause = `WHERE ${filters.join(" AND ")}`;

    const countResult = await request.query(`
      SELECT COUNT(*) AS total
      FROM user_company_memberships m
      INNER JOIN users u ON u.id = m.user_id
      ${whereClause}
    `);
    const total = Number(countResult.recordset[0].total);

    const dataRequest = pool.request().input("companyId", sql.UniqueIdentifier, companyId);
    if (query.role) {
      dataRequest.input("role", sql.NVarChar(30), query.role);
    }
    if (query.status) {
      dataRequest.input("status", sql.NVarChar(20), query.status);
    }
    if (query.search) {
      dataRequest.input("search", sql.NVarChar(255), `%${query.search}%`);
    }
    dataRequest.input("offset", sql.Int, offset);
    dataRequest.input("limit", sql.Int, query.limit);

    const dataResult = await dataRequest.query(`
      SELECT
        u.id AS user_id,
        u.name,
        u.email,
        u.phone_number,
        u.role AS global_role,
        u.is_platform_admin,
        u.last_login_at,
        m.id AS membership_id,
        m.company_id,
        m.role AS company_role,
        m.status AS membership_status,
        m.is_default,
        m.created_at,
        m.updated_at
      FROM user_company_memberships m
      INNER JOIN users u ON u.id = m.user_id
      ${whereClause}
      ORDER BY u.name ASC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return {
      items: dataResult.recordset as Record<string, unknown>[],
      total,
    };
  },

  async updateMembership(
    companyId: string,
    userId: string,
    patch: {
      role?: CompanyRole;
      status?: CompanyMembershipStatus;
      isDefault?: boolean;
    },
    transaction?: sql.Transaction,
  ): Promise<UserCompanyMembership | null> {
    const fields: string[] = [];
    const request = (transaction ? new sql.Request(transaction) : getPool().request())
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("userId", sql.UniqueIdentifier, userId);

    if (patch.role !== undefined) {
      request.input("role", sql.NVarChar(30), patch.role);
      fields.push("role = @role");
    }

    if (patch.status !== undefined) {
      request.input("status", sql.NVarChar(20), patch.status);
      fields.push("status = @status");
    }

    if (patch.isDefault !== undefined) {
      request.input("isDefault", sql.Bit, patch.isDefault ? 1 : 0);
      fields.push("is_default = @isDefault");
    }

    if (fields.length === 0) {
      return this.findMembership(userId, companyId, transaction);
    }

    fields.push("updated_at = SYSUTCDATETIME()");

    const result = await request.query(`
      UPDATE user_company_memberships
      SET ${fields.join(", ")}
      OUTPUT INSERTED.*
      WHERE user_id = @userId
        AND company_id = @companyId
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapMembershipRow(result.recordset[0] as Record<string, unknown>);
  },

  async clearDefaultForUser(
    userId: string,
    exceptCompanyId?: string,
    transaction?: sql.Transaction,
  ): Promise<void> {
    const request = (transaction ? new sql.Request(transaction) : getPool().request()).input(
      "userId",
      sql.UniqueIdentifier,
      userId,
    );

    if (exceptCompanyId) {
      request.input("exceptCompanyId", sql.UniqueIdentifier, exceptCompanyId);
      await request.query(`
        UPDATE user_company_memberships
        SET is_default = 0, updated_at = SYSUTCDATETIME()
        WHERE user_id = @userId
          AND company_id <> @exceptCompanyId
          AND is_default = 1
      `);
      return;
    }

    await request.query(`
      UPDATE user_company_memberships
      SET is_default = 0, updated_at = SYSUTCDATETIME()
      WHERE user_id = @userId
        AND is_default = 1
    `);
  },

  async findCompanyUserRow(
    companyId: string,
    userId: string,
    transaction?: sql.Transaction,
  ): Promise<Record<string, unknown> | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT
          u.id AS user_id,
          u.name,
          u.email,
          u.phone_number,
          u.role AS global_role,
          u.is_platform_admin,
          u.last_login_at,
          m.id AS membership_id,
          m.company_id,
          m.role AS company_role,
          m.status AS membership_status,
          m.is_default,
          m.created_at,
          m.updated_at
        FROM user_company_memberships m
        INNER JOIN users u ON u.id = m.user_id
        WHERE m.company_id = @companyId
          AND m.user_id = @userId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return result.recordset[0] as Record<string, unknown>;
  },

  async countActiveOwners(
    companyId: string,
    transaction?: sql.Transaction,
  ): Promise<number> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request.input("companyId", sql.UniqueIdentifier, companyId).query(`
        SELECT COUNT(*) AS total
        FROM user_company_memberships
        WHERE company_id = @companyId
          AND role = 'OWNER'
          AND status = 'ACTIVE'
      `);

    return Number(result.recordset[0].total);
  },

  /**
   * Serializes last-OWNER protection and membership writes in one transaction.
   * Locks active OWNER rows for the company, then the target membership.
   */
  async applyMembershipUpdateWithGuards(
    companyId: string,
    userId: string,
    patch: {
      role?: CompanyRole;
      status?: CompanyMembershipStatus;
      isDefault?: boolean;
    },
    validateLockedMembership: (existing: UserCompanyMembership) => void,
    beforeCommit?: (input: {
      transaction: sql.Transaction;
      previous: UserCompanyMembership;
      updated: UserCompanyMembership;
      row: Record<string, unknown>;
    }) => Promise<void>,
  ): Promise<{
    previous: UserCompanyMembership;
    updated: UserCompanyMembership;
    row: Record<string, unknown>;
  }> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Serialize concurrent OWNER demotions/deactivations for this company.
      await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          SELECT id
          FROM user_company_memberships WITH (UPDLOCK, HOLDLOCK)
          WHERE company_id = @companyId
            AND role = 'OWNER'
            AND status = 'ACTIVE'
        `);

      const existingResult = await new sql.Request(transaction)
        .input("userId", sql.UniqueIdentifier, userId)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          SELECT m.*
          FROM user_company_memberships m WITH (UPDLOCK, HOLDLOCK)
          WHERE m.user_id = @userId
            AND m.company_id = @companyId
        `);

      if (!existingResult.recordset[0]) {
        throw new AppError(404, "COMPANY_USER_NOT_FOUND", "Usuario de empresa no encontrado.");
      }

      const existing = mapMembershipRow(existingResult.recordset[0] as Record<string, unknown>);
      validateLockedMembership(existing);

      if (wouldRemoveActiveOwner(existing, patch)) {
        const ownerCount = await this.countActiveOwners(companyId, transaction);
        if (ownerCount <= 1) {
          throw new AppError(
            409,
            "LAST_OWNER_PROTECTED",
            "No se puede quitar o degradar al último dueño activo de la empresa.",
          );
        }
      }

      const updated = await this.updateMembership(companyId, userId, patch, transaction);
      if (!updated) {
        throw new AppError(404, "COMPANY_USER_NOT_FOUND", "Usuario de empresa no encontrado.");
      }

      if (patch.isDefault) {
        await this.clearDefaultForUser(userId, companyId, transaction);
      }

      const row = await this.findCompanyUserRow(companyId, userId, transaction);
      if (!row) {
        throw new AppError(
          500,
          "COMPANY_USER_LOAD_FAILED",
          "No se pudo cargar el usuario actualizado.",
        );
      }

      if (beforeCommit) {
        await beforeCommit({ transaction, previous: existing, updated, row });
      }

      await transaction.commit();
      return { previous: existing, updated, row };
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // Transaction may already be aborted.
      }
      throw error;
    }
  },

  async userHasDefaultMembership(
    userId: string,
    transaction?: sql.Transaction,
  ): Promise<boolean> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request.input("userId", sql.UniqueIdentifier, userId).query(`
        SELECT TOP 1 1 AS found
        FROM user_company_memberships
        WHERE user_id = @userId
          AND is_default = 1
      `);

    return Boolean(result.recordset[0]);
  },
};
