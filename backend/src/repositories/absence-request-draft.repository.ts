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

const mapDraft = (row: Record<string, unknown>): AbsenceRequestDraftRow => ({
  id: String(row.id),
  companyId: String(row.company_id),
  employeeId: String(row.employee_id),
  absenceTypeId: String(row.absence_type_id),
  startDate: String(row.start_date).slice(0, 10),
  endDate: String(row.end_date).slice(0, 10),
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
});

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
};
