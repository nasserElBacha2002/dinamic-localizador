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

const optionalIso = (value: unknown): string | null => {
  if (value == null) return null;
  return toIsoString(value as Date | string);
};

const mapCompanyRow = (row: Record<string, unknown>): Company => ({
  id: String(row.id),
  name: String(row.name),
  legalName: row.legal_name ? String(row.legal_name) : null,
  taxId: row.tax_id ? String(row.tax_id) : null,
  country: row.country ? String(row.country) : null,
  defaultTimezone: String(row.default_timezone),
  status: String(row.status) as CompanyStatus,
  deactivatedAt: optionalIso(row.deactivated_at),
  deactivatedByUserId: row.deactivated_by_user_id ? String(row.deactivated_by_user_id) : null,
  deactivationReason: row.deactivation_reason ? String(row.deactivation_reason) : null,
  scheduledDeletionAt: optionalIso(row.scheduled_deletion_at),
  reactivatedAt: optionalIso(row.reactivated_at),
  reactivatedByUserId: row.reactivated_by_user_id ? String(row.reactivated_by_user_id) : null,
  deletionStartedAt: optionalIso(row.deletion_started_at),
  deletedAt: optionalIso(row.deleted_at),
  deletionAttempts: Number(row.deletion_attempts ?? 0),
  deletionLastError: row.deletion_last_error ? String(row.deletion_last_error) : null,
  deletionPurgeStage: row.deletion_purge_stage ? String(row.deletion_purge_stage) : null,
  deletionNextAttemptAt: optionalIso(row.deletion_next_attempt_at),
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

const mapListItem = (row: Record<string, unknown>): PlatformCompanyListItem => {
  const base = mapCompanyRow(row);
  const activeName = row.owner_name == null ? null : String(row.owner_name);
  const activeEmail = row.owner_email == null ? null : String(row.owner_email);
  const pendingName = row.pending_owner_name == null ? null : String(row.pending_owner_name);
  const pendingEmail = row.pending_owner_email == null ? null : String(row.pending_owner_email);

  if (activeEmail) {
    return {
      ...base,
      ownerName: activeName,
      ownerEmail: activeEmail,
      ownerStatus: "ACTIVE",
    };
  }

  if (pendingEmail) {
    return {
      ...base,
      ownerName: pendingName,
      ownerEmail: pendingEmail,
      ownerStatus: "INVITED",
    };
  }

  return {
    ...base,
    ownerName: null,
    ownerEmail: null,
    ownerStatus: "NONE",
  };
};

const OWNER_SELECT = `
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
`;

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
      ${OWNER_SELECT}
      WHERE c.status = 'ACTIVE'
      ORDER BY c.name ASC
    `);

    return result.recordset.map((row) => mapListItem(row as Record<string, unknown>));
  },

  /** Platform admin list: all companies except hard-deleted tombstones. */
  async listForPlatformAdmin(): Promise<PlatformCompanyListItem[]> {
    const pool = getPool();
    const result = await pool.request().query(`
      ${OWNER_SELECT}
      WHERE c.status <> 'DELETED'
      ORDER BY
        CASE c.status
          WHEN 'ACTIVE' THEN 0
          WHEN 'PENDING_DELETION' THEN 1
          WHEN 'DELETION_FAILED' THEN 2
          WHEN 'DELETING' THEN 3
          ELSE 4
        END,
        c.name ASC
    `);

    return result.recordset.map((row) => mapListItem(row as Record<string, unknown>));
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

  async scheduleDeletion(
    input: {
      companyId: string;
      actorUserId: string;
      reason: string;
      scheduledDeletionAt: Date;
      now: Date;
    },
    transaction: sql.Transaction,
  ): Promise<Company | null> {
    const result = await new sql.Request(transaction)
      .input("id", sql.UniqueIdentifier, input.companyId)
      .input("actorUserId", sql.UniqueIdentifier, input.actorUserId)
      .input("reason", sql.NVarChar(500), input.reason)
      .input("scheduledDeletionAt", sql.DateTime2, input.scheduledDeletionAt)
      .input("now", sql.DateTime2, input.now)
      .query(`
        UPDATE companies
        SET status = N'PENDING_DELETION',
            deactivated_at = @now,
            deactivated_by_user_id = @actorUserId,
            deactivation_reason = @reason,
            scheduled_deletion_at = @scheduledDeletionAt,
            reactivated_at = NULL,
            reactivated_by_user_id = NULL,
            deletion_started_at = NULL,
            deleted_at = NULL,
            deletion_attempts = 0,
            deletion_last_error = NULL,
            deletion_lease_owner = NULL,
            deletion_lease_expires_at = NULL,
            deletion_purge_stage = NULL,
            deletion_next_attempt_at = NULL,
            updated_at = @now
        OUTPUT INSERTED.*
        WHERE id = @id
          AND status IN (N'ACTIVE', N'INACTIVE', N'SUSPENDED')
      `);

    if (!result.recordset[0]) {
      return null;
    }
    return mapCompanyRow(result.recordset[0] as Record<string, unknown>);
  },

  async reactivate(
    input: {
      companyId: string;
      actorUserId: string;
      now: Date;
    },
    transaction: sql.Transaction,
  ): Promise<Company | null> {
    const result = await new sql.Request(transaction)
      .input("id", sql.UniqueIdentifier, input.companyId)
      .input("actorUserId", sql.UniqueIdentifier, input.actorUserId)
      .input("now", sql.DateTime2, input.now)
      .query(`
        UPDATE companies
        SET status = N'ACTIVE',
            scheduled_deletion_at = NULL,
            reactivated_at = @now,
            reactivated_by_user_id = @actorUserId,
            deletion_started_at = NULL,
            deleted_at = NULL,
            deletion_attempts = 0,
            deletion_last_error = NULL,
            deletion_lease_owner = NULL,
            deletion_lease_expires_at = NULL,
            deletion_purge_stage = NULL,
            deletion_next_attempt_at = NULL,
            updated_at = @now
        OUTPUT INSERTED.*
        WHERE id = @id
          AND status IN (N'PENDING_DELETION', N'DELETION_FAILED', N'INACTIVE', N'SUSPENDED')
      `);

    if (!result.recordset[0]) {
      return null;
    }
    return mapCompanyRow(result.recordset[0] as Record<string, unknown>);
  },

  /**
   * Atomically claims one due company for deletion (UPDLOCK/READPAST).
   * Recovers orphaned DELETING rows whose lease expired.
   */
  async claimNextDueForDeletion(input: {
    leaseOwner: string;
    leaseMs: number;
    now: Date;
  }): Promise<Company | null> {
    const pool = getPool();
    const leaseExpires = new Date(input.now.getTime() + input.leaseMs);
    const result = await pool
      .request()
      .input("now", sql.DateTime2, input.now)
      .input("leaseOwner", sql.NVarChar(100), input.leaseOwner)
      .input("leaseExpires", sql.DateTime2, leaseExpires)
      .query(`
        ;WITH candidate AS (
          SELECT TOP (1) id
          FROM companies WITH (UPDLOCK, READPAST, ROWLOCK)
          WHERE (
              status = N'PENDING_DELETION'
              AND scheduled_deletion_at IS NOT NULL
              AND scheduled_deletion_at <= @now
              AND (deletion_next_attempt_at IS NULL OR deletion_next_attempt_at <= @now)
            )
            OR (
              status = N'DELETION_FAILED'
              AND scheduled_deletion_at IS NOT NULL
              AND scheduled_deletion_at <= @now
              AND (deletion_next_attempt_at IS NULL OR deletion_next_attempt_at <= @now)
            )
            OR (
              status = N'DELETING'
              AND deletion_lease_expires_at IS NOT NULL
              AND deletion_lease_expires_at < @now
            )
          ORDER BY
            CASE status
              WHEN N'DELETING' THEN 0
              WHEN N'DELETION_FAILED' THEN 1
              ELSE 2
            END,
            scheduled_deletion_at ASC
        )
        UPDATE c
        SET status = N'DELETING',
            deletion_started_at = COALESCE(c.deletion_started_at, @now),
            deletion_attempts = c.deletion_attempts + 1,
            deletion_last_error = NULL,
            deletion_lease_owner = @leaseOwner,
            deletion_lease_expires_at = @leaseExpires,
            deletion_next_attempt_at = NULL,
            deletion_purge_stage = COALESCE(c.deletion_purge_stage, N'STORAGE_DISCOVERY'),
            updated_at = @now
        OUTPUT INSERTED.*
        FROM companies c
        INNER JOIN candidate ON candidate.id = c.id
      `);

    if (!result.recordset[0]) {
      return null;
    }
    return mapCompanyRow(result.recordset[0] as Record<string, unknown>);
  },

  async renewDeletionLease(input: {
    companyId: string;
    leaseOwner: string;
    leaseMs: number;
    now: Date;
  }): Promise<boolean> {
    const pool = getPool();
    const leaseExpires = new Date(input.now.getTime() + input.leaseMs);
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, input.companyId)
      .input("leaseOwner", sql.NVarChar(100), input.leaseOwner)
      .input("leaseExpires", sql.DateTime2, leaseExpires)
      .input("now", sql.DateTime2, input.now)
      .query(`
        UPDATE companies
        SET deletion_lease_expires_at = @leaseExpires,
            updated_at = @now
        WHERE id = @id
          AND status = N'DELETING'
          AND deletion_lease_owner = @leaseOwner
      `);
    return Number(result.rowsAffected[0] ?? 0) > 0;
  },

  async setDeletionPurgeStage(input: {
    companyId: string;
    leaseOwner: string;
    stage: string;
    now: Date;
  }): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, input.companyId)
      .input("leaseOwner", sql.NVarChar(100), input.leaseOwner)
      .input("stage", sql.NVarChar(40), input.stage)
      .input("now", sql.DateTime2, input.now)
      .query(`
        UPDATE companies
        SET deletion_purge_stage = @stage,
            updated_at = @now
        WHERE id = @id
          AND status = N'DELETING'
          AND deletion_lease_owner = @leaseOwner
      `);
    return Number(result.rowsAffected[0] ?? 0) > 0;
  },

  async markDeletionFailed(
    companyId: string,
    errorMessage: string,
    now: Date,
    options: { leaseOwner: string; nextAttemptAt: Date },
  ): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, companyId)
      .input("error", sql.NVarChar(1000), errorMessage.slice(0, 1000))
      .input("now", sql.DateTime2, now)
      .input("leaseOwner", sql.NVarChar(100), options.leaseOwner)
      .input("nextAttemptAt", sql.DateTime2, options.nextAttemptAt)
      .query(`
        UPDATE companies
        SET status = N'DELETION_FAILED',
            deletion_last_error = @error,
            deletion_lease_owner = NULL,
            deletion_lease_expires_at = NULL,
            deletion_next_attempt_at = @nextAttemptAt,
            updated_at = @now
        WHERE id = @id
          AND status = N'DELETING'
          AND deletion_lease_owner = @leaseOwner
      `);
    return Number(result.rowsAffected[0] ?? 0) > 0;
  },

  async markDeleted(
    companyId: string,
    now: Date,
    leaseOwner: string,
  ): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, companyId)
      .input("now", sql.DateTime2, now)
      .input("leaseOwner", sql.NVarChar(100), leaseOwner)
      .query(`
        UPDATE companies
        SET status = N'DELETED',
            name = CONCAT(N'deleted-', CONVERT(nvarchar(36), id)),
            legal_name = NULL,
            tax_id = NULL,
            deleted_at = @now,
            scheduled_deletion_at = NULL,
            deletion_last_error = NULL,
            deletion_lease_owner = NULL,
            deletion_lease_expires_at = NULL,
            deletion_purge_stage = N'COMPLETED',
            deletion_next_attempt_at = NULL,
            updated_at = @now
        WHERE id = @id
          AND status = N'DELETING'
          AND deletion_lease_owner = @leaseOwner
      `);
    return Number(result.rowsAffected[0] ?? 0) > 0;
  },

  async countActiveCompanies(transaction?: sql.Transaction): Promise<number> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request.query(`
      SELECT COUNT(1) AS total FROM companies WITH (UPDLOCK, HOLDLOCK)
      WHERE status = N'ACTIVE'
    `);
    return Number(result.recordset[0]?.total ?? 0);
  },
};
