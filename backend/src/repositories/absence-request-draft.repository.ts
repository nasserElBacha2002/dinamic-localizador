import sql from "mssql";
import { getPool } from "../database/connection";
import type { AbsenceDayPeriod } from "../types/absence";
import type { AbsenceAttachmentPolicy } from "../types/absence-attachment";

export type AbsenceRequestDraftRow = {
  id: string;
  companyId: string;
  employeeId: string;
  absenceTypeId: string;
  startDate: string;
  endDate: string;
  startPeriod: AbsenceDayPeriod;
  endPeriod: AbsenceDayPeriod;
  reason: string;
  attachmentPolicySnapshot: AbsenceAttachmentPolicy;
  status: "OPEN" | "SUBMITTED" | "EXPIRED" | "CANCELLED";
  submitIdempotencyKey: string | null;
  submittedRequestId: string | null;
  expiresAt: string;
  createdAt: string;
};

const mapDraft = (row: Record<string, unknown>): AbsenceRequestDraftRow => {
  const toDateIso = (value: unknown): string => {
    if (value instanceof Date) {
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, "0");
      const d = String(value.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      return raw.slice(0, 10);
    }
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, "0");
      const d = String(parsed.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return raw.slice(0, 10);
  };

  return {
  id: String(row.id),
  companyId: String(row.company_id),
  employeeId: String(row.employee_id),
  absenceTypeId: String(row.absence_type_id),
  startDate: toDateIso(row.start_date),
  endDate: toDateIso(row.end_date),
  startPeriod: String(row.start_period) as AbsenceDayPeriod,
  endPeriod: String(row.end_period) as AbsenceDayPeriod,
  reason: String(row.reason),
  attachmentPolicySnapshot: String(
    row.attachment_policy_snapshot,
  ) as AbsenceAttachmentPolicy,
  status: String(row.status) as AbsenceRequestDraftRow["status"],
  submitIdempotencyKey: row.submit_idempotency_key
    ? String(row.submit_idempotency_key)
    : null,
  submittedRequestId: row.submitted_request_id ? String(row.submitted_request_id) : null,
  expiresAt:
    row.expires_at instanceof Date
      ? row.expires_at.toISOString()
      : new Date(String(row.expires_at)).toISOString(),
  createdAt:
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : new Date(String(row.created_at)).toISOString(),
};
};

export const absenceRequestDraftRepository = {
  async findById(
    companyId: string,
    draftId: string,
    transaction?: sql.Transaction,
  ): Promise<AbsenceRequestDraftRow | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, draftId)
      .query(`
        SELECT TOP 1 *
        FROM absence_request_drafts
        WHERE id = @id AND company_id = @companyId
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapDraft(result.recordset[0] as Record<string, unknown>);
  },

  async lockOpenDraft(
    companyId: string,
    draftId: string,
    transaction: sql.Transaction,
  ): Promise<AbsenceRequestDraftRow | null> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, draftId)
      .query(`
        SELECT TOP 1 *
        FROM absence_request_drafts WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @id AND company_id = @companyId AND status = N'OPEN'
      `);
    if (!result.recordset[0]) {
      return null;
    }
    return mapDraft(result.recordset[0] as Record<string, unknown>);
  },

  async create(input: {
    id: string;
    companyId: string;
    employeeId: string;
    absenceTypeId: string;
    startDate: string;
    endDate: string;
    startPeriod: AbsenceDayPeriod;
    endPeriod: AbsenceDayPeriod;
    reason: string;
    attachmentPolicy: AbsenceAttachmentPolicy;
    createdByUserId: string;
    expiresAt: Date;
  }): Promise<AbsenceRequestDraftRow> {
    const result = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, input.id)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("absenceTypeId", sql.UniqueIdentifier, input.absenceTypeId)
      .input("startDate", sql.Date, input.startDate)
      .input("endDate", sql.Date, input.endDate)
      .input("startPeriod", sql.NVarChar(20), input.startPeriod)
      .input("endPeriod", sql.NVarChar(20), input.endPeriod)
      .input("reason", sql.NVarChar(1000), input.reason)
      .input("policy", sql.NVarChar(20), input.attachmentPolicy)
      .input("userId", sql.UniqueIdentifier, input.createdByUserId)
      .input("expiresAt", sql.DateTime2, input.expiresAt)
      .query(`
        INSERT INTO absence_request_drafts (
          id, company_id, employee_id, absence_type_id,
          start_date, end_date, start_period, end_period, reason,
          attachment_policy_snapshot, status, created_by_user_id, expires_at
        )
        OUTPUT INSERTED.*
        VALUES (
          @id, @companyId, @employeeId, @absenceTypeId,
          @startDate, @endDate, @startPeriod, @endPeriod, @reason,
          @policy, N'OPEN', @userId, @expiresAt
        )
      `);
    return mapDraft(result.recordset[0] as Record<string, unknown>);
  },

  /**
   * CAS: only transitions OPEN → SUBMITTED.
   * @returns rows affected (0 if already submitted / not open).
   */
  async markSubmittedIfOpen(
    input: {
      companyId: string;
      draftId: string;
      requestId: string;
      submitIdempotencyKey: string;
    },
    transaction?: sql.Transaction,
  ): Promise<number> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("id", sql.UniqueIdentifier, input.draftId)
      .input("requestId", sql.UniqueIdentifier, input.requestId)
      .input("idempotencyKey", sql.NVarChar(120), input.submitIdempotencyKey)
      .query(`
        UPDATE absence_request_drafts
        SET status = N'SUBMITTED',
            submitted_request_id = @requestId,
            submit_idempotency_key = @idempotencyKey,
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId AND status = N'OPEN'
      `);
    return Number(result.rowsAffected[0] ?? 0);
  },

  /** CAS: OPEN → CANCELLED (concurrent cancel vs submit). */
  async markCancelledIfOpen(companyId: string, draftId: string): Promise<number> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, draftId)
      .query(`
        UPDATE absence_request_drafts
        SET status = N'CANCELLED',
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId AND status = N'OPEN'
      `);
    return Number(result.rowsAffected[0] ?? 0);
  },

  /** CAS: OPEN → EXPIRED (concurrent expire vs submit). */
  async markExpiredIfOpen(companyId: string, draftId: string): Promise<number> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, draftId)
      .query(`
        UPDATE absence_request_drafts
        SET status = N'EXPIRED',
            updated_at = SYSUTCDATETIME()
        WHERE id = @id AND company_id = @companyId AND status = N'OPEN'
      `);
    return Number(result.rowsAffected[0] ?? 0);
  },
};
