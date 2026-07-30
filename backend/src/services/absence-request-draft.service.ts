import sql from "mssql";
import { randomUUID } from "node:crypto";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { resolveAttachmentPolicy } from "../domain/absence-attachment-policy";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { absenceAttachmentService } from "./absence-attachment.service";
import { absenceRequestService } from "./absence-request.service";
import { isDuplicateKeyError } from "../utils/sql-server-errors";
import type { AbsenceDayPeriod } from "../types/absence";
import type { AbsenceAttachmentPolicy } from "../types/absence-attachment";

export type AbsenceRequestDraft = {
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

const mapDraft = (row: Record<string, unknown>): AbsenceRequestDraft => ({
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
  status: String(row.status) as AbsenceRequestDraft["status"],
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

const DRAFT_TTL_HOURS = 24;

export const absenceRequestDraftService = {
  async create(
    companyId: string,
    input: {
      employeeId: string;
      absenceTypeId: string;
      startDate: string;
      endDate: string;
      startPeriod: AbsenceDayPeriod;
      endPeriod: AbsenceDayPeriod;
      reason: string;
    },
    userId: string,
  ): Promise<AbsenceRequestDraft> {
    const enabled = await absenceAttachmentService.isFeatureEnabled(companyId);
    if (!enabled) {
      throw new AppError(
        409,
        "ABSENCE_ATTACHMENTS_DISABLED",
        "Los drafts de adjuntos requieren el módulo habilitado",
      );
    }

    const employee = await employeeRepository.findById(companyId, input.employeeId);
    if (!employee?.active) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
    }
    const absenceType = await absenceTypeRepository.findById(companyId, input.absenceTypeId);
    if (!absenceType?.isActive) {
      throw new AppError(404, "ABSENCE_TYPE_NOT_FOUND", "Tipo de ausencia no encontrado");
    }
    const policy = resolveAttachmentPolicy({
      attachmentPolicy: absenceType.attachmentPolicy,
      requiresAttachment: absenceType.requiresAttachment,
    });
    if (policy === "FORBIDDEN") {
      // Forbidden types should use direct create without attachments.
      throw new AppError(
        409,
        "ABSENCE_ATTACHMENT_FORBIDDEN",
        "Este tipo no admite adjuntos; usá la creación directa",
      );
    }

    const id = randomUUID();
    const expiresAt = new Date(Date.now() + DRAFT_TTL_HOURS * 60 * 60 * 1000);
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("absenceTypeId", sql.UniqueIdentifier, input.absenceTypeId)
      .input("startDate", sql.Date, input.startDate)
      .input("endDate", sql.Date, input.endDate)
      .input("startPeriod", sql.NVarChar(20), input.startPeriod)
      .input("endPeriod", sql.NVarChar(20), input.endPeriod)
      .input("reason", sql.NVarChar(1000), input.reason)
      .input("policy", sql.NVarChar(20), policy)
      .input("userId", sql.UniqueIdentifier, userId)
      .input("expiresAt", sql.DateTime2, expiresAt)
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

  async get(companyId: string, draftId: string): Promise<AbsenceRequestDraft> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, draftId)
      .query(`
        SELECT TOP 1 * FROM absence_request_drafts
        WHERE id = @id AND company_id = @companyId
      `);
    if (!result.recordset[0]) {
      throw new AppError(404, "ABSENCE_DRAFT_NOT_FOUND", "Borrador no encontrado");
    }
    return mapDraft(result.recordset[0] as Record<string, unknown>);
  },

  async submit(
    companyId: string,
    draftId: string,
    userId: string,
    submitIdempotencyKey: string,
  ) {
    const draft = await this.get(companyId, draftId);
    if (draft.status === "SUBMITTED" && draft.submittedRequestId) {
      if (
        draft.submitIdempotencyKey &&
        draft.submitIdempotencyKey !== submitIdempotencyKey
      ) {
        throw new AppError(
          409,
          "ABSENCE_DRAFT_IDEMPOTENCY_CONFLICT",
          "El borrador ya fue enviado con otra clave de idempotencia",
        );
      }
      return absenceRequestService.getById(companyId, draft.submittedRequestId);
    }
    if (draft.status !== "OPEN") {
      throw new AppError(409, "ABSENCE_DRAFT_NOT_OPEN", "El borrador no está abierto");
    }
    if (new Date(draft.expiresAt).getTime() < Date.now()) {
      throw new AppError(409, "ABSENCE_DRAFT_EXPIRED", "El borrador expiró");
    }

    await absenceAttachmentService.assertRequiredAttachmentsSatisfiedForDraft(
      companyId,
      draftId,
      draft.attachmentPolicySnapshot,
    );

    try {
      const detail = await absenceRequestService.createFromAdmin(
        companyId,
        {
          employeeId: draft.employeeId,
          absenceTypeId: draft.absenceTypeId,
          startDate: draft.startDate,
          endDate: draft.endDate,
          startPeriod: draft.startPeriod,
          endPeriod: draft.endPeriod,
          reason: draft.reason,
          requestedVia: "ADMIN",
        },
        userId,
        { fromDraftId: draftId, skipAttachmentFeatureGate: true },
      );

      const pool = getPool();
      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("id", sql.UniqueIdentifier, draftId)
        .input("requestId", sql.UniqueIdentifier, detail.id)
        .input("idempotencyKey", sql.NVarChar(120), submitIdempotencyKey)
        .query(`
          UPDATE absence_request_drafts
          SET status = N'SUBMITTED',
              submitted_request_id = @requestId,
              submit_idempotency_key = @idempotencyKey,
              updated_at = SYSUTCDATETIME()
          WHERE id = @id AND company_id = @companyId AND status = N'OPEN'
        `);

      await pool
        .request()
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("draftId", sql.UniqueIdentifier, draftId)
        .input("requestId", sql.UniqueIdentifier, detail.id)
        .query(`
          UPDATE absence_request_attachments
          SET absence_request_id = @requestId,
              updated_at = SYSUTCDATETIME()
          WHERE company_id = @companyId AND draft_id = @draftId
        `);

      // Auto-approve may have been skipped for REQUIRED; retry if type allows and docs OK.
      if (detail.status === "PENDING") {
        try {
          await absenceAttachmentService.assertRequiredAttachmentsSatisfied(
            companyId,
            detail.id,
            detail.absenceTypeId,
          );
          const type = await absenceTypeRepository.findById(companyId, detail.absenceTypeId);
          if (type && !type.requiresApproval) {
            const { absenceReviewService } = await import("./absence-review.service");
            return absenceReviewService.approve(companyId, detail.id, userId);
          }
        } catch {
          /* leave PENDING if docs still missing */
        }
      }

      return detail;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const again = await this.get(companyId, draftId);
        if (again.submittedRequestId) {
          return absenceRequestService.getById(companyId, again.submittedRequestId);
        }
      }
      throw error;
    }
  },
};
