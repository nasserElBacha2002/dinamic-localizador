import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { absenceOperationalImpactRepository } from "../repositories/absence-operational-impact.repository";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import type { AbsenceOperationalResolutionCode } from "../types/absence-operational-impact";
import { rollbackTransactionSafely } from "../utils/sql-transaction";
import { auditService } from "./audit.service";
import { absenceOperationalImpactQueryService } from "./absence-operational-impact-query.service";
import { employeeAvailabilityService } from "./employee-availability.service";
import { operationAssignmentService } from "./operation-assignment.service";

const markResolvedWithAudit = async (input: {
  companyId: string;
  absenceRequestId: string;
  conflictId: string;
  existingStatus: string;
  resolutionCode: AbsenceOperationalResolutionCode;
  resolutionReason: string;
  resolvedByUserId: string;
  replacementEmployeeId?: string | null;
  status: "RESOLVED" | "DISMISSED";
}) => {
  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const updated = await absenceOperationalImpactRepository.resolveConflict(
      {
        companyId: input.companyId,
        absenceRequestId: input.absenceRequestId,
        conflictId: input.conflictId,
        status: input.status,
        resolutionCode: input.resolutionCode,
        resolutionReason: input.resolutionReason,
        resolvedByUserId: input.resolvedByUserId,
        replacementEmployeeId: input.replacementEmployeeId ?? null,
      },
      transaction,
    );
    if (!updated) {
      throw new AppError(409, "ABSENCE_OPERATIONAL_CONFLICT_RACE", "El conflicto ya fue resuelto");
    }
    await auditService.log(
      input.companyId,
      {
        userId: input.resolvedByUserId,
        action: "ABSENCE_OPERATIONAL_CONFLICT_RESOLVED",
        entityType: "absence_operational_conflict",
        entityId: input.conflictId,
        previousData: { status: input.existingStatus },
        newData: {
          status: updated.status,
          resolutionCode: updated.resolutionCode,
          replacementEmployeeId: input.replacementEmployeeId ?? null,
          absenceRequestId: input.absenceRequestId,
        },
      },
      transaction,
    );
    await transaction.commit();
    return updated;
  } catch (error) {
    return rollbackTransactionSafely(
      transaction,
      {
        operation: "absence-operational-conflict.resolve",
        companyId: input.companyId,
        entityId: input.conflictId,
      },
      error,
    );
  }
};

export const absenceOperationalConflictService = {
  async resolveConflict(
    companyId: string,
    absenceRequestId: string,
    conflictId: string,
    input: {
      resolutionCode: AbsenceOperationalResolutionCode;
      resolutionReason: string;
      replacementEmployeeId?: string | null;
      resolvedByUserId: string;
    },
  ) {
    if (!(await absenceOperationalImpactQueryService.isFeatureEnabled(companyId))) {
      throw new AppError(
        409,
        "ABSENCE_OPERATIONAL_INTEGRATION_DISABLED",
        "La integración operativa de ausencias no está habilitada",
      );
    }

    const existing = await absenceOperationalImpactRepository.findConflictById(
      companyId,
      absenceRequestId,
      conflictId,
    );
    if (!existing) {
      throw new AppError(404, "ABSENCE_OPERATIONAL_CONFLICT_NOT_FOUND", "Conflicto no encontrado");
    }
    if (existing.status !== "OPEN") {
      throw new AppError(409, "ABSENCE_OPERATIONAL_CONFLICT_NOT_OPEN", "El conflicto ya fue resuelto");
    }

    const request = await absenceRequestRepository.findById(companyId, absenceRequestId);
    if (!request) {
      throw new AppError(404, "ABSENCE_REQUEST_NOT_FOUND", "Solicitud de ausencia no encontrada");
    }

    if (input.resolutionCode === "ASSIGN_REPLACEMENT") {
      if (!input.replacementEmployeeId) {
        throw new AppError(
          400,
          "REPLACEMENT_REQUIRED",
          "Debe indicar un reemplazo para esta resolución",
        );
      }
      if (!existing.operationId || !existing.assignmentId) {
        throw new AppError(
          409,
          "ASSIGNMENT_CONTEXT_REQUIRED",
          "El conflicto no tiene asignación/operación para reemplazar",
        );
      }

      const original = await operationEmployeeRepository.findById(companyId, existing.assignmentId);
      if (!original || original.operationId !== existing.operationId) {
        throw new AppError(404, "OPERATION_ASSIGNMENT_NOT_FOUND", "La asignación afectada no existe");
      }

      const replacement = await employeeRepository.findById(companyId, input.replacementEmployeeId);
      if (!replacement?.active) {
        throw new AppError(409, "REPLACEMENT_INVALID", "El reemplazo no es válido o está inactivo");
      }

      const absentEmployee = await employeeRepository.findById(companyId, request.employeeId);
      if (
        absentEmployee?.categoryId &&
        replacement.categoryId &&
        absentEmployee.categoryId !== replacement.categoryId
      ) {
        throw new AppError(
          409,
          "REPLACEMENT_CATEGORY_MISMATCH",
          "El reemplazo no tiene la misma categoría que el colaborador ausente",
        );
      }

      const startAt = existing.rangeStartAt
        ? new Date(existing.rangeStartAt)
        : new Date(`${request.startDate}T00:00:00.000Z`);
      const endAt = existing.rangeEndAt
        ? new Date(existing.rangeEndAt)
        : new Date(`${request.endDate}T23:59:59.999Z`);
      const availability = await employeeAvailabilityService.getAvailabilityForInterval({
        companyId,
        employeeId: input.replacementEmployeeId,
        startAt,
        endAt,
      });
      if (availability.status !== "AVAILABLE") {
        throw new AppError(
          409,
          "REPLACEMENT_UNAVAILABLE",
          "El reemplazo no está disponible en el intervalo de la ausencia",
        );
      }

      await operationAssignmentService.assignEmployee(
        companyId,
        existing.operationId,
        input.replacementEmployeeId,
        {
          validFrom: original.validFrom,
          validUntil: original.validUntil,
        },
        input.resolvedByUserId,
      );

      return markResolvedWithAudit({
        companyId,
        absenceRequestId,
        conflictId,
        existingStatus: existing.status,
        resolutionCode: input.resolutionCode,
        resolutionReason: input.resolutionReason,
        resolvedByUserId: input.resolvedByUserId,
        replacementEmployeeId: input.replacementEmployeeId,
        status: "RESOLVED",
      });
    }

    if (input.resolutionCode === "CANCEL_ASSIGNMENT") {
      if (!existing.operationId || !existing.assignmentId) {
        throw new AppError(
          409,
          "ASSIGNMENT_CONTEXT_REQUIRED",
          "El conflicto no tiene asignación para cancelar",
        );
      }

      await operationAssignmentService.cancelAssignment(
        companyId,
        existing.operationId,
        existing.assignmentId,
        input.resolvedByUserId,
      );

      return markResolvedWithAudit({
        companyId,
        absenceRequestId,
        conflictId,
        existingStatus: existing.status,
        resolutionCode: input.resolutionCode,
        resolutionReason: input.resolutionReason,
        resolvedByUserId: input.resolvedByUserId,
        status: "RESOLVED",
      });
    }

    return markResolvedWithAudit({
      companyId,
      absenceRequestId,
      conflictId,
      existingStatus: existing.status,
      resolutionCode: input.resolutionCode,
      resolutionReason: input.resolutionReason,
      resolvedByUserId: input.resolvedByUserId,
      status: input.resolutionCode === "DISMISS_WITH_REASON" ? "DISMISSED" : "RESOLVED",
    });
  },
};
