import sql from "mssql";
import { getPool } from "../../database/connection";
import { companySettingsRepository } from "../../repositories/companies/company-settings.repository";
import { companyUserEmployeeLinkRepository } from "../../repositories/companies/company-user-employee-link.repository";
import { operationChargeAssignmentRepository } from "../../repositories/operations/operation-charge-assignment.repository";
import { auditService } from "../audit.service";
import { getDateIsoInTimezone } from "../../utils/absence-date";
import { resolveOperationTimezone } from "../../utils/operations/operation-timezone";
import { isChargeAssignmentOperationallyEffective } from "../../utils/operations/charge-assignment-effectiveness";
import {
  acquireTransactionAppLock,
  companyUserEmployeeLinkLockResource,
} from "../../utils/sql-app-lock";

export type ChargeAssignmentRevocationReason =
  | "EMPLOYEE_CATEGORY_CHANGED"
  | "EMPLOYEE_DEACTIVATED"
  | "USER_EMPLOYEE_LINK_REPLACED"
  | "USER_EMPLOYEE_LINK_REMOVED";

const resolveReferenceDate = async (companyId: string, referenceAt: Date): Promise<string> => {
  const settings = await companySettingsRepository.findByCompanyId(companyId);
  const timezone = resolveOperationTimezone(settings?.operationTimezone);
  return getDateIsoInTimezone(referenceAt, timezone);
};

const resolveCancelledByUserId = (actorUserId: string | null | undefined, fallbackUserId: string): string =>
  actorUserId ?? fallbackUserId;

export const operationChargeRevocationService = {
  /**
   * Cancels operationally effective charge rows for a panel user. Historical / ended rows are preserved.
   * Caller must own the transaction. Lock order: user-employee link, then per-assignment (via cancelInTransaction).
   */
  async revokeEffectiveForUserInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: {
      userId: string;
      actorUserId: string | null;
      reason: ChargeAssignmentRevocationReason;
      referenceAt?: Date;
      linkLockAlreadyHeld?: boolean;
    },
  ): Promise<string[]> {
    const referenceAt = input.referenceAt ?? new Date();
    const referenceDate = await resolveReferenceDate(companyId, referenceAt);
    const cancelledByUserId = resolveCancelledByUserId(input.actorUserId, input.userId);

    if (!input.linkLockAlreadyHeld) {
      await acquireTransactionAppLock(transaction, {
        resource: companyUserEmployeeLinkLockResource(companyId, input.userId),
      });
    }

    const candidates = await operationChargeAssignmentRepository.listEffectiveByUserInTransaction(
      companyId,
      transaction,
      input.userId,
      referenceDate,
    );

    const revokedIds: string[] = [];
    for (const assignment of candidates) {
      if (!isChargeAssignmentOperationallyEffective(assignment, referenceDate)) {
        continue;
      }

      const cancelled = await operationChargeAssignmentRepository.cancelInTransaction(
        companyId,
        transaction,
        assignment.id,
        cancelledByUserId,
        { linkLockHeld: true },
      );
      if (!cancelled) {
        continue;
      }
      revokedIds.push(cancelled.id);

      await auditService.log(
        companyId,
        {
          entityType: "operation_charge_assignment",
          entityId: cancelled.id,
          action: "CHARGE_ASSIGNMENT_REVOKED",
          previousData: {
            operationId: assignment.operationId,
            employeeId: assignment.employeeId,
            userId: assignment.userId,
            validFrom: assignment.validFrom,
            validUntil: assignment.validUntil,
          },
          newData: {
            reason: input.reason,
            cancelledAt: cancelled.cancelledAt,
          },
          userId: input.actorUserId,
        },
        transaction,
      );
    }

    if (revokedIds.length > 0) {
      await auditService.log(
        companyId,
        {
          entityType: "company_user_employee_link",
          entityId: input.userId,
          action: "CHARGE_ASSIGNMENTS_BULK_REVOKED",
          newData: {
            reason: input.reason,
            assignmentIds: revokedIds,
            referenceDate,
          },
          userId: input.actorUserId,
        },
        transaction,
      );
    }

    return revokedIds;
  },

  async revokeForEmployeeCollaboratorInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: {
      employeeId: string;
      actorUserId: string | null;
      reason: Extract<
        ChargeAssignmentRevocationReason,
        "EMPLOYEE_CATEGORY_CHANGED" | "EMPLOYEE_DEACTIVATED"
      >;
      referenceAt?: Date;
      linkLockAlreadyHeld?: boolean;
    },
  ): Promise<string[]> {
    const link = await companyUserEmployeeLinkRepository.findByEmployeeIdInTransaction(
      companyId,
      transaction,
      input.employeeId,
    );
    if (!link) {
      return [];
    }
    return this.revokeEffectiveForUserInTransaction(companyId, transaction, {
      userId: link.userId,
      actorUserId: input.actorUserId,
      reason: input.reason,
      referenceAt: input.referenceAt,
      linkLockAlreadyHeld: input.linkLockAlreadyHeld,
    });
  },

  async revokeForEmployeeCollaborator(
    companyId: string,
    employeeId: string,
    actorUserId: string | null,
    reason: Extract<
      ChargeAssignmentRevocationReason,
      "EMPLOYEE_CATEGORY_CHANGED" | "EMPLOYEE_DEACTIVATED"
    >,
  ): Promise<string[]> {
    const transaction = new sql.Transaction(getPool());
    await transaction.begin();
    try {
      const ids = await this.revokeForEmployeeCollaboratorInTransaction(companyId, transaction, {
        employeeId,
        actorUserId,
        reason,
      });
      await transaction.commit();
      return ids;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
