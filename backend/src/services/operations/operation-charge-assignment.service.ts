import sql from "mssql";
import { AppError } from "../../errors/app-error";
import { getPool } from "../../database/connection";
import { operationRepository } from "../../repositories/operations/operation.repository";
import { operationChargeAssignmentRepository } from "../../repositories/operations/operation-charge-assignment.repository";
import { userCompanyMembershipRepository } from "../../repositories/companies/user-company-membership.repository";
import type { OperationChargeAssignment } from "../../types/operation-charge";
import {
  assertValidAssignmentDateRange,
  compareAssignmentDates,
} from "../../utils/operations/assignment-period";

const assertOperationExists = async (companyId: string, operationId: string): Promise<void> => {
  const operation = await operationRepository.findById(companyId, operationId);
  if (!operation) {
    throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada.");
  }
};

const assertActiveMembership = async (companyId: string, userId: string): Promise<void> => {
  const membership = await userCompanyMembershipRepository.findActiveMembership(userId, companyId);
  if (!membership) {
    throw new AppError(
      404,
      "MEMBERSHIP_NOT_FOUND",
      "El usuario no tiene una membresía activa en esta empresa.",
    );
  }
};

export const operationChargeAssignmentService = {
  async assign(
    companyId: string,
    actorUserId: string | null,
    input: {
      operationId: string;
      userId: string;
      validFrom: string;
      validUntil?: string | null;
    },
  ): Promise<OperationChargeAssignment> {
    const validUntil = input.validUntil ?? null;
    assertValidAssignmentDateRange(input.validFrom, validUntil);
    await assertOperationExists(companyId, input.operationId);
    await assertActiveMembership(companyId, input.userId);

    const transaction = new sql.Transaction(getPool());
    await transaction.begin();
    try {
      const created = await operationChargeAssignmentRepository.assignInTransaction(
        companyId,
        transaction,
        {
          operationId: input.operationId,
          userId: input.userId,
          validFrom: input.validFrom,
          validUntil,
          createdByUserId: actorUserId,
        },
      );
      await transaction.commit();
      return created;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async endAssignment(
    companyId: string,
    actorUserId: string | null,
    assignmentId: string,
    effectiveDate: string,
  ): Promise<OperationChargeAssignment> {
    const existing = await operationChargeAssignmentRepository.findById(companyId, assignmentId);
    if (!existing) {
      throw new AppError(404, "CHARGE_ASSIGNMENT_NOT_FOUND", "Asignación de encargado no encontrada.");
    }
    if (existing.cancelledAt) {
      throw new AppError(409, "CHARGE_ASSIGNMENT_CANCELLED", "La asignación ya fue cancelada.");
    }
    if (compareAssignmentDates(effectiveDate, existing.validFrom) < 0) {
      throw new AppError(
        400,
        "CHARGE_ASSIGNMENT_INVALID_END_DATE",
        "La fecha de fin no puede ser anterior al inicio de vigencia.",
      );
    }
    if (existing.validUntil && compareAssignmentDates(effectiveDate, existing.validUntil) >= 0) {
      throw new AppError(409, "CHARGE_ASSIGNMENT_ALREADY_ENDED", "La asignación ya finalizó.");
    }

    const transaction = new sql.Transaction(getPool());
    await transaction.begin();
    try {
      const updated = await operationChargeAssignmentRepository.endInTransaction(
        companyId,
        transaction,
        assignmentId,
        effectiveDate,
        actorUserId,
      );
      if (!updated) {
        throw new AppError(409, "CHARGE_ASSIGNMENT_END_CONFLICT", "No se pudo finalizar la asignación.");
      }
      await transaction.commit();
      return updated;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async cancelAssignment(
    companyId: string,
    actorUserId: string | null,
    assignmentId: string,
  ): Promise<OperationChargeAssignment> {
    if (!actorUserId) {
      throw new AppError(
        400,
        "CHARGE_ASSIGNMENT_ACTOR_REQUIRED",
        "Se requiere un usuario para registrar la cancelación.",
      );
    }
    const existing = await operationChargeAssignmentRepository.findById(companyId, assignmentId);
    if (!existing) {
      throw new AppError(404, "CHARGE_ASSIGNMENT_NOT_FOUND", "Asignación de encargado no encontrada.");
    }
    if (existing.cancelledAt) {
      throw new AppError(409, "CHARGE_ASSIGNMENT_CANCELLED", "La asignación ya fue cancelada.");
    }

    const transaction = new sql.Transaction(getPool());
    await transaction.begin();
    try {
      const updated = await operationChargeAssignmentRepository.cancelInTransaction(
        companyId,
        transaction,
        assignmentId,
        actorUserId,
      );
      if (!updated) {
        throw new AppError(409, "CHARGE_ASSIGNMENT_CANCEL_CONFLICT", "No se pudo cancelar la asignación.");
      }
      await transaction.commit();
      return updated;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async listByOperation(companyId: string, operationId: string): Promise<OperationChargeAssignment[]> {
    await assertOperationExists(companyId, operationId);
    return operationChargeAssignmentRepository.listByOperation(companyId, operationId);
  },

  async listByUser(companyId: string, userId: string): Promise<OperationChargeAssignment[]> {
    return operationChargeAssignmentRepository.listByUser(companyId, userId);
  },
};
