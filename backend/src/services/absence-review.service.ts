import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import type {
  NeedsInfoAbsenceRequestInput,
  RejectAbsenceRequestInput,
} from "../schemas/absence-request.schema";
import type { AbsenceRequestStatus } from "../types/absence";
import { auditService } from "./audit.service";
import { absenceBalanceService } from "./absence-balance.service";
import { absenceRequestService, REVIEWABLE_STATUSES } from "./absence-request.service";

const ensureReviewable = (status: AbsenceRequestStatus) => {
  if (!REVIEWABLE_STATUSES.includes(status as (typeof REVIEWABLE_STATUSES)[number])) {
    throw new AppError(
      409,
      "ABSENCE_NOT_REVIEWABLE",
      "Solo se pueden revisar solicitudes pendientes o que requieren información",
    );
  }
};

const transition = async (input: {
  companyId: string;
  requestId: string;
  userId: string;
  newStatus: AbsenceRequestStatus;
  eventType: "APPROVED" | "REJECTED" | "NEEDS_INFO" | "CANCELLED";
  comment?: string | null;
  cancelledAt?: Date | null;
}) => {
  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const existing = await absenceRequestRepository.findByIdForUpdate(
      input.companyId,
      input.requestId,
      transaction,
    );
    if (!existing) {
      throw new AppError(404, "ABSENCE_REQUEST_NOT_FOUND", "Solicitud de ausencia no encontrada");
    }

    ensureReviewable(existing.status);

    if (input.eventType === "APPROVED") {
      await absenceBalanceService.ensureSufficientBalanceForApproval(
        input.companyId,
        existing,
        transaction,
      );
    }

    const updated = await absenceRequestRepository.updateStatus(
      input.companyId,
      input.requestId,
      {
        status: input.newStatus,
        reviewedByUserId: input.userId,
        reviewedAt: new Date(),
        reviewComment: input.comment ?? null,
        cancelledAt: input.cancelledAt ?? null,
        onlyIfStatusIn: [...REVIEWABLE_STATUSES],
      },
      transaction,
    );

    if (!updated) {
      throw new AppError(
        409,
        "ABSENCE_ALREADY_REVIEWED",
        "La solicitud ya fue revisada por otro usuario",
      );
    }

    await absenceRequestRepository.createEvent(
      input.companyId,
      {
        absenceRequestId: input.requestId,
        eventType: input.eventType,
        oldStatus: existing.status,
        newStatus: input.newStatus,
        performedByUserId: input.userId,
        comment: input.comment ?? null,
      },
      transaction,
    );

    await transaction.commit();

    await auditService.log(input.companyId, {
      entityType: "absence_request",
      entityId: input.requestId,
      action: input.eventType,
      previousData: existing as unknown as Record<string, unknown>,
      newData: updated as unknown as Record<string, unknown>,
      reason: input.comment ?? null,
      userId: input.userId,
    });

    // Proactive WhatsApp notifications are intentionally deferred to a later phase.
    return absenceRequestService.getById(input.companyId, input.requestId);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const absenceReviewService = {
  approve(companyId: string, requestId: string, userId: string) {
    return transition({
      companyId,
      requestId,
      userId,
      newStatus: "APPROVED",
      eventType: "APPROVED",
    });
  },

  reject(companyId: string, requestId: string, userId: string, input: RejectAbsenceRequestInput) {
    return transition({
      companyId,
      requestId,
      userId,
      newStatus: "REJECTED",
      eventType: "REJECTED",
      comment: input.reason,
    });
  },

  needsInfo(companyId: string, requestId: string, userId: string, input: NeedsInfoAbsenceRequestInput) {
    return transition({
      companyId,
      requestId,
      userId,
      newStatus: "NEEDS_INFO",
      eventType: "NEEDS_INFO",
      comment: input.comment,
    });
  },

  cancel(companyId: string, requestId: string, userId: string) {
    return transition({
      companyId,
      requestId,
      userId,
      newStatus: "CANCELLED",
      eventType: "CANCELLED",
      cancelledAt: new Date(),
    });
  },
};
