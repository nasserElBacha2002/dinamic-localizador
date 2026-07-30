import sql from "mssql";
import { assertAbsenceTransition } from "../constants/absence-transitions";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import type {
  NeedsInfoAbsenceRequestInput,
  RejectAbsenceRequestInput,
} from "../schemas/absence-request.schema";
import type { AbsenceRequestStatus } from "../types/absence";
import { rollbackTransactionSafely } from "../utils/sql-transaction";
import { auditService } from "./audit.service";
import { absenceBalanceService } from "./absence-balance.service";
import { absenceRequestService } from "./absence-request.service";
import { absenceWorkdaySyncService } from "./absence-workday-sync.service";
import { employeeWorkdayAbsenceReconciliationService } from "./employee-workday-absence-reconciliation.service";
import type { AbsenceWorkdaySyncOperation } from "../repositories/absence-workday-sync-job.repository";

const transition = async (input: {
  companyId: string;
  requestId: string;
  userId: string;
  action: "APPROVE" | "REJECT" | "NEEDS_INFO" | "UPDATE_NEEDS_INFO_COMMENT" | "CANCEL";
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

    let action = input.action;
    if (action === "NEEDS_INFO" && existing.status === "NEEDS_INFO") {
      action = "UPDATE_NEEDS_INFO_COMMENT";
    }

    const rule = assertAbsenceTransition(action, existing.status);
    if (rule.requiresComment && !input.comment?.trim()) {
      throw new AppError(400, "ABSENCE_COMMENT_REQUIRED", "El comentario es obligatorio");
    }

    if (rule.affectsBalance) {
      await absenceBalanceService.ensureSufficientBalanceForApproval(
        input.companyId,
        existing,
        transaction,
      );
    }

    const { absenceBalanceLedgerService } = await import("./absence-balance-ledger.service");
    const { allocationsForRequest } = await import("./absence-balance.service");
    const ledgerEnabled = await absenceBalanceLedgerService.isLedgerEnabled(input.companyId);
    if (ledgerEnabled && existing.totalDays > 0) {
      const allocations = allocationsForRequest(existing);
      const actor = { userId: input.userId };
      if (action === "APPROVE") {
        await absenceBalanceLedgerService.consumeReservation(
          input.companyId,
          existing,
          allocations,
          actor,
          transaction,
        );
      } else if (action === "REJECT" || action === "CANCEL") {
        await absenceBalanceLedgerService.releaseReservation(
          input.companyId,
          existing,
          allocations,
          actor,
          transaction,
        );
      }
    }

    const updated = await absenceRequestRepository.updateStatus(
      input.companyId,
      input.requestId,
      {
        status: rule.to,
        reviewedByUserId: input.userId,
        reviewedAt: new Date(),
        reviewComment: input.comment ?? null,
        cancelledAt: input.cancelledAt ?? null,
        onlyIfStatusIn: rule.fromStatusesForUpdate,
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
        eventType: rule.eventType,
        oldStatus: existing.status,
        newStatus: rule.to,
        performedByUserId: input.userId,
        comment: input.comment ?? null,
      },
      transaction,
    );

    if (rule.triggersReconciliation) {
      const syncOperation: AbsenceWorkdaySyncOperation =
        action === "APPROVE" ? "APPROVE" : action === "REJECT" ? "REJECT" : "CANCEL";
      await absenceWorkdaySyncService.enqueueInTransaction(
        {
          companyId: input.companyId,
          absenceRequestId: input.requestId,
          absenceStatus: rule.to,
          operation: syncOperation,
        },
        transaction,
      );
    }

    await auditService.log(
      input.companyId,
      {
        entityType: "absence_request",
        entityId: input.requestId,
        action: rule.eventType,
        previousData: existing as unknown as Record<string, unknown>,
        newData: updated as unknown as Record<string, unknown>,
        reason: input.comment ?? null,
        userId: input.userId,
      },
      transaction,
    );

    await transaction.commit();

    // Proactive WhatsApp notifications are intentionally deferred to a later phase.
    return absenceRequestService.getById(input.companyId, input.requestId);
  } catch (error) {
    return rollbackTransactionSafely(
      transaction,
      {
        operation: `absence-review.${input.action}`,
        companyId: input.companyId,
        entityId: input.requestId,
      },
      error,
    );
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
