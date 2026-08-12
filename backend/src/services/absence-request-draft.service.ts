import { randomUUID } from "node:crypto";
import sql from "mssql";
import { AppError } from "../errors/app-error";
import { resolveAttachmentPolicy } from "../domain/absence-attachment-policy";
import { getPool } from "../database/connection";
import { absenceAttachmentRepository } from "../repositories/absence-attachment.repository";
import { absenceRequestDraftRepository } from "../repositories/absence-request-draft.repository";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
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

const DRAFT_TTL_HOURS = 24;

const rollbackLockTx = async (lockTx: sql.Transaction): Promise<void> => {
  try {
    await lockTx.rollback();
  } catch {
    /* already rolled back / completed */
  }
};

/**
 * Durable submit pointer is `absence_request_drafts.submitted_request_id`
 * (CAS OPEN→SUBMITTED). At most one durable request per draftId.
 */
const resolveDurableSubmitResult = async (
  companyId: string,
  draftId: string,
  submitIdempotencyKey: string,
) => {
  const draft = await absenceRequestDraftRepository.findById(companyId, draftId);
  if (!draft) {
    throw new AppError(404, "ABSENCE_DRAFT_NOT_FOUND", "Borrador no encontrado");
  }
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
  if (draft.status === "CANCELLED") {
    throw new AppError(409, "ABSENCE_DRAFT_NOT_OPEN", "El borrador fue cancelado");
  }
  if (draft.status === "EXPIRED") {
    throw new AppError(409, "ABSENCE_DRAFT_EXPIRED", "El borrador expiró");
  }
  throw new AppError(409, "ABSENCE_DRAFT_NOT_OPEN", "El borrador no está abierto");
};

/**
 * Cancel a request created during a lost/aborted draft submit so it cannot
 * remain as a durable orphan. Only PENDING is safe without balance reversal.
 */
const abandonOrphanDraftRequest = async (
  companyId: string,
  requestId: string,
): Promise<void> => {
  await absenceRequestRepository.updateStatus(companyId, requestId, {
    status: "CANCELLED",
    cancelledAt: new Date(),
    reviewComment: "ABSENCE_DRAFT_SUBMIT_ORPHAN_ABANDONED",
    onlyIfStatusIn: ["PENDING"],
  });
};

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
      throw new AppError(
        409,
        "ABSENCE_ATTACHMENT_FORBIDDEN",
        "Este tipo no admite adjuntos; usá la creación directa",
      );
    }

    return absenceRequestDraftRepository.create({
      id: randomUUID(),
      companyId,
      employeeId: input.employeeId,
      absenceTypeId: input.absenceTypeId,
      startDate: input.startDate,
      endDate: input.endDate,
      startPeriod: input.startPeriod,
      endPeriod: input.endPeriod,
      reason: input.reason,
      attachmentPolicy: policy,
      createdByUserId: userId,
      expiresAt: new Date(Date.now() + DRAFT_TTL_HOURS * 60 * 60 * 1000),
    });
  },

  async get(companyId: string, draftId: string): Promise<AbsenceRequestDraft> {
    const draft = await absenceRequestDraftRepository.findById(companyId, draftId);
    if (!draft) {
      throw new AppError(404, "ABSENCE_DRAFT_NOT_FOUND", "Borrador no encontrado");
    }
    return draft;
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

    const pool = getPool();
    const lockTx = new sql.Transaction(pool);
    await lockTx.begin();

    let createdRequestId: string | null = null;
    let casWon = false;

    try {
      const locked = await absenceRequestDraftRepository.lockOpenDraft(
        companyId,
        draftId,
        lockTx,
      );
      if (!locked) {
        await rollbackLockTx(lockTx);
        return resolveDurableSubmitResult(companyId, draftId, submitIdempotencyKey);
      }

      // Hold UPDLOCK while creating the request (separate connection) so concurrent
      // submit/cancel/expire block on the draft row until CAS commits.
      const detail = await absenceRequestService.createFromAdmin(
        companyId,
        {
          employeeId: locked.employeeId,
          absenceTypeId: locked.absenceTypeId,
          startDate: locked.startDate,
          endDate: locked.endDate,
          startPeriod: locked.startPeriod,
          endPeriod: locked.endPeriod,
          reason: locked.reason,
          requestedVia: "ADMIN",
        },
        userId,
        { fromDraftId: draftId, skipAttachmentFeatureGate: true },
      );
      createdRequestId = detail.id;

      const affected = await absenceRequestDraftRepository.markSubmittedIfOpen(
        {
          companyId,
          draftId,
          requestId: detail.id,
          submitIdempotencyKey,
        },
        lockTx,
      );

      if (affected !== 1) {
        await rollbackLockTx(lockTx);
        await abandonOrphanDraftRequest(companyId, detail.id);
        return resolveDurableSubmitResult(companyId, draftId, submitIdempotencyKey);
      }

      await lockTx.commit();
      casWon = true;

      // Attachments only after winning CAS — never to a lost-CAS request.
      await absenceAttachmentRepository.linkDraftAttachmentsToRequest({
        companyId,
        draftId,
        requestId: detail.id,
      });

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
      await rollbackLockTx(lockTx);
      if (createdRequestId && !casWon) {
        await abandonOrphanDraftRequest(companyId, createdRequestId);
      }
      if (isDuplicateKeyError(error)) {
        return resolveDurableSubmitResult(companyId, draftId, submitIdempotencyKey);
      }
      throw error;
    }
  },
};
