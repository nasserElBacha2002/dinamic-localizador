import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { employeeRepository } from "../repositories/employee.repository";
import {
  workTeamMemberRepository,
  workTeamRepository,
} from "../repositories/work-team.repository";
import { workTeamAssignmentBatchRepository } from "../repositories/work-team-assignment-batch.repository";
import type {
  AddWorkTeamMembersInput,
  CreateWorkTeamInput,
  ListWorkTeamUsageQuery,
  ListWorkTeamsQuery,
  ReplaceWorkTeamMembersInput,
  UpdateWorkTeamInput,
} from "../schemas/work-team.schema";
import type { WorkTeamDetail } from "../types/work-team";
import { buildPaginationMeta } from "../utils/pagination";
import { normalizeWorkTeamName } from "../utils/work-team-name";
import { auditService } from "./audit.service";

const assertUniqueEmployeeIds = (employeeIds: string[]): void => {
  const unique = new Set(employeeIds);
  if (unique.size !== employeeIds.length) {
    throw new AppError(400, "WORK_TEAM_DUPLICATE_MEMBERS", "La lista de integrantes contiene duplicados");
  }
};

const validateEmployeesForMembership = async (
  companyId: string,
  employeeIds: string[],
  requireActive: boolean,
): Promise<void> => {
  assertUniqueEmployeeIds(employeeIds);
  const employees = await employeeRepository.listByIds(companyId, employeeIds);
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));

  for (const employeeId of employeeIds) {
    const employee = employeeById.get(employeeId);
    if (!employee) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
    }
    if (requireActive && !employee.active) {
      throw new AppError(
        409,
        "EMPLOYEE_INACTIVE",
        "No se puede agregar un colaborador inactivo al grupo",
      );
    }
  }
};

const toDetail = async (companyId: string, workTeamId: string): Promise<WorkTeamDetail> => {
  const team = await workTeamRepository.findById(companyId, workTeamId);
  if (!team) {
    throw new AppError(404, "WORK_TEAM_NOT_FOUND", "Grupo de trabajo no encontrado");
  }
  const members = await workTeamRepository.listMembers(companyId, workTeamId);
  return { ...team, members };
};

export const workTeamService = {
  async create(companyId: string, userId: string | null, input: CreateWorkTeamInput) {
    const normalizedName = normalizeWorkTeamName(input.name);
    const existing = await workTeamRepository.findByNormalizedName(companyId, normalizedName);
    if (existing) {
      throw new AppError(409, "WORK_TEAM_NAME_ALREADY_EXISTS", "Ya existe un grupo con ese nombre");
    }

    const employeeIds = input.employeeIds ?? [];
    if (employeeIds.length > 0) {
      await validateEmployeesForMembership(companyId, employeeIds, true);
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const team = await workTeamRepository.create(
        companyId,
        {
          name: input.name.trim(),
          normalizedName,
          description: input.description?.trim() ?? null,
          createdBy: userId,
        },
        transaction,
      );

      for (const employeeId of employeeIds) {
        await workTeamMemberRepository.addMemberInTransaction(transaction, {
          workTeamId: team.id,
          employeeId,
          createdBy: userId,
        });
      }

      await transaction.commit();

      await auditService.log(companyId, {
        entityType: "work_team",
        entityId: team.id,
        action: "create",
        newData: { name: team.name, description: team.description, memberCount: employeeIds.length },
        userId,
      });

      return toDetail(companyId, team.id);
    } catch (error) {
      await transaction.rollback();
      if (error instanceof Error && error.message === "WORK_TEAM_NAME_ALREADY_EXISTS") {
        throw new AppError(409, "WORK_TEAM_NAME_ALREADY_EXISTS", "Ya existe un grupo con ese nombre");
      }
      throw error;
    }
  },

  async list(companyId: string, query: ListWorkTeamsQuery) {
    const result = await workTeamRepository.list(companyId, query);
    return {
      data: result.items,
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  },

  async getById(companyId: string, workTeamId: string) {
    return toDetail(companyId, workTeamId);
  },

  async update(
    companyId: string,
    workTeamId: string,
    userId: string | null,
    input: UpdateWorkTeamInput,
  ) {
    const current = await workTeamRepository.findById(companyId, workTeamId);
    if (!current) {
      throw new AppError(404, "WORK_TEAM_NOT_FOUND", "Grupo de trabajo no encontrado");
    }

    const updatePayload: {
      name?: string;
      normalizedName?: string;
      description?: string | null;
      isActive?: boolean;
      updatedBy: string | null;
    } = { updatedBy: userId };

    if (input.name !== undefined) {
      const normalizedName = normalizeWorkTeamName(input.name);
      const duplicate = await workTeamRepository.findByNormalizedName(
        companyId,
        normalizedName,
        workTeamId,
      );
      if (duplicate) {
        throw new AppError(409, "WORK_TEAM_NAME_ALREADY_EXISTS", "Ya existe un grupo con ese nombre");
      }
      updatePayload.name = input.name.trim();
      updatePayload.normalizedName = normalizedName;
    }

    if (input.description !== undefined) {
      updatePayload.description = input.description?.trim() ?? null;
    }

    if (input.isActive !== undefined) {
      updatePayload.isActive = input.isActive;
    }

    const updated = await workTeamRepository.update(companyId, workTeamId, updatePayload);
    if (!updated) {
      throw new AppError(404, "WORK_TEAM_NOT_FOUND", "Grupo de trabajo no encontrado");
    }

    if (input.name !== undefined || input.isActive !== undefined) {
      const pool = getPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        await workTeamRepository.bumpAssignmentVersionInTransaction(transaction, workTeamId);
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    }

    await auditService.log(companyId, {
      entityType: "work_team",
      entityId: workTeamId,
      action: "update",
      previousData: {
        name: current.name,
        description: current.description,
        isActive: current.isActive,
      },
      newData: {
        name: updated.name,
        description: updated.description,
        isActive: updated.isActive,
      },
      userId,
    });

    return toDetail(companyId, workTeamId);
  },

  async activate(companyId: string, workTeamId: string, userId: string | null) {
    const updated = await workTeamRepository.update(companyId, workTeamId, {
      isActive: true,
      updatedBy: userId,
    });
    if (!updated) {
      throw new AppError(404, "WORK_TEAM_NOT_FOUND", "Grupo de trabajo no encontrado");
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await workTeamRepository.bumpAssignmentVersionInTransaction(transaction, workTeamId);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    await auditService.log(companyId, {
      entityType: "work_team",
      entityId: workTeamId,
      action: "activate",
      userId,
    });

    return toDetail(companyId, workTeamId);
  },

  async deactivate(companyId: string, workTeamId: string, userId: string | null) {
    const updated = await workTeamRepository.update(companyId, workTeamId, {
      isActive: false,
      updatedBy: userId,
    });
    if (!updated) {
      throw new AppError(404, "WORK_TEAM_NOT_FOUND", "Grupo de trabajo no encontrado");
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await workTeamRepository.bumpAssignmentVersionInTransaction(transaction, workTeamId);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    await auditService.log(companyId, {
      entityType: "work_team",
      entityId: workTeamId,
      action: "deactivate",
      userId,
    });

    return toDetail(companyId, workTeamId);
  },

  async listMembers(companyId: string, workTeamId: string) {
    await this.getById(companyId, workTeamId);
    const members = await workTeamRepository.listMembers(companyId, workTeamId);
    return { data: members };
  },

  async addMembers(
    companyId: string,
    workTeamId: string,
    userId: string | null,
    input: AddWorkTeamMembersInput,
  ) {
    await this.getById(companyId, workTeamId);
    await validateEmployeesForMembership(companyId, input.employeeIds, true);

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      for (const employeeId of input.employeeIds) {
        const exists = await workTeamMemberRepository.memberExists(workTeamId, employeeId);
        if (exists) {
          throw new AppError(
            409,
            "WORK_TEAM_MEMBER_ALREADY_EXISTS",
            "El colaborador ya pertenece al grupo",
          );
        }
        await workTeamMemberRepository.addMemberInTransaction(transaction, {
          workTeamId,
          employeeId,
          createdBy: userId,
        });
      }

      await workTeamRepository.bumpAssignmentVersionInTransaction(transaction, workTeamId);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    await auditService.log(companyId, {
      entityType: "work_team",
      entityId: workTeamId,
      action: "add_members",
      newData: { employeeIds: input.employeeIds },
      userId,
    });

    return this.listMembers(companyId, workTeamId);
  },

  async replaceMembers(
    companyId: string,
    workTeamId: string,
    userId: string | null,
    input: ReplaceWorkTeamMembersInput,
  ) {
    const current = await this.getById(companyId, workTeamId);
    await validateEmployeesForMembership(companyId, input.employeeIds, true);

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await workTeamMemberRepository.replaceMembersInTransaction(
        transaction,
        workTeamId,
        input.employeeIds,
        userId,
      );
      await workTeamRepository.bumpAssignmentVersionInTransaction(transaction, workTeamId);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    await auditService.log(companyId, {
      entityType: "work_team",
      entityId: workTeamId,
      action: "replace_members",
      previousData: { employeeIds: current.members.map((member) => member.employeeId) },
      newData: { employeeIds: input.employeeIds },
      userId,
    });

    return this.listMembers(companyId, workTeamId);
  },

  async removeMember(
    companyId: string,
    workTeamId: string,
    employeeId: string,
    userId: string | null,
  ) {
    await this.getById(companyId, workTeamId);

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const removed = await workTeamMemberRepository.removeMemberInTransaction(
        transaction,
        workTeamId,
        employeeId,
      );
      if (!removed) {
        throw new AppError(404, "WORK_TEAM_MEMBER_NOT_FOUND", "El colaborador no pertenece al grupo");
      }
      await workTeamRepository.bumpAssignmentVersionInTransaction(transaction, workTeamId);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    await auditService.log(companyId, {
      entityType: "work_team",
      entityId: workTeamId,
      action: "remove_member",
      previousData: { employeeId },
      userId,
    });

    return this.listMembers(companyId, workTeamId);
  },

  async listUsage(companyId: string, workTeamId: string, query: ListWorkTeamUsageQuery) {
    const team = await workTeamRepository.findById(companyId, workTeamId);
    if (!team) {
      throw new AppError(404, "WORK_TEAM_NOT_FOUND", "Grupo de trabajo no encontrado");
    }

    const result = await workTeamAssignmentBatchRepository.listUsageByWorkTeam(
      companyId,
      workTeamId,
      query,
    );

    return {
      data: result.items,
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  },
};
