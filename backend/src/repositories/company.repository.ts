import sql from "mssql";
import { getPool } from "../database/connection";
import type { Company, CompanyStatus } from "../types/company";

export type PlatformCompanyOwnerStatus = "ACTIVE" | "INVITED" | "NONE";

export interface PlatformCompanyListItem extends Company {
  ownerName: string | null;
  ownerEmail: string | null;
  ownerStatus: PlatformCompanyOwnerStatus;
}

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapCompanyRow = (row: Record<string, unknown>): Company => ({
  id: String(row.id),
  name: String(row.name),
  legalName: row.legal_name ? String(row.legal_name) : null,
  taxId: row.tax_id ? String(row.tax_id) : null,
  country: row.country ? String(row.country) : null,
  defaultTimezone: String(row.default_timezone),
  status: String(row.status) as CompanyStatus,
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const companyRepository = {
  async findById(id: string, transaction?: sql.Transaction): Promise<Company | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("id", sql.UniqueIdentifier, id)
      .query("SELECT * FROM companies WHERE id = @id");

    if (!result.recordset[0]) {
      return null;
    }

    return mapCompanyRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByName(name: string): Promise<Company | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("name", sql.NVarChar(200), name)
      .query("SELECT TOP 1 * FROM companies WHERE name = @name");

    if (!result.recordset[0]) {
      return null;
    }

    return mapCompanyRow(result.recordset[0] as Record<string, unknown>);
  },

  async listActive(): Promise<Company[]> {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT * FROM companies WHERE status = 'ACTIVE' ORDER BY name ASC
    `);

    return result.recordset.map((row) => mapCompanyRow(row as Record<string, unknown>));
  },

  async listActiveWithOwner(): Promise<PlatformCompanyListItem[]> {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT
        c.*,
        owner_user.name AS owner_name,
        owner_user.email AS owner_email,
        pending.invitee_name AS pending_owner_name,
        pending.email_normalized AS pending_owner_email
      FROM companies c
      OUTER APPLY (
        SELECT TOP 1 u.name, u.email
        FROM user_company_memberships m
        INNER JOIN users u ON u.id = m.user_id
        WHERE m.company_id = c.id
          AND m.role = 'OWNER'
          AND m.status = 'ACTIVE'
        ORDER BY m.created_at ASC
      ) owner_user
      OUTER APPLY (
        SELECT TOP 1 i.invitee_name, i.email_normalized
        FROM user_invitations i
        WHERE i.company_id = c.id
          AND i.role = 'OWNER'
          AND i.status = 'PENDING'
        ORDER BY i.created_at DESC
      ) pending
      WHERE c.status = 'ACTIVE'
      ORDER BY c.name ASC
    `);

    return result.recordset.map((row) => {
      const base = mapCompanyRow(row as Record<string, unknown>);
      const activeName = row.owner_name == null ? null : String(row.owner_name);
      const activeEmail = row.owner_email == null ? null : String(row.owner_email);
      const pendingName = row.pending_owner_name == null ? null : String(row.pending_owner_name);
      const pendingEmail =
        row.pending_owner_email == null ? null : String(row.pending_owner_email);

      if (activeEmail) {
        return {
          ...base,
          ownerName: activeName,
          ownerEmail: activeEmail,
          ownerStatus: "ACTIVE" as const,
        };
      }

      if (pendingEmail) {
        return {
          ...base,
          ownerName: pendingName,
          ownerEmail: pendingEmail,
          ownerStatus: "INVITED" as const,
        };
      }

      return {
        ...base,
        ownerName: null,
        ownerEmail: null,
        ownerStatus: "NONE" as const,
      };
    });
  },

  async create(
    input: {
      name: string;
      defaultTimezone: string;
      status?: CompanyStatus;
    },
    transaction?: sql.Transaction,
  ): Promise<Company> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("name", sql.NVarChar(200), input.name.trim())
      .input("defaultTimezone", sql.NVarChar(80), input.defaultTimezone)
      .input("status", sql.NVarChar(30), input.status ?? "ACTIVE")
      .query(`
        INSERT INTO companies (name, default_timezone, status)
        OUTPUT INSERTED.*
        VALUES (@name, @defaultTimezone, @status)
      `);

    return mapCompanyRow(result.recordset[0] as Record<string, unknown>);
  },
};
