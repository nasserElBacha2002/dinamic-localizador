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
import type { Employee, OperationEmployeeAssignment } from "../types/domain";
import type { WorkTeam, WorkTeamMember } from "../types/work-team";
import { assignmentPeriodsOverlap } from "../utils/assignment-period";
import { logAuditSafe } from "../utils/audit-post-commit";
import { isOperationAssignable } from "../utils/operation-status";
import { safeRollback } from "../utils/safe-transaction";
import { hashCombinedWorkTeamSnapshots, hashWorkTeamMembers } from "../utils/work-team-snapshot-hash";
import { auditService } from "./audit.service";
import { operationAssignmentCore } from "./operation-assignment-core.service";
import { operationWorkDateService } from "./operation-work-date.service";
import { recurringWorkdayMaterializationService } from "./recurring-workday-materialization.service";
import { recurringWorkdaySyncService } from "./recurring-workday-sync.service";

interface PreviewEmployeeEntry {
  employeeId: string;
  employee: Employee;
  workTeamIds: string[];
  primaryWorkTeamId: string;
  reason?: WorkTeamAssignmentSkipReason;
}

interface TeamSnapshot {
  workTeamId: string;
  workTeamName: string;
  updatedAt: string;
  assignmentVersion: number;
  membersSnapshotHash: string;
  members: Employee[];
}

const choosePrimaryWorkTeamId = (workTeamIds: string[]): string =>
  [...workTeamIds].sort((left, right) => left.localeCompare(right))[0]!;

const buildMembersByTeam = (members: WorkTeamMember[]): Map<string, WorkTeamMember[]> => {
  const byTeam = new Map<string, WorkTeamMember[]>();
  for (const member of members) {
    const list = byTeam.get(member.workTeamId) ?? [];
    list.push(member);
    byTeam.set(member.workTeamId, list);
  }
  return byTeam;
};

const buildTeamSnapshots = (
  teams: WorkTeam[],
  membersByTeam: Map<string, WorkTeamMember[]>,
): TeamSnapshot[] =>
  teams.map((team) => {
    const teamMembers = membersByTeam.get(team.id) ?? [];
    const employeeIds = teamMembers.map((member) => member.employeeId);
    return {
      workTeamId: team.id,
      workTeamName: team.name,
      updatedAt: team.updatedAt,
      assignmentVersion: team.assignmentVersion ?? 0,
      membersSnapshotHash: hashWorkTeamMembers(employeeIds),
      members: teamMembers
        .filter((member) => member.employee)
        .map((member) => member.employee!),
    };
  });

const classifyEmployeeAgainstAssignments = (
  employee: Employee,
  workTeamIds: string[],
  existingAssignments: OperationEmployeeAssignment[],
  validFrom: string,
  validUntil: string | null,
): PreviewEmployeeEntry => {
  const entry: PreviewEmployeeEntry = {
    employeeId: employee.id,
    employee,
    workTeamIds,
    primaryWorkTeamId: choosePrimaryWorkTeamId(workTeamIds),
  };

  if (!employee.active) {
    entry.reason = "employee_inactive";
    return entry;
  }

  for (const assignment of existingAssignments) {
    if (assignment.employeeId !== employee.id || assignment.cancelledAt) {
      continue;
    }

    const conflict = assignmentPeriodsOverlap({
      existing: assignment,
      requested: { validFrom, validUntil },
    });

    if (conflict === "already_assigned") {
      entry.reason = "already_assigned";
      return entry;
    }
    if (conflict === "assignment_period_overlap") {
      entry.reason = "assignment_period_overlap";
      return entry;
    }
  }

  return entry;
};

export const classifyPreviewEmployees = (
  membersByTeam: Map<string, WorkTeamMember[]>,
  workTeamIds: string[],
  existingAssignments: OperationEmployeeAssignment[],
  validFrom: string,
  validUntil: string | null,
): { assignableEmployees: PreviewEmployeeEntry[]; skippedEmployees: PreviewEmployeeEntry[] } => {
  const membershipByEmployee = new Map<string, Set<string>>();

  for (const workTeamId of workTeamIds) {
    for (const member of membersByTeam.get(workTeamId) ?? []) {
      if (!member.employee) {
        continue;
      }
      const teams = membershipByEmployee.get(member.employeeId) ?? new Set<string>();
      teams.add(workTeamId);
      membershipByEmployee.set(member.employeeId, teams);
    }
  }

  const assignableEmployees: PreviewEmployeeEntry[] = [];
  const skippedEmployees: PreviewEmployeeEntry[] = [];

  for (const [employeeId, teamSet] of membershipByEmployee) {
    const workTeamIdList = [...teamSet];
    const firstMember = workTeamIdList
      .flatMap((teamId) => membersByTeam.get(teamId) ?? [])
      .find((member) => member.employeeId === employeeId);

    if (!firstMember?.employee) {
      continue;
    }

    const entry = classifyEmployeeAgainstAssignments(
      firstMember.employee,
      workTeamIdList,
      existingAssignments,
      validFrom,
      validUntil,
    );

    if (entry.reason) {
      skippedEmployees.push(entry);
    } else {
      assignableEmployees.push(entry);
    }
  }

  return { assignableEmployees, skippedEmployees };
};

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

export const buildAssignmentConfirmationResponse = async (
  companyId: string,
  batchId: string,
) => {
  const batch = await workTeamAssignmentBatchRepository.findById(companyId, batchId);
  if (!batch) {
    throw new AppError(404, "WORK_TEAM_BATCH_NOT_FOUND", "La previsualización no existe");
  }

  const items = await workTeamAssignmentBatchRepository.listBatchItems(companyId, batchId);
  const sources = await workTeamAssignmentBatchRepository.listBatchItemSources(companyId, batchId);
  const sourcesByItem = new Map<string, string[]>();
  for (const source of sources) {
    const list = sourcesByItem.get(source.batchItemId) ?? [];
    list.push(source.workTeamId);
    sourcesByItem.set(source.batchItemId, list);
  }

  const addedEmployees = items
    .filter((item) => item.result === "ADDED")
    .map((item) => ({
      employeeId: item.employeeId,
      assignmentId: item.operationAssignmentId!,
      workTeamId: item.workTeamId,
      workTeamIds: sourcesByItem.get(item.id) ?? (item.workTeamId ? [item.workTeamId] : []),
    }));

  const skippedEmployees = items
    .filter((item) => item.result === "SKIPPED")
    .map((item) => ({
      employeeId: item.employeeId,
      reason: item.reason!,
      workTeamId: item.workTeamId,
      workTeamIds: sourcesByItem.get(item.id) ?? (item.workTeamId ? [item.workTeamId] : []),
    }));

  return {
    batchId: batch.id,
    operationId: batch.operationId,
    addedEmployees,
    skippedEmployees,
    summary: {
      requested: items.length,
      added: addedEmployees.length,
      skipped: skippedEmployees.length,
    },
  };
};

const assertBatchOwnership = (
  batch: { requestedBy: string | null },
  userId: string | null,
): void => {
  if (batch.requestedBy && userId && batch.requestedBy !== userId) {
    throw new AppError(404, "WORK_TEAM_BATCH_NOT_FOUND", "La previsualización no existe");
  }
};

const validateBatchTeamsAreCurrent = async (
  companyId: string,
  batchTeams: Array<{
    workTeamId: string;
    membersSnapshotHash: string;
    assignmentVersionSnapshot: number;
  }>,
  transaction: sql.Transaction,
): Promise<void> => {
  const currentTeams = await workTeamRepository.listByIdsInTransaction(
    companyId,
    batchTeams.map((team) => team.workTeamId),
    transaction,
  );
  const currentTeamById = new Map(currentTeams.map((team) => [team.id, team]));

  for (const snapshot of batchTeams) {
    const current = currentTeamById.get(snapshot.workTeamId);
    if (!current || !current.isActive) {
      throw new AppError(409, "WORK_TEAM_INACTIVE", "Uno o más grupos están inactivos");
    }

    const currentMembers = await workTeamRepository.listMembersForTeamsInTransaction(
      companyId,
      [snapshot.workTeamId],
      transaction,
    );
    const currentHash = hashWorkTeamMembers(currentMembers.map((member) => member.employeeId));
    const version = current.assignmentVersion ?? 0;

    if (
      currentHash !== snapshot.membersSnapshotHash ||
      version !== snapshot.assignmentVersionSnapshot
    ) {
      throw new AppError(
        409,
        "WORK_TEAM_PREVIEW_STALE",
        "La composición del grupo cambió desde la previsualización",
      );
    }
  }
};

const persistBatchItemWithSources = async (
  transaction: sql.Transaction,
  input: {
    batchId: string;
    workTeamIds: string[];
    primaryWorkTeamId: string | null;
    employeeId: string;
    operationAssignmentId: string | null;
    result: "ADDED" | "SKIPPED";
    reason: WorkTeamAssignmentSkipReason | null;
  },
) => {
  const item = await workTeamAssignmentBatchRepository.addBatchItemInTransaction(transaction, {
    batchId: input.batchId,
    workTeamId: input.primaryWorkTeamId,
    employeeId: input.employeeId,
    operationAssignmentId: input.operationAssignmentId,
    result: input.result,
    reason: input.reason,
  });

  for (const workTeamId of input.workTeamIds) {
    await workTeamAssignmentBatchRepository.addBatchItemSourceInTransaction(transaction, {
      batchItemId: item.id,
      workTeamId,
      isPrimary: workTeamId === input.primaryWorkTeamId,
    });
  }

  return item;
};

export const workTeamAssignmentService = {
  async preview(
    companyId: string,
    operationId: string,
    userId: string | null,
    input: WorkTeamAssignPreviewInput,
  ) {
    await workTeamAssignmentBatchRepository.expireStalePreviews(companyId, new Date());
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

    const uniqueTeamIds = [...new Set(input.workTeamIds)];
    const previewExpiresAt = new Date(Date.now() + WORK_TEAM_PREVIEW_TTL_MINUTES * 60 * 1000);
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const teams = await workTeamRepository.listByIdsInTransaction(
        companyId,
        uniqueTeamIds,
        transaction,
      );
      if (teams.length !== uniqueTeamIds.length) {
        throw new AppError(404, "WORK_TEAM_NOT_FOUND", "Grupo de trabajo no encontrado");
      }

      const inactive = teams.filter((team) => !team.isActive);
      if (inactive.length > 0) {
        throw new AppError(409, "WORK_TEAM_INACTIVE", "Uno o más grupos están inactivos");
      }

      const members = await workTeamRepository.listMembersForTeamsInTransaction(
        companyId,
        uniqueTeamIds,
        transaction,
      );
      const membersByTeam = buildMembersByTeam(members);
      const teamSnapshots = buildTeamSnapshots(teams, membersByTeam);
      const existingAssignments = await operationEmployeeRepository.listByOperationInTransaction(
        companyId,
        operationId,
        transaction,
      );

      const { assignableEmployees, skippedEmployees } = classifyPreviewEmployees(
        membersByTeam,
        uniqueTeamIds,
        existingAssignments,
        validFrom,
        validUntil,
      );

      const membersSnapshotHash = hashCombinedWorkTeamSnapshots(
        teamSnapshots.map((snapshot) => snapshot.membersSnapshotHash),
      );

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
          assignmentVersionSnapshot: snapshot.assignmentVersion,
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
      await safeRollback(transaction);
      throw error;
    }
  },

  async confirm(
    companyId: string,
    operationId: string,
    userId: string | null,
    input: WorkTeamAssignConfirmInput,
  ) {
    await workTeamAssignmentBatchRepository.expireStalePreviews(companyId, new Date());
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

    let committedBatchId: string | null = null;
    let shouldSyncRecurring = false;
    let transactionClosed = false;

    try {
      const batch = await workTeamAssignmentBatchRepository.findByIdForUpdate(
        companyId,
        input.previewToken,
        transaction,
      );
      if (!batch || batch.operationId !== operationId) {
        throw new AppError(404, "WORK_TEAM_BATCH_NOT_FOUND", "La previsualización no existe");
      }

      assertBatchOwnership(batch, userId);

      if (batch.status === "COMPLETED") {
        await transaction.commit();
        transactionClosed = true;
        committedBatchId = batch.id;
      } else if (batch.status === "EXPIRED" || batch.status === "STALE") {
        throw new AppError(409, "WORK_TEAM_BATCH_INVALID", "La previsualización no está disponible");
      } else if (batch.status !== "PREVIEWED") {
        throw new AppError(409, "WORK_TEAM_BATCH_INVALID", "La previsualización no está disponible");
      } else if (batch.previewExpiresAt && new Date(batch.previewExpiresAt) < new Date()) {
        await workTeamAssignmentBatchRepository.markExpiredInTransaction(transaction, batch.id);
        await transaction.commit();
        transactionClosed = true;
        throw new AppError(409, "WORK_TEAM_PREVIEW_EXPIRED", "La previsualización expiró");
      } else {
        const batchTeams = await workTeamAssignmentBatchRepository.listBatchTeamsInTransaction(
          companyId,
          batch.id,
          transaction,
        );

        try {
          await validateBatchTeamsAreCurrent(companyId, batchTeams, transaction);
        } catch (error) {
          if (error instanceof AppError && error.code === "WORK_TEAM_PREVIEW_STALE") {
            await workTeamAssignmentBatchRepository.markStaleInTransaction(transaction, batch.id);
            await transaction.commit();
            transactionClosed = true;
          }
          throw error;
        }

        const workTeamIds = batchTeams.map((team) => team.workTeamId);
        const members = await workTeamRepository.listMembersForTeamsInTransaction(
          companyId,
          workTeamIds,
          transaction,
        );
        const membersByTeam = buildMembersByTeam(members);
        const existingAssignments = await operationEmployeeRepository.listByOperationInTransaction(
          companyId,
          operationId,
          transaction,
        );

        const { assignableEmployees, skippedEmployees } = classifyPreviewEmployees(
          membersByTeam,
          workTeamIds,
          existingAssignments,
          batch.validFrom!,
          batch.validUntil,
        );

        for (const skipped of skippedEmployees) {
          await persistBatchItemWithSources(transaction, {
            batchId: batch.id,
            workTeamIds: skipped.workTeamIds,
            primaryWorkTeamId: skipped.primaryWorkTeamId,
            employeeId: skipped.employeeId,
            operationAssignmentId: null,
            result: "SKIPPED",
            reason: skipped.reason ?? "duplicate_in_request",
          });
        }

        for (const entry of assignableEmployees) {
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
              sourceWorkTeamId: entry.primaryWorkTeamId,
            },
          );

          if (result.outcome === "added") {
            await persistBatchItemWithSources(transaction, {
              batchId: batch.id,
              workTeamIds: entry.workTeamIds,
              primaryWorkTeamId: entry.primaryWorkTeamId,
              employeeId: entry.employeeId,
              operationAssignmentId: result.assignment.id,
              result: "ADDED",
              reason: null,
            });
          } else {
            await persistBatchItemWithSources(transaction, {
              batchId: batch.id,
              workTeamIds: entry.workTeamIds,
              primaryWorkTeamId: entry.primaryWorkTeamId,
              employeeId: entry.employeeId,
              operationAssignmentId: result.existingAssignmentId ?? null,
              result: "SKIPPED",
              reason: result.reason,
            });
          }
        }

        await workTeamAssignmentBatchRepository.markCompletedInTransaction(transaction, batch.id);
        await transaction.commit();
        transactionClosed = true;
        committedBatchId = batch.id;
        shouldSyncRecurring = operationKind === "RECURRING";
      }
    } catch (error) {
      if (!transactionClosed) {
        try {
          await workTeamAssignmentBatchRepository.markFailedInTransaction(
            transaction,
            input.previewToken,
          );
          await transaction.commit();
        } catch {
          await safeRollback(transaction);
        }
      }
      throw error;
    }

    // Audit before surfacing any post-commit sync error: the batch is already
    // committed (assignments persisted) regardless of reconciliation outcome.
    if (committedBatchId) {
      await logAuditSafe("work_team_assignment_batch.confirm", () =>
        auditService.log(companyId, {
          entityType: "work_team_assignment_batch",
          entityId: committedBatchId!,
          action: "confirm",
          newData: { operationId },
          userId,
        }),
      );
    }

    if (shouldSyncRecurring && committedBatchId) {
      // The assignment is committed. If horizon reconciliation fails we surface
      // the specific RECURRING_WORKDAY_SYNC_FAILED code (no rollback after
      // commit) so the client can refresh and inform the user the assignment
      // succeeded while workday materialization stayed pending.
      await recurringWorkdaySyncService.runOperationSync(
        companyId,
        operationId,
        () => recurringWorkdayMaterializationService.materializeOperationHorizon(companyId, operationId),
        "recurring work team batch assignment",
      );
    }

    return buildAssignmentConfirmationResponse(companyId, committedBatchId!);
  },

  async getBatchDetail(companyId: string, batchId: string) {
    const batch = await workTeamAssignmentBatchRepository.findById(companyId, batchId);
    if (!batch) {
      throw new AppError(404, "WORK_TEAM_BATCH_NOT_FOUND", "El batch no existe");
    }

    const teams = await workTeamAssignmentBatchRepository.listBatchTeams(companyId, batchId);
    const items = await workTeamAssignmentBatchRepository.listBatchItems(companyId, batchId);
    const operation = await operationRepository.findById(companyId, batch.operationId);
    const confirmation = await buildAssignmentConfirmationResponse(companyId, batchId);

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
      ...confirmation,
    };
  },
};
