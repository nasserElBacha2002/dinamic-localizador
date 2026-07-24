import sql from "mssql";
import { AppError } from "../errors/app-error";
import { getPool } from "../database/connection";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { employeeDeactivationRepository } from "../repositories/employee-deactivation.repository";
import { employeeRepository } from "../repositories/employee.repository";
import type { Employee } from "../types/domain";
import type { UpdateEmployeeInput } from "../schemas/employee.schema";
import { getDateIsoInTimezone } from "../utils/absence-date";
import {
  buildDeactivationReleasePlan,
  summarizeDeactivationImpact,
} from "../utils/employee-deactivation-impact";
import { normalizePhoneNumber } from "../utils/phone";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import { safeRollback } from "../utils/safe-transaction";
import { logAuditSafe } from "../utils/audit-post-commit";
import { auditService } from "./audit.service";

export interface EmployeeDeactivationImpact {
  collaboratorId: string;
  canDeactivateDirectly: boolean;
  requiresConfirmation: boolean;
  affectedAssignmentsCount: number;
  affectedWorkdaysCount: number;
  affectedAssignments: ReturnType<typeof buildDeactivationReleasePlan>["affectedWorkdayRows"];
  activeWorkTeamMemberships: Array<{ workTeamId: string; workTeamName: string }>;
}

export interface DeactivateEmployeeCommand {
  confirmAffectedRelease?: boolean;
  profile?: {
    name?: string;
    documentNumber?: string | null;
    phoneNumber?: string;
    employeeType?: UpdateEmployeeInput["employeeType"];
    categoryId?: string | null;
  };
}

export interface DeactivateEmployeeResult {
  employee: Employee;
  removedAssignmentIds: string[];
  endedAssignments: Array<{ assignmentId: string; effectiveDate: string }>;
  cancelledExpectationIds: string[];
  removedWorkTeams: Array<{ workTeamId: string; workTeamName: string }>;
}

const buildImpact = async (
  companyId: string,
  employeeId: string,
  referenceAt: Date,
  transaction?: sql.Transaction,
): Promise<{
  impact: EmployeeDeactivationImpact;
  plan: ReturnType<typeof buildDeactivationReleasePlan>;
  timezone: string;
  companyTodayIso: string;
}> => {
  const settings = await companySettingsRepository.findByCompanyId(companyId);
  const timezone = resolveOperationTimezone(settings?.operationTimezone);
  const companyTodayIso = getDateIsoInTimezone(referenceAt, timezone);

  const assignments = await employeeDeactivationRepository.listAssignmentSnapshots(
    companyId,
    employeeId,
    transaction,
  );
  const plan = buildDeactivationReleasePlan({
    assignments,
    companyTodayIso,
    referenceAt,
    timezone,
  });
  const workTeams = await employeeDeactivationRepository.listActiveWorkTeamMemberships(
    companyId,
    employeeId,
    transaction,
  );
  const summary = summarizeDeactivationImpact({
    plan,
    workTeamCount: workTeams.length,
  });

  return {
    timezone,
    companyTodayIso,
    plan,
    impact: {
      collaboratorId: employeeId,
      canDeactivateDirectly: summary.canDeactivateDirectly,
      requiresConfirmation: summary.requiresConfirmation,
      affectedAssignmentsCount: summary.affectedAssignmentsCount,
      affectedWorkdaysCount: summary.affectedWorkdaysCount,
      affectedAssignments: plan.affectedWorkdayRows,
      activeWorkTeamMemberships: workTeams,
    },
  };
};

export const employeeDeactivationService = {
  async getDeactivationImpact(
    companyId: string,
    employeeId: string,
    referenceAt = new Date(),
  ): Promise<EmployeeDeactivationImpact> {
    const employee = await employeeRepository.findById(companyId, employeeId);
    if (!employee) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
    }

    const { impact } = await buildImpact(companyId, employeeId, referenceAt);
    return impact;
  },

  async deactivate(
    companyId: string,
    employeeId: string,
    command: DeactivateEmployeeCommand = {},
    userId?: string | null,
    referenceAt = new Date(),
  ): Promise<DeactivateEmployeeResult> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    let transactionClosed = false;
    let result: DeactivateEmployeeResult | null = null;
    let previouslyActive = true;

    try {
      const locked = await employeeDeactivationRepository.lockEmployeeForUpdate(
        companyId,
        employeeId,
        transaction,
      );
      if (!locked) {
        throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
      }
      previouslyActive = locked.active;

      const { impact, plan } = await buildImpact(
        companyId,
        employeeId,
        referenceAt,
        transaction,
      );

      if (impact.requiresConfirmation && !command.confirmAffectedRelease) {
        throw new AppError(
          409,
          "EMPLOYEE_DEACTIVATION_CONFIRMATION_REQUIRED",
          "Confirmá la desasignación de actividades activas o futuras y/o la salida de grupos de trabajo.",
        );
      }

      if (command.confirmAffectedRelease || impact.requiresConfirmation) {
        await employeeDeactivationRepository.executeReleasePlan(
          companyId,
          employeeId,
          plan,
          transaction,
        );
      }

      const removedWorkTeams = await employeeDeactivationRepository.removeFromAllWorkTeams(
        companyId,
        employeeId,
        transaction,
      );

      const profileUpdate: UpdateEmployeeInput & { phoneNumber?: string; active: boolean } = {
        active: false,
      };

      if (command.profile) {
        if (command.profile.name !== undefined) {
          profileUpdate.name = command.profile.name.trim();
        }
        if (command.profile.documentNumber !== undefined) {
          profileUpdate.documentNumber = command.profile.documentNumber?.trim()
            ? command.profile.documentNumber.trim()
            : null;
        }
        if (command.profile.phoneNumber !== undefined) {
          const normalizedPhone = normalizePhoneNumber(command.profile.phoneNumber);
          const conflict = await employeeDeactivationRepository.findPhoneConflictInTransaction(
            companyId,
            employeeId,
            normalizedPhone,
            transaction,
          );
          if (conflict) {
            throw new AppError(
              409,
              "EMPLOYEE_PHONE_ALREADY_EXISTS",
              "El teléfono ya está registrado",
            );
          }
          profileUpdate.phoneNumber = normalizedPhone;
        }
        if (command.profile.employeeType !== undefined) {
          profileUpdate.employeeType = command.profile.employeeType;
        }
        if (command.profile.categoryId !== undefined) {
          profileUpdate.categoryId = command.profile.categoryId;
        }
      }

      const employee = await employeeRepository.update(
        companyId,
        employeeId,
        profileUpdate,
        transaction,
      );
      if (!employee) {
        throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
      }

      await transaction.commit();
      transactionClosed = true;

      result = {
        employee,
        removedAssignmentIds: plan.assignmentsToCancel,
        endedAssignments: plan.assignmentsToEnd,
        cancelledExpectationIds: plan.employeeWorkdayIdsToCancel,
        removedWorkTeams,
      };
    } catch (error) {
      if (!transactionClosed) {
        await safeRollback(transaction);
      }
      throw error;
    }

    await logAuditSafe("employee.deactivate", () =>
      auditService.log(companyId, {
        entityType: "employee",
        entityId: employeeId,
        action: "deactivate",
        previousData: { active: previouslyActive },
        newData: {
          active: false,
          removedAssignmentIds: result!.removedAssignmentIds,
          endedAssignments: result!.endedAssignments,
          cancelledExpectationIds: result!.cancelledExpectationIds,
          removedWorkTeams: result!.removedWorkTeams,
          profile: command.profile ?? null,
        },
        reason: "assisted_deactivation",
        userId: userId ?? null,
      }),
    );

    return result!;
  },
};
