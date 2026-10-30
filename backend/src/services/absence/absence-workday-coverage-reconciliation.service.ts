import sql from "mssql";
import { AppError } from "../../errors/app-error";
import { absenceOperationalImpactRepository } from "../../repositories/absence/absence-operational-impact.repository";

import { replacementRequestService } from "../replacement-request.service";

export type SyncAbsenceCoverageInTransactionInput = {
  companyId: string;
  transaction: sql.Transaction;
  absenceRequestId: string;
  absenceConflictId?: string | null;
  employeeWorkdayId?: string | null;
  replacementEmployeeId: string;
  replacedAssignmentId: string;
  absentEmployeeId: string;
  coverageCommandId: string;
  resolvedByUserId: string | null;
  resolutionReason: string;
};

const buildCoverageResolutionCommandId = (input: {
  conflictId: string;
  replacementEmployeeId: string;
  coverageCommandId: string;
}): string =>
  `${input.coverageCommandId}:${input.conflictId}:${input.replacementEmployeeId}`.slice(0, 120);

export const absenceWorkdayCoverageReconciliationService = {
  async syncAfterCoverageInTransaction(
    input: SyncAbsenceCoverageInTransactionInput,
  ): Promise<void> {
    const clientCommandId = input.coverageCommandId.trim();
    if (clientCommandId.length < 8) {
      throw new AppError(
        400,
        "COVERAGE_COMMAND_ID_REQUIRED",
        "coverageCommandId es obligatorio para reconciliar la cobertura",
      );
    }

    const conflictRows = await new sql.Request(input.transaction)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("absenceRequestId", sql.UniqueIdentifier, input.absenceRequestId)
      .input("replacedAssignmentId", sql.UniqueIdentifier, input.replacedAssignmentId)
      .input(
        "employeeWorkdayId",
        sql.UniqueIdentifier,
        input.employeeWorkdayId ?? null,
      )
      .input("absenceConflictId", sql.UniqueIdentifier, input.absenceConflictId ?? null)
      .query(`
        SELECT id
        FROM absence_operational_conflicts
        WHERE company_id = @companyId
          AND absence_request_id = @absenceRequestId
          AND status = N'OPEN'
          AND conflict_type = N'ASSIGNMENT_DURING_ABSENCE'
          AND (
            (@absenceConflictId IS NOT NULL AND id = @absenceConflictId)
            OR (
              assignment_id = @replacedAssignmentId
              OR (@employeeWorkdayId IS NOT NULL AND employee_workday_id = @employeeWorkdayId)
            )
          )
      `);
    const conflictIds = new Set<string>();
    for (const row of conflictRows.recordset) {
      if (row.id) {
        conflictIds.add(String(row.id));
      }
    }

    for (const id of conflictIds) {
      const resolutionCommandId = buildCoverageResolutionCommandId({
        conflictId: id,
        replacementEmployeeId: input.replacementEmployeeId,
        coverageCommandId: clientCommandId,
      });

      const updated = await absenceOperationalImpactRepository.resolveConflict(
        {
          companyId: input.companyId,
          absenceRequestId: input.absenceRequestId,
          conflictId: id,
          status: "RESOLVED",
          resolutionCode: "ASSIGN_REPLACEMENT",
          resolutionReason: input.resolutionReason,
          resolvedByUserId: input.resolvedByUserId ?? input.replacementEmployeeId,
          replacementEmployeeId: input.replacementEmployeeId,
          resolutionCommandId,
        },
        input.transaction,
      );
      if (!updated) {
        const existing = await absenceOperationalImpactRepository.findConflictForUpdate(
          input.companyId,
          input.absenceRequestId,
          id,
          input.transaction,
        );
        if (
          existing?.status === "OPEN" &&
          existing.resolutionCommandId !== resolutionCommandId
        ) {
          throw new AppError(
            409,
            "ABSENCE_OPERATIONAL_CONFLICT_RACE",
            "No se pudo reconciliar el conflicto de ausencia tras la cobertura",
          );
        }
      }
    }

    if (input.employeeWorkdayId) {
      await replacementRequestService.markCoveredForAbsentWorkdayInTransaction(
        input.companyId,
        input.transaction,
        {
          absentEmployeeWorkdayId: input.employeeWorkdayId,
          absentEmployeeId: input.absentEmployeeId,
          replacementEmployeeId: input.replacementEmployeeId,
        },
      );
    }
  },
};
