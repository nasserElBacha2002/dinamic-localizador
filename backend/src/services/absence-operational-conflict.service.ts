import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { absenceOperationalImpactRepository } from "../repositories/absence-operational-impact.repository";
import { absenceRequestRepository } from "../repositories/absence-request.repository";
import { employeeDeactivationRepository } from "../repositories/employee-deactivation.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationRepository } from "../repositories/operation.repository";
import {
  buildResolutionCommandId,
  type AbsenceOperationalResolutionCode,
} from "../types/absence-operational-impact";
import { rollbackTransactionSafely } from "../utils/sql-transaction";
import { isDuplicateKeyError } from "../utils/sql-server-errors";
import { auditService } from "./audit.service";
import { absenceOperationalImpactQueryService } from "./absence-operational-impact-query.service";
import { employeeAvailabilityService } from "./employee-availability.service";
import { operationAssignmentCore } from "./operation-assignment-core.service";
import { operationAssignmentService } from "./operation-assignment.service";
import { operationWorkDateService } from "./operation-work-date.service";

/** Test-only failure points for transactional atomicity evidence (Phase 5). */
export type ResolveConflictFailurePoint =
  | "after_assignment_created"
  | "before_resolve_conflict"
  | "after_resolve_conflict"
  | "before_audit"
  | "during_audit";

let resolveConflictFailurePoint: ResolveConflictFailurePoint | null = null;

export const __setResolveConflictFailurePointForTests = (
  point: ResolveConflictFailurePoint | null,
): void => {
  resolveConflictFailurePoint = point;
};

const maybeInjectResolveFailure = (point: ResolveConflictFailurePoint): void => {
  if (resolveConflictFailurePoint === point) {
    throw new Error(`INJECTED_FAILURE:${point}`);
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
      commandId?: string | null;
    },
  ) {
    if (!(await absenceOperationalImpactQueryService.isFeatureEnabled(companyId))) {
      throw new AppError(
        409,
        "ABSENCE_OPERATIONAL_INTEGRATION_DISABLED",
        "La integración operativa de ausencias no está habilitada",
      );
    }

    const clientCommandId = input.commandId?.trim();
    if (!clientCommandId || clientCommandId.length < 8) {
      throw new AppError(
        400,
        "RESOLUTION_COMMAND_ID_REQUIRED",
        "commandId es obligatorio para resolver el conflicto",
      );
    }

    /** @deprecated fallback kept only for documentation; client commandId is required above */
    const resolutionCommandId = buildResolutionCommandId({
      conflictId,
      resolutionCode: input.resolutionCode,
      replacementEmployeeId: input.replacementEmployeeId,
      commandId: clientCommandId,
    });

    const priorByCommand =
      await absenceOperationalImpactRepository.findConflictByResolutionCommandId(
        companyId,
        resolutionCommandId,
      );
    if (priorByCommand) {
      if (priorByCommand.id !== conflictId || priorByCommand.absenceRequestId !== absenceRequestId) {
        throw new AppError(
          409,
          "RESOLUTION_COMMAND_CONFLICT",
          "El commandId ya fue usado en otra resolución",
        );
      }
      return priorByCommand;
    }

    const request = await absenceRequestRepository.findById(companyId, absenceRequestId);
    if (!request) {
      throw new AppError(404, "ABSENCE_REQUEST_NOT_FOUND", "Solicitud de ausencia no encontrada");
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const existing = await absenceOperationalImpactRepository.findConflictForUpdate(
        companyId,
        absenceRequestId,
        conflictId,
        transaction,
      );
      if (!existing) {
        throw new AppError(404, "ABSENCE_OPERATIONAL_CONFLICT_NOT_FOUND", "Conflicto no encontrado");
      }
      if (existing.status !== "OPEN") {
        if (
          existing.resolutionCommandId === resolutionCommandId &&
          (existing.status === "RESOLVED" || existing.status === "DISMISSED")
        ) {
          await transaction.commit();
          return existing;
        }
        throw new AppError(
          409,
          existing.resolutionCommandId && existing.resolutionCommandId !== resolutionCommandId
            ? "RESOLUTION_COMMAND_CONFLICT"
            : "ABSENCE_OPERATIONAL_CONFLICT_NOT_OPEN",
          existing.resolutionCommandId && existing.resolutionCommandId !== resolutionCommandId
            ? "El conflicto ya fue resuelto con otro commandId"
            : "El conflicto ya fue resuelto",
        );
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

        const operation = await operationRepository.findById(companyId, existing.operationId);
        if (!operation) {
          throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
        }

        const original = await operationEmployeeRepository.findByIdInTransaction(
          companyId,
          transaction,
          existing.assignmentId,
        );
        if (!original || original.operationId !== existing.operationId) {
          throw new AppError(
            404,
            "OPERATION_ASSIGNMENT_NOT_FOUND",
            "La asignación afectada no existe",
          );
        }
        if (original.cancelledAt) {
          throw new AppError(
            409,
            "ASSIGNMENT_ALREADY_CANCELLED",
            "La asignación afectada ya está cancelada",
          );
        }

        const lockedReplacement = await employeeDeactivationRepository.lockEmployeeForUpdate(
          companyId,
          input.replacementEmployeeId,
          transaction,
        );
        if (!lockedReplacement?.active) {
          throw new AppError(409, "REPLACEMENT_INVALID", "El reemplazo no es válido o está inactivo");
        }

        const absentEmployee = await employeeRepository.findById(companyId, request.employeeId);
        const replacement = await employeeRepository.findById(
          companyId,
          input.replacementEmployeeId,
        );
        if (
          absentEmployee?.categoryId &&
          replacement?.categoryId &&
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

        const operationWorkDate = await operationWorkDateService.resolveOperationWorkDate(
          companyId,
          existing.operationId,
        );
        const { validFrom, validUntil } = operationAssignmentCore.resolveValidity(
          operation.operationKind ?? "ONE_TIME",
          operationWorkDate,
          {
            validFrom: original.validFrom,
            validUntil: original.validUntil,
          },
        );

        const assignResult = await operationAssignmentCore.assignEmployeeInTransaction(
          companyId,
          transaction,
          {
            operationId: existing.operationId,
            employeeId: input.replacementEmployeeId,
            validFrom,
            validUntil,
            employeeActive: lockedReplacement.active,
            operationKind: operation.operationKind ?? "ONE_TIME",
            operationWorkDate,
          },
        );

        if (assignResult.outcome === "skipped") {
          if (
            assignResult.reason === "already_assigned" &&
            assignResult.existingAssignmentId
          ) {
            // Idempotent retry: replacement already assigned for equivalent period.
          } else if (
            assignResult.reason === "already_assigned" ||
            assignResult.reason === "assignment_period_overlap"
          ) {
            throw new AppError(
              409,
              "ASSIGNMENT_PERIOD_OVERLAP",
              "El reemplazo ya tiene una asignación que se superpone con esas fechas",
            );
          } else {
            throw new AppError(
              409,
              "REPLACEMENT_INVALID",
              "No se pudo asignar el reemplazo",
            );
          }
        }

        maybeInjectResolveFailure("after_assignment_created");
      }

      if (input.resolutionCode === "CANCEL_ASSIGNMENT") {
        if (!existing.operationId || !existing.assignmentId) {
          throw new AppError(
            409,
            "ASSIGNMENT_CONTEXT_REQUIRED",
            "El conflicto no tiene asignación para cancelar",
          );
        }

        await operationAssignmentService.cancelAssignmentInSharedTransaction(
          companyId,
          transaction,
          {
            operationId: existing.operationId,
            assignmentId: existing.assignmentId,
          },
        );
      }

      const status =
        input.resolutionCode === "DISMISS_WITH_REASON" ? ("DISMISSED" as const) : ("RESOLVED" as const);

      maybeInjectResolveFailure("before_resolve_conflict");

      const updated = await absenceOperationalImpactRepository.resolveConflict(
        {
          companyId,
          absenceRequestId,
          conflictId,
          status,
          resolutionCode: input.resolutionCode,
          resolutionReason: input.resolutionReason,
          resolvedByUserId: input.resolvedByUserId,
          replacementEmployeeId: input.replacementEmployeeId ?? null,
          resolutionCommandId,
        },
        transaction,
      );
      if (!updated) {
        throw new AppError(409, "ABSENCE_OPERATIONAL_CONFLICT_RACE", "El conflicto ya fue resuelto");
      }

      maybeInjectResolveFailure("after_resolve_conflict");
      maybeInjectResolveFailure("before_audit");

      await auditService.log(
        companyId,
        {
          userId: input.resolvedByUserId,
          action: "ABSENCE_OPERATIONAL_CONFLICT_RESOLVED",
          entityType: "absence_operational_conflict",
          entityId: conflictId,
          previousData: { status: existing.status },
          newData: {
            status: updated.status,
            resolutionCode: updated.resolutionCode,
            replacementEmployeeId: input.replacementEmployeeId ?? null,
            resolutionCommandId,
            absenceRequestId,
          },
        },
        transaction,
      );

      maybeInjectResolveFailure("during_audit");

      await transaction.commit();
      return updated;
    } catch (error) {
      try {
        await rollbackTransactionSafely(
          transaction,
          {
            operation: "absence-operational-conflict.resolve",
            companyId,
            entityId: conflictId,
          },
          error,
        );
      } catch (rolledError) {
        if (isDuplicateKeyError(rolledError) || isDuplicateKeyError(error)) {
          const byCommand =
            await absenceOperationalImpactRepository.findConflictByResolutionCommandId(
              companyId,
              resolutionCommandId,
            );
          if (
            byCommand &&
            byCommand.id === conflictId &&
            byCommand.absenceRequestId === absenceRequestId
          ) {
            return byCommand;
          }
          throw new AppError(
            409,
            "RESOLUTION_COMMAND_CONFLICT",
            "El commandId ya fue usado en otra resolución",
          );
        }
        throw rolledError;
      }
      throw error;
    }
  },
};
