import sql from "mssql";
import { getPool } from "../database/connection";
import { WORK_TEAM_PREVIEW_TTL_MINUTES } from "../constants/work-team-assignment";
import type { WorkTeamAssignmentSkipReason } from "../constants/work-team-assignment";
import { AppError } from "../errors/app-error";
import { operationRepository } from "../repositories/operation.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { workTeamAssignmentBatchRepository } from "../repositories/work-team-assignment-batch.repository";
import { workTeamRepository } from "../repositories/work-team.repository";
import type {
  WorkTeamAssignConfirmInput,
  WorkTeamAssignPreviewInput,
} from "../schemas/work-team.schema";
import type { Employee } from "../types/domain";
import { isOperationAssignable } from "../utils/operation-status";
import { hashCombinedWorkTeamSnapshots, hashWorkTeamMembers } from "../utils/work-team-snapshot-hash";
import { auditService } from "./audit.service";
import { operationAssignmentCore } from "./operation-assignment-core.service";
import { operationWorkDateService } from "./operation-work-date.service";
import { recurringWorkdayMaterializationService } from "./recurring-workday-materialization.service";
import { recurringWorkdaySyncService } from "./recurring-workday-sync.service";

interface ResolvedTeamMember {
  workTeamId: string;
  workTeamName: string;
  workTeamUpdatedAt: string;
  membersSnapshotHash: string;
  employeeId: string;
  employee: Employee;
}

interface PreviewEmployeeEntry {
  employeeId: string;
  employee: Employee;
  workTeamIds: string[];
  reason?: WorkTeamAssignmentSkipReason;
}

const buildPreviewResponse = (
  operationId: string,
  previewToken: string,
  groups: Array<{
    workTeamId: string;
    workTeamName: string;
    updatedAt: string;
    members: Employee[];
  }>,
  assignableEmployees: PreviewEmployeeEntry[],
  skippedEmployees: PreviewEmployeeEntry[],
  validFrom: string,
  validUntil: string | null,
) => {
  const requestedMemberships = groups.reduce((sum, group) => sum + group.members.length, 0);
  const uniqueEmployees = new Set([
    ...assignableEmployees.map((entry) => entry.employeeId),
    ...skippedEmployees.map((entry) => entry.employeeId),
  ]).size;

  return {
    operationId,
    previewToken,
    validFrom,
    validUntil,
    groups,
    assignableEmployees: assignableEmployees.map((entry) => ({
      employeeId: entry.employeeId,
      employee: entry.employee,
      workTeamIds: entry.workTeamIds,
    })),
    skippedEmployees: skippedEmployees.map((entry) => ({
      employeeId: entry.employeeId,
      employee: entry.employee,
      workTeamIds: entry.workTeamIds,
      reason: entry.reason!,
    })),
    summary: {
      requestedMemberships,
      uniqueEmployees,
      assignable: assignableEmployees.length,
      skipped: skippedEmployees.length,
    },
  };
};

const loadTeamsForAssignment = async (companyId: string, workTeamIds: string[]) => {
  const uniqueIds = [...new Set(workTeamIds)];
  const teams = await workTeamRepository.listByIds(companyId, uniqueIds);
  if (teams.length !== uniqueIds.length) {
    throw new AppError(404, "WORK_TEAM_NOT_FOUND", "Grupo de trabajo no encontrado");
  }

  const inactive = teams.filter((team) => !team.isActive);
  if (inactive.length > 0) {
    throw new AppError(409, "WORK_TEAM_INACTIVE", "Uno o más grupos están inactivos");
  }

  return teams;
};

const resolveTeamMembers = async (
  companyId: string,
  workTeamIds: string[],
): Promise<ResolvedTeamMember[]> => {
  const members = await workTeamRepository.listMembersForTeams(companyId, workTeamIds);
  const teams = await workTeamRepository.listByIds(companyId, workTeamIds);
  const teamById = new Map(teams.map((team) => [team.id, team]));

  return members
    .filter((member) => member.employee)
    .map((member) => {
      const team = teamById.get(member.workTeamId)!;
      const employeeIds = members
        .filter((item) => item.workTeamId === member.workTeamId)
        .map((item) => item.employeeId);
      return {
        workTeamId: member.workTeamId,
        workTeamName: team.name,
        workTeamUpdatedAt: team.updatedAt,
        membersSnapshotHash: hashWorkTeamMembers(employeeIds),
        employeeId: member.employeeId,
        employee: member.employee!,
      };
    });
};

const classifyPreviewEmployees = (
  resolvedMembers: ResolvedTeamMember[],
  existingAssignments: Array<{ employeeId: string; validFrom: string; validUntil: string | null }>,
  validFrom: string,
  validUntil: string | null,
) => {
  const byEmployee = new Map<string, PreviewEmployeeEntry>();
  const assignableEmployees: PreviewEmployeeEntry[] = [];
  const skippedEmployees: PreviewEmployeeEntry[] = [];

  for (const member of resolvedMembers) {
    const existing = byEmployee.get(member.employeeId);
    if (existing) {
      existing.workTeamIds.push(member.workTeamId);
      if (!existing.reason) {
        existing.reason = "duplicate_in_request";
        skippedEmployees.push(existing);
        const assignableIndex = assignableEmployees.findIndex(
          (entry) => entry.employeeId === member.employeeId,
        );
        if (assignableIndex >= 0) {
          assignableEmployees.splice(assignableIndex, 1);
        }
      }
      continue;
    }

    const entry: PreviewEmployeeEntry = {
      employeeId: member.employeeId,
      employee: member.employee,
      workTeamIds: [member.workTeamId],
    };

    if (!member.employee.active) {
      entry.reason = "employee_inactive";
      skippedEmployees.push(entry);
    } else {
      const overlap = existingAssignments.find((assignment) => assignment.employeeId === member.employeeId);
      if (overlap) {
        if (overlap.validFrom === validFrom && overlap.validUntil === validUntil) {
          entry.reason = "already_assigned";
        } else {
          entry.reason = "assignment_period_overlap";
        }
        skippedEmployees.push(entry);
      } else {
        assignableEmployees.push(entry);
      }
    }

    byEmployee.set(member.employeeId, entry);
  }

  return { assignableEmployees, skippedEmployees, byEmployee };
};

export const workTeamAssignmentService = {
  async preview(
    companyId: string,
    operationId: string,
    userId: string | null,
    input: WorkTeamAssignPreviewInput,
  ) {
    const operation = await operationRepository.findById(companyId, operationId);
    if (!operation) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }
    if (!isOperationAssignable(operation.status)) {
      throw new AppError(
        409,
        "OPERATION_NOT_ASSIGNABLE",
        "No se puede asignar empleados a operaciones canceladas o completadas",
      );
    }

    const operationKind = operation.operationKind ?? "ONE_TIME";
    const operationWorkDate =
      operationKind === "ONE_TIME"
        ? await operationWorkDateService.resolveOperationWorkDate(companyId, operationId)
        : null;

    const { validFrom, validUntil } = operationAssignmentCore.resolveValidity(
      operationKind,
      operationWorkDate,
      input,
    );

    const teams = await loadTeamsForAssignment(companyId, input.workTeamIds);
    const resolvedMembers = await resolveTeamMembers(companyId, input.workTeamIds);
    const existingAssignments = await operationEmployeeRepository.listByOperation(companyId, operationId);
    const { assignableEmployees, skippedEmployees } = classifyPreviewEmployees(
      resolvedMembers,
      existingAssignments.map((assignment) => ({
        employeeId: assignment.employeeId,
        validFrom: assignment.validFrom,
        validUntil: assignment.validUntil,
      })),
      validFrom,
      validUntil,
    );

    const teamSnapshots = teams.map((team) => {
      const employeeIds = resolvedMembers
        .filter((member) => member.workTeamId === team.id)
        .map((member) => member.employeeId);
      return {
        workTeamId: team.id,
        workTeamName: team.name,
        updatedAt: team.updatedAt,
        membersSnapshotHash: hashWorkTeamMembers(employeeIds),
        members: resolvedMembers
          .filter((member) => member.workTeamId === team.id)
          .map((member) => member.employee),
      };
    });

    const membersSnapshotHash = hashCombinedWorkTeamSnapshots(
      teamSnapshots.map((snapshot) => snapshot.membersSnapshotHash),
    );

    const previewExpiresAt = new Date(Date.now() + WORK_TEAM_PREVIEW_TTL_MINUTES * 60 * 1000);
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const batch = await workTeamAssignmentBatchRepository.createPreviewInTransaction(transaction, {
        companyId,
        operationId,
        requestedBy: userId,
        validFrom,
        validUntil,
        previewExpiresAt,
        membersSnapshotHash,
      });

      for (const snapshot of teamSnapshots) {
        await workTeamAssignmentBatchRepository.addBatchTeamInTransaction(transaction, {
          batchId: batch.id,
          workTeamId: snapshot.workTeamId,
          workTeamNameSnapshot: snapshot.workTeamName,
          workTeamUpdatedAtSnapshot: snapshot.updatedAt,
          membersSnapshotHash: snapshot.membersSnapshotHash,
        });
      }

      await transaction.commit();

      return buildPreviewResponse(
        operationId,
        batch.id,
        teamSnapshots.map((snapshot) => ({
          workTeamId: snapshot.workTeamId,
          workTeamName: snapshot.workTeamName,
          updatedAt: snapshot.updatedAt,
          members: snapshot.members,
        })),
        assignableEmployees,
        skippedEmployees,
        validFrom,
        validUntil,
      );
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async confirm(
    companyId: string,
    operationId: string,
    userId: string | null,
    input: WorkTeamAssignConfirmInput,
  ) {
    const operation = await operationRepository.findById(companyId, operationId);
    if (!operation) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }
    if (!isOperationAssignable(operation.status)) {
      throw new AppError(
        409,
        "OPERATION_NOT_ASSIGNABLE",
        "No se puede asignar empleados a operaciones canceladas o completadas",
      );
    }

    const operationKind = operation.operationKind ?? "ONE_TIME";
    const operationWorkDate =
      operationKind === "ONE_TIME"
        ? await operationWorkDateService.resolveOperationWorkDate(companyId, operationId)
        : null;

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const batch = await workTeamAssignmentBatchRepository.findByIdForUpdate(
        companyId,
        input.previewToken,
        transaction,
      );
      if (!batch || batch.operationId !== operationId) {
        throw new AppError(404, "WORK_TEAM_BATCH_NOT_FOUND", "La previsualización no existe");
      }

      if (batch.status === "COMPLETED") {
        await transaction.commit();
        return this.getBatchDetail(companyId, batch.id);
      }

      if (batch.status !== "PREVIEWED") {
        throw new AppError(409, "WORK_TEAM_BATCH_INVALID", "La previsualización no está disponible");
      }

      if (batch.previewExpiresAt && new Date(batch.previewExpiresAt) < new Date()) {
        throw new AppError(409, "WORK_TEAM_PREVIEW_EXPIRED", "La previsualización expiró");
      }

      const batchTeams = await workTeamAssignmentBatchRepository.listBatchTeams(companyId, batch.id);
      const currentTeams = await workTeamRepository.listByIds(
        companyId,
        batchTeams.map((team) => team.workTeamId),
      );
      const currentTeamById = new Map(currentTeams.map((team) => [team.id, team]));

      for (const snapshot of batchTeams) {
        const current = currentTeamById.get(snapshot.workTeamId);
        if (!current || !current.isActive) {
          throw new AppError(409, "WORK_TEAM_INACTIVE", "Uno o más grupos están inactivos");
        }
        const currentMembers = await workTeamRepository.listMembers(companyId, snapshot.workTeamId);
        const currentHash = hashWorkTeamMembers(currentMembers.map((member) => member.employeeId));
        if (
          current.updatedAt !== snapshot.workTeamUpdatedAtSnapshot ||
          currentHash !== snapshot.membersSnapshotHash
        ) {
          throw new AppError(
            409,
            "WORK_TEAM_PREVIEW_STALE",
            "La composición del grupo cambió desde la previsualización",
          );
        }
      }

      const resolvedMembers = await resolveTeamMembers(
        companyId,
        batchTeams.map((team) => team.workTeamId),
      );
      const existingAssignments = await operationEmployeeRepository.listByOperation(companyId, operationId);
      const { assignableEmployees, skippedEmployees } = classifyPreviewEmployees(
        resolvedMembers,
        existingAssignments.map((assignment) => ({
          employeeId: assignment.employeeId,
          validFrom: assignment.validFrom,
          validUntil: assignment.validUntil,
        })),
        batch.validFrom!,
        batch.validUntil,
      );

      const addedEmployees: Array<{
        employeeId: string;
        assignmentId: string;
        workTeamId: string | null;
      }> = [];
      const skippedResults: Array<{
        employeeId: string;
        reason: WorkTeamAssignmentSkipReason;
        workTeamId: string | null;
      }> = [];

      for (const skipped of skippedEmployees) {
        await workTeamAssignmentBatchRepository.addBatchItemInTransaction(transaction, {
          batchId: batch.id,
          workTeamId: skipped.workTeamIds[0] ?? null,
          employeeId: skipped.employeeId,
          operationAssignmentId: null,
          result: "SKIPPED",
          reason: skipped.reason ?? "duplicate_in_request",
        });
        skippedResults.push({
          employeeId: skipped.employeeId,
          reason: skipped.reason ?? "duplicate_in_request",
          workTeamId: skipped.workTeamIds[0] ?? null,
        });
      }

      for (const entry of assignableEmployees) {
        const primaryTeamId = entry.workTeamIds[0] ?? null;
        const result = await operationAssignmentCore.assignEmployeeInTransaction(
          companyId,
          transaction,
          {
            operationId,
            employeeId: entry.employeeId,
            validFrom: batch.validFrom!,
            validUntil: batch.validUntil,
            employeeActive: entry.employee.active,
            operationKind,
            operationWorkDate,
            sourceAssignmentBatchId: batch.id,
            sourceWorkTeamId: primaryTeamId,
          },
        );

        if (result.outcome === "added") {
          await workTeamAssignmentBatchRepository.addBatchItemInTransaction(transaction, {
            batchId: batch.id,
            workTeamId: primaryTeamId,
            employeeId: entry.employeeId,
            operationAssignmentId: result.assignment.id,
            result: "ADDED",
            reason: null,
          });
          addedEmployees.push({
            employeeId: entry.employeeId,
            assignmentId: result.assignment.id,
            workTeamId: primaryTeamId,
          });
        } else {
          await workTeamAssignmentBatchRepository.addBatchItemInTransaction(transaction, {
            batchId: batch.id,
            workTeamId: primaryTeamId,
            employeeId: entry.employeeId,
            operationAssignmentId: result.existingAssignmentId ?? null,
            result: "SKIPPED",
            reason: result.reason,
          });
          skippedResults.push({
            employeeId: entry.employeeId,
            reason: result.reason,
            workTeamId: primaryTeamId,
          });
        }
      }

      await workTeamAssignmentBatchRepository.markCompletedInTransaction(transaction, batch.id);
      await transaction.commit();

      if (operationKind === "RECURRING") {
        await recurringWorkdaySyncService.runOperationSync(
          companyId,
          operationId,
          () => recurringWorkdayMaterializationService.materializeOperationHorizon(companyId, operationId),
          "recurring work team batch assignment",
        );
      }

      await auditService.log(companyId, {
        entityType: "work_team_assignment_batch",
        entityId: batch.id,
        action: "confirm",
        newData: {
          operationId,
          added: addedEmployees.length,
          skipped: skippedResults.length,
        },
        userId,
      });

      return {
        batchId: batch.id,
        operationId,
        addedEmployees,
        skippedEmployees: skippedResults,
        summary: {
          requested: assignableEmployees.length + skippedEmployees.length,
          added: addedEmployees.length,
          skipped: skippedResults.length,
        },
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async getBatchDetail(companyId: string, batchId: string) {
    const batch = await workTeamAssignmentBatchRepository.findById(companyId, batchId);
    if (!batch) {
      throw new AppError(404, "WORK_TEAM_BATCH_NOT_FOUND", "El batch no existe");
    }

    const teams = await workTeamAssignmentBatchRepository.listBatchTeams(companyId, batchId);
    const items = await workTeamAssignmentBatchRepository.listBatchItems(companyId, batchId);
    const operation = await operationRepository.findById(companyId, batch.operationId);

    return {
      batch,
      operation: operation
        ? {
            id: operation.id,
            status: operation.status,
            operationKind: operation.operationKind,
          }
        : null,
      teams,
      items,
      summary: {
        added: items.filter((item) => item.result === "ADDED").length,
        skipped: items.filter((item) => item.result === "SKIPPED").length,
      },
    };
  },
};
