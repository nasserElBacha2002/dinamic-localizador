import sql from "mssql";
import { getPool } from "../database/connection";
import type {
  UserInvitation,
  UserInvitationOrigin,
  UserInvitationStatus,
} from "../types/user-invitation";
import type { CompanyRole } from "../types/company";

const toIso = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

export const mapUserInvitationRow = (row: Record<string, unknown>): UserInvitation => ({
  id: String(row.id),
  companyId: String(row.company_id),
  emailNormalized: String(row.email_normalized),
  inviteeName: row.invitee_name == null ? null : String(row.invitee_name),
  role: String(row.role),
  invitedByUserId: row.invited_by_user_id == null ? null : String(row.invited_by_user_id),
  targetUserId: row.target_user_id == null ? null : String(row.target_user_id),
  tokenHash: String(row.token_hash),
  tokenVersion: Number(row.token_version ?? 1),
  status: String(row.status) as UserInvitationStatus,
  origin: String(row.origin) as UserInvitationOrigin,
  expiresAt: toIso(row.expires_at as Date | string) ?? "",
  acceptedAt: toIso(row.accepted_at as Date | string | null),
  revokedAt: toIso(row.revoked_at as Date | string | null),
  lastEmailSentAt: toIso(row.last_email_sent_at as Date | string | null),
  lastEmailError: row.last_email_error == null ? null : String(row.last_email_error),
  lastEmailErrorCode:
    row.last_email_error_code == null ? null : String(row.last_email_error_code),
  createdAt: toIso(row.created_at as Date | string) ?? "",
  updatedAt: toIso(row.updated_at as Date | string) ?? "",
});

export interface CreateUserInvitationInput {
  companyId: string;
  emailNormalized: string;
  inviteeName?: string | null;
  role: CompanyRole;
  invitedByUserId?: string | null;
  targetUserId?: string | null;
  tokenHash: string;
  origin: UserInvitationOrigin;
  expiresAt: Date;
}

export const userInvitationRepository = {
  async create(
    input: CreateUserInvitationInput,
    transaction?: sql.Transaction,
  ): Promise<UserInvitation> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("emailNormalized", sql.NVarChar(255), input.emailNormalized)
      .input("inviteeName", sql.NVarChar(150), input.inviteeName ?? null)
      .input("role", sql.NVarChar(30), input.role)
      .input("invitedByUserId", sql.UniqueIdentifier, input.invitedByUserId ?? null)
      .input("targetUserId", sql.UniqueIdentifier, input.targetUserId ?? null)
      .input("tokenHash", sql.Char(64), input.tokenHash)
      .input("origin", sql.NVarChar(40), input.origin)
      .input("expiresAt", sql.DateTime2, input.expiresAt)
      .query(`
        INSERT INTO user_invitations (
          company_id, email_normalized, invitee_name, role,
          invited_by_user_id, target_user_id, token_hash, status, origin, expires_at,
          token_version, last_email_error_code
        )
        OUTPUT INSERTED.*
        VALUES (
          @companyId, @emailNormalized, @inviteeName, @role,
          @invitedByUserId, @targetUserId, @tokenHash, 'PENDING', @origin, @expiresAt,
          1, NULL
        )
      `);

    return mapUserInvitationRow(result.recordset[0] as Record<string, unknown>);
  },

  async findById(id: string, transaction?: sql.Transaction): Promise<UserInvitation | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("id", sql.UniqueIdentifier, id)
      .query("SELECT * FROM user_invitations WHERE id = @id");
    if (!result.recordset[0]) return null;
    return mapUserInvitationRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByIdForUpdate(
    id: string,
    transaction: sql.Transaction,
  ): Promise<UserInvitation | null> {
    const request = new sql.Request(transaction);
    const result = await request
      .input("id", sql.UniqueIdentifier, id)
      .query(`
        SELECT *
        FROM user_invitations WITH (UPDLOCK, ROWLOCK)
        WHERE id = @id
      `);
    if (!result.recordset[0]) return null;
    return mapUserInvitationRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByTokenHash(
    tokenHash: string,
    transaction?: sql.Transaction,
  ): Promise<UserInvitation | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("tokenHash", sql.Char(64), tokenHash)
      .query("SELECT * FROM user_invitations WHERE token_hash = @tokenHash");
    if (!result.recordset[0]) return null;
    return mapUserInvitationRow(result.recordset[0] as Record<string, unknown>);
  },

  async findPendingByCompanyEmail(
    companyId: string,
    emailNormalized: string,
    transaction?: sql.Transaction,
  ): Promise<UserInvitation | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("emailNormalized", sql.NVarChar(255), emailNormalized)
      .query(`
        SELECT TOP 1 *
        FROM user_invitations
        WHERE company_id = @companyId
          AND email_normalized = @emailNormalized
          AND status = 'PENDING'
        ORDER BY created_at DESC
      `);
    if (!result.recordset[0]) return null;
    return mapUserInvitationRow(result.recordset[0] as Record<string, unknown>);
  },

  async findPendingByCompanyEmailForUpdate(
    companyId: string,
    emailNormalized: string,
    transaction: sql.Transaction,
  ): Promise<UserInvitation | null> {
    const request = new sql.Request(transaction);
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("emailNormalized", sql.NVarChar(255), emailNormalized)
      .query(`
        SELECT TOP 1 *
        FROM user_invitations WITH (UPDLOCK, ROWLOCK)
        WHERE company_id = @companyId
          AND email_normalized = @emailNormalized
          AND status = 'PENDING'
        ORDER BY created_at DESC
      `);
    if (!result.recordset[0]) return null;
    return mapUserInvitationRow(result.recordset[0] as Record<string, unknown>);
  },

  async listByCompany(
    companyId: string,
    options: { status?: UserInvitationStatus; limit: number; offset: number },
  ): Promise<{ items: Array<UserInvitation & { companyName?: string }>; total: number }> {
    const pool = getPool();
    const countResult = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("status", sql.NVarChar(30), options.status ?? null)
      .query(`
        SELECT COUNT(1) AS total
        FROM user_invitations
        WHERE company_id = @companyId
          AND (@status IS NULL OR status = @status)
      `);

    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("status", sql.NVarChar(30), options.status ?? null)
      .input("limit", sql.Int, options.limit)
      .input("offset", sql.Int, options.offset)
      .query(`
        SELECT i.*, c.name AS company_name
        FROM user_invitations i
        INNER JOIN companies c ON c.id = i.company_id
        WHERE i.company_id = @companyId
          AND (@status IS NULL OR i.status = @status)
        ORDER BY i.created_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    return {
      total: Number(countResult.recordset[0]?.total ?? 0),
      items: result.recordset.map((row) => ({
        ...mapUserInvitationRow(row as Record<string, unknown>),
        companyName: String((row as Record<string, unknown>).company_name ?? ""),
      })),
    };
  },

  async revokePending(
    invitationId: string,
    transaction?: sql.Transaction,
  ): Promise<UserInvitation | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("id", sql.UniqueIdentifier, invitationId)
      .query(`
        UPDATE user_invitations
        SET status = 'REVOKED',
            revoked_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME(),
            last_email_error_code = CASE
              WHEN last_email_error_code = 'EMAIL_SEND_IN_PROGRESS' THEN NULL
              ELSE last_email_error_code
            END
        OUTPUT INSERTED.*
        WHERE id = @id AND status = 'PENDING'
      `);
    if (!result.recordset[0]) return null;
    return mapUserInvitationRow(result.recordset[0] as Record<string, unknown>);
  },

  /**
   * Invitee decline: only PENDING → DECLINED. Invalidates token hash so the link cannot be reused.
   */
  async markDeclinedIfPending(
    invitationId: string,
    transaction?: sql.Transaction,
  ): Promise<UserInvitation | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("id", sql.UniqueIdentifier, invitationId)
      .query(`
        UPDATE user_invitations
        SET status = 'DECLINED',
            revoked_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME(),
            last_email_error_code = CASE
              WHEN last_email_error_code = 'EMAIL_SEND_IN_PROGRESS' THEN NULL
              ELSE last_email_error_code
            END,
            token_hash = LOWER(CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(16), NEWID())), 2))
        OUTPUT INSERTED.*
        WHERE id = @id AND status = 'PENDING'
      `);
    if (!result.recordset[0]) return null;
    return mapUserInvitationRow(result.recordset[0] as Record<string, unknown>);
  },

  /**
   * Atomically rotates token when still PENDING and expectedVersion matches.
   * Sets EMAIL_SEND_IN_PROGRESS so concurrent resends cannot rotate again until delivery settles.
   */
  async replaceTokenIfVersion(
    invitationId: string,
    expectedVersion: number,
    tokenHash: string,
    expiresAt: Date,
    origin: UserInvitationOrigin,
    transaction?: sql.Transaction,
  ): Promise<UserInvitation | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("id", sql.UniqueIdentifier, invitationId)
      .input("expectedVersion", sql.Int, expectedVersion)
      .input("tokenHash", sql.Char(64), tokenHash)
      .input("expiresAt", sql.DateTime2, expiresAt)
      .input("origin", sql.NVarChar(40), origin)
      .query(`
        UPDATE user_invitations
        SET token_hash = @tokenHash,
            token_version = token_version + 1,
            expires_at = @expiresAt,
            origin = @origin,
            status = 'PENDING',
            revoked_at = NULL,
            last_email_error = NULL,
            last_email_error_code = 'EMAIL_SEND_IN_PROGRESS',
            updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @id
          AND status = 'PENDING'
          AND token_version = @expectedVersion
          AND (last_email_error_code IS NULL OR last_email_error_code <> 'EMAIL_SEND_IN_PROGRESS')
      `);
    if (!result.recordset[0]) return null;
    return mapUserInvitationRow(result.recordset[0] as Record<string, unknown>);
  },

  /**
   * Conditional accept: only succeeds when still PENDING and not expired (UTC).
   * Returns null when another concurrent request already accepted/revoked it.
   */
  async markAcceptedIfPending(
    invitationId: string,
    transaction?: sql.Transaction,
  ): Promise<UserInvitation | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("id", sql.UniqueIdentifier, invitationId)
      .query(`
        UPDATE user_invitations
        SET status = 'ACCEPTED',
            accepted_at = SYSUTCDATETIME(),
            updated_at = SYSUTCDATETIME(),
            last_email_error_code = CASE
              WHEN last_email_error_code = 'EMAIL_SEND_IN_PROGRESS' THEN NULL
              ELSE last_email_error_code
            END,
            token_hash = LOWER(CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', CONVERT(VARBINARY(16), NEWID())), 2))
        OUTPUT INSERTED.*
        WHERE id = @id
          AND status = 'PENDING'
          AND expires_at > SYSUTCDATETIME()
      `);
    if (!result.recordset[0]) return null;
    return mapUserInvitationRow(result.recordset[0] as Record<string, unknown>);
  },

  async markExpiredIfPending(invitationId: string): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, invitationId)
      .query(`
        UPDATE user_invitations
        SET status = 'EXPIRED', updated_at = SYSUTCDATETIME()
        WHERE id = @id AND status = 'PENDING' AND expires_at <= SYSUTCDATETIME()
      `);
  },

  async recordEmailResult(
    invitationId: string,
    input: {
      sentAt?: Date | null;
      publicErrorCode?: string | null;
      internalError?: string | null;
    },
    transaction?: sql.Transaction,
  ): Promise<void> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    await request
      .input("id", sql.UniqueIdentifier, invitationId)
      .input("sentAt", sql.DateTime2, input.sentAt ?? null)
      .input("publicErrorCode", sql.NVarChar(80), input.publicErrorCode ?? null)
      .input("internalError", sql.NVarChar(500), input.internalError ?? null)
      .query(`
        UPDATE user_invitations
        SET last_email_sent_at = COALESCE(@sentAt, last_email_sent_at),
            last_email_error_code = @publicErrorCode,
            last_email_error = @internalError,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);
  },

  async findByTokenHashForUpdate(
    tokenHash: string,
    transaction: sql.Transaction,
  ): Promise<UserInvitation | null> {
    const request = new sql.Request(transaction);
    const result = await request
      .input("tokenHash", sql.Char(64), tokenHash)
      .query(`
        SELECT *
        FROM user_invitations WITH (UPDLOCK, ROWLOCK)
        WHERE token_hash = @tokenHash
      `);
    if (!result.recordset[0]) return null;
    return mapUserInvitationRow(result.recordset[0] as Record<string, unknown>);
  },
};
