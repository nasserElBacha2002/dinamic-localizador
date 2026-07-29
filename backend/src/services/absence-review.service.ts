import sql from "mssql";
import {
  ABSENCE_REVIEWABLE_STATUSES,
  assertAbsenceTransition,
} from "../constants/absence-transitions";
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
import { absenceRequestService } from "./absence-request.service";
import { absenceWorkdaySyncService } from "./absence-workday-sync.service";
import { employeeWorkdayAbsenceReconciliationService } from "./employee-workday-absence-reconciliation.service";

const transition = async (input: {
  companyId: string;
  requestId: string;
  userId: string;
  action: "APPROVE" | "REJECT" | "NEEDS_INFO" | "CANCEL";
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

    const { to: newStatus, eventType } = assertAbsenceTransition(input.action, existing.status);

    if (input.action === "APPROVE") {
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
        status: newStatus,
        reviewedByUserId: input.userId,
        reviewedAt: new Date(),
        reviewComment: input.comment ?? null,
        cancelledAt: input.cancelledAt ?? null,
        onlyIfStatusIn: [...ABSENCE_REVIEWABLE_STATUSES],
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
        eventType,
        oldStatus: existing.status,
        newStatus,
        performedByUserId: input.userId,
        comment: input.comment ?? null,
      },
      transaction,
    );

    await transaction.commit();

    await auditService.log(input.companyId, {
      entityType: "absence_request",
      entityId: input.requestId,
      action: eventType,
      previousData: existing as unknown as Record<string, unknown>,
      newData: updated as unknown as Record<string, unknown>,
      reason: input.comment ?? null,
      userId: input.userId,
    });

    // Proactive WhatsApp notifications are intentionally deferred to a later phase.
    return absenceRequestService.getById(input.companyId, input.requestId);
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // ignore
    }
    throw error;
  }
};

export const absenceReviewService = {
  approve(companyId: string, requestId: string, userId: string) {
    return absenceWorkdaySyncService.runAfterAbsenceMutation(
      companyId,
      requestId,
      () =>
        transition({
          companyId,
          requestId,
          userId,
          action: "APPROVE",
        }),
      () =>
        employeeWorkdayAbsenceReconciliationService.reconcileForApprovedAbsence(
          companyId,
          requestId,
        ),
      "approve",
    );
  },

  reject(companyId: string, requestId: string, userId: string, input: RejectAbsenceRequestInput) {
    return absenceWorkdaySyncService.runAfterAbsenceMutation(
      companyId,
      requestId,
      () =>
        transition({
          companyId,
          requestId,
          userId,
          action: "REJECT",
          comment: input.reason,
        }),
      () =>
        employeeWorkdayAbsenceReconciliationService.reconcileForRevokedAbsence(
          companyId,
          requestId,
        ),
      "reject",
    );
  },

  needsInfo(companyId: string, requestId: string, userId: string, input: NeedsInfoAbsenceRequestInput) {
    return transition({
      companyId,
      requestId,
      userId,
      action: "NEEDS_INFO",
      comment: input.comment,
    });
  },

  cancel(companyId: string, requestId: string, userId: string) {
    return absenceWorkdaySyncService.runAfterAbsenceMutation(
      companyId,
      requestId,
      () =>
        transition({
          companyId,
          requestId,
          userId,
          action: "CANCEL",
          cancelledAt: new Date(),
        }),
      () =>
        employeeWorkdayAbsenceReconciliationService.reconcileForRevokedAbsence(
          companyId,
          requestId,
        ),
      "cancel",
    );
  },
};

export type { AbsenceRequestStatus };
