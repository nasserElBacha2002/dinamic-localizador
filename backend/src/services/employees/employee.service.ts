import sql from "mssql";
import { AppError } from "../../errors/app-error";
import type {
  CreateEmployeeInput,
  ListEmployeesQuery,
  UpdateEmployeeInput,
} from "../../schemas/employee.schema";
import { getPool } from "../../database/connection";
import { employeeClientRepository } from "../../repositories/employees/employee-client.repository";
import { employeeRepository } from "../../repositories/employees/employee.repository";
import type { Employee } from "../../types/domain";
import { companyAbsenceSettingsService } from "../companies/company-absence-settings.service";
import { normalizePhoneNumber } from "../../utils/phone";
import { buildPaginationMeta } from "../../utils/pagination";
import { classifyEmployeeUniqueViolation } from "../../imports/constraint-classifiers";
import { safeRollback } from "../../utils/safe-transaction";
import { isEmployeeRecordOperationalChargeHolder } from "../../utils/employees/operational-charge-holder";
import { operationChargeRevocationService } from "../operations/operation-charge-revocation.service";
import { employeeDeactivationRepository } from "../../repositories/employees/employee-deactivation.repository";
import { auditService } from "../audit.service";
import { companyUserEmployeeLinkRepository } from "../../repositories/companies/company-user-employee-link.repository";
import {
  acquireTransactionAppLock,
  companyUserEmployeeLinkLockResource,
} from "../../utils/sql-app-lock";

/**
 * Explicit creation policy:
 * - interactive: manual UI/API create (current behavior + reserved post-commit effects)
 * - import: bulk import path — same persistence invariants, no post-commit side effects
 */
export type EmployeeCreationMode = "interactive" | "import";

export type CreateEmployeeOptions = {
  creationMode?: EmployeeCreationMode;
  clientIds?: string[];
  createdByUserId?: string | null;
};

export type CreateEmployeeForImportInput = CreateEmployeeInput & {
  clientIds?: string[];
};

const runPostCommitEffects = async (
  _companyId: string,
  _employee: Employee,
  creationMode: EmployeeCreationMode,
): Promise<void> => {
  // Interactive create currently has no WhatsApp / invitation / credential side effects.
  // Import mode explicitly skips any future interactive-only post-commit hooks.
  if (creationMode === "import") {
    return;
  }
};

export const employeeService = {
  async create(
    companyId: string,
    input: CreateEmployeeInput,
    options?: CreateEmployeeOptions,
  ) {
    const creationMode = options?.creationMode ?? "interactive";
    const phoneNumber = normalizePhoneNumber(input.phoneNumber);
    const exists = await employeeRepository.findByPhone(companyId, phoneNumber);
    if (exists) {
      throw new AppError(409, "EMPLOYEE_PHONE_ALREADY_EXISTS", "El teléfono ya está registrado");
    }

    const categoryId = input.categoryId === undefined ? null : input.categoryId;
    const locationZoneId = input.locationZoneId === undefined ? null : input.locationZoneId;
    // Assignability (active + same company; create forbids inactive) is enforced atomically
    // inside employeeRepository.create with UPDLOCK — no divergent pre-check.

    await companyAbsenceSettingsService.ensureAbsenceCatalogForCompany(companyId);

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const employee = await employeeRepository.create(
        companyId,
        {
          name: input.name.trim(),
          documentNumber: input.documentNumber?.trim() ?? null,
          phoneNumber,
          employeeType: input.employeeType,
          categoryId,
          locationZoneId,
        },
        transaction,
      );

      await companyAbsenceSettingsService.initializeEmployeeAbsenceBalances(
        companyId,
        employee.id,
        transaction,
      );

      const clientIds = options?.clientIds ?? [];
      if (clientIds.length > 0) {
        await employeeClientRepository.replaceForEmployee(
          transaction,
          companyId,
          employee.id,
          clientIds,
          options?.createdByUserId ?? null,
        );
      }

      await transaction.commit();
      await runPostCommitEffects(companyId, employee, creationMode);
      return employee;
    } catch (error) {
      await transaction.rollback();
      const classified = classifyEmployeeUniqueViolation(error);
      if (classified) {
        throw new AppError(409, classified.code, classified.message);
      }
      throw error;
    }
  },

  /**
   * Real multi-row create for imports. Atomic per chunk transaction.
   * Does not run interactive post-commit side effects.
   * Location zones are always NULL until an explicit bulk-zone import phase.
   */
  async createManyForImport(
    companyId: string,
    inputs: CreateEmployeeForImportInput[],
    createdByUserId: string | null = null,
  ): Promise<Employee[]> {
    if (inputs.length === 0) {
      return [];
    }

    await companyAbsenceSettingsService.ensureAbsenceCatalogForCompany(companyId);

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const created = await employeeRepository.createMany(
        companyId,
        inputs.map((input) => ({
          name: input.name.trim(),
          documentNumber: input.documentNumber?.trim() ?? null,
          phoneNumber: normalizePhoneNumber(input.phoneNumber),
          employeeType: input.employeeType,
          categoryId: input.categoryId === undefined ? null : input.categoryId,
        })),
        transaction,
      );

      await companyAbsenceSettingsService.initializeEmployeeAbsenceBalancesMany(
        companyId,
        created.map((employee) => employee.id),
        transaction,
      );

      for (let index = 0; index < created.length; index += 1) {
        const clientIds = inputs[index]?.clientIds ?? [];
        if (clientIds.length === 0) {
          continue;
        }
        await employeeClientRepository.replaceForEmployee(
          transaction,
          companyId,
          created[index]!.id,
          clientIds,
          createdByUserId,
        );
      }

      await transaction.commit();
      return created;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async list(companyId: string, query: ListEmployeesQuery) {
    const result = await employeeRepository.list(companyId, query);
    return {
      data: result.items,
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  },

  async getById(companyId: string, id: string) {
    const employee = await employeeRepository.findById(companyId, id);
    if (!employee) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
    }
    return employee;
  },

  async update(companyId: string, id: string, input: UpdateEmployeeInput, actorUserId?: string | null) {
    const existing = await this.getById(companyId, id);

    if (input.active === false) {
      throw new AppError(
        400,
        "EMPLOYEE_DEACTIVATION_REQUIRES_DEDICATED_ENDPOINT",
        "Para desactivar un colaborador usá el endpoint de desactivación asistida.",
      );
    }

    const updatePayload: UpdateEmployeeInput & { phoneNumber?: string } = { ...input };
    if (input.phoneNumber !== undefined) {
      const normalizedPhone = normalizePhoneNumber(input.phoneNumber);
      const phoneConflict = await employeeRepository.findByPhone(companyId, normalizedPhone);
      if (phoneConflict && phoneConflict.id !== id) {
        throw new AppError(409, "EMPLOYEE_PHONE_ALREADY_EXISTS", "El teléfono ya está registrado");
      }
      updatePayload.phoneNumber = normalizedPhone;
    }

    const mayAffectChargeHolder = await isEmployeeRecordOperationalChargeHolder(companyId, existing);
    const chargeHolderPanelLink = mayAffectChargeHolder
      ? await companyUserEmployeeLinkRepository.findByEmployeeId(companyId, id)
      : null;

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    let transactionClosed = false;
    let updated: Employee | null = null;
    let revokedAssignmentIds: string[] = [];

    try {
      if (chargeHolderPanelLink) {
        await acquireTransactionAppLock(transaction, {
          resource: companyUserEmployeeLinkLockResource(companyId, chargeHolderPanelLink.userId),
        });
      }

      const locked = await employeeDeactivationRepository.lockEmployeeForUpdate(companyId, id, transaction);
      if (!locked) {
        throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
      }

      const beforeUpdate = await employeeRepository.findById(companyId, id, transaction);
      if (!beforeUpdate) {
        throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
      }

      const wasChargeHolder = await isEmployeeRecordOperationalChargeHolder(companyId, beforeUpdate);

      updated = await employeeRepository.update(companyId, id, updatePayload, transaction);
      if (!updated) {
        throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
      }

      const isChargeHolder = await isEmployeeRecordOperationalChargeHolder(companyId, updated);
      if (wasChargeHolder && !isChargeHolder) {
        revokedAssignmentIds = await operationChargeRevocationService.revokeForEmployeeCollaboratorInTransaction(
          companyId,
          transaction,
          {
            employeeId: id,
            actorUserId: actorUserId ?? null,
            reason: "EMPLOYEE_CATEGORY_CHANGED",
            linkLockAlreadyHeld: Boolean(chargeHolderPanelLink),
          },
        );

        await auditService.log(
          companyId,
          {
            entityType: "employee",
            entityId: id,
            action: "operational_charge_revoked",
            previousData: {
              categoryId: beforeUpdate.categoryId,
            },
            newData: {
              categoryId: updated.categoryId,
              reason: "EMPLOYEE_CATEGORY_CHANGED",
              revokedAssignmentIds,
            },
            userId: actorUserId ?? null,
          },
          transaction,
        );
      }

      await transaction.commit();
      transactionClosed = true;
    } catch (error) {
      if (!transactionClosed) {
        await safeRollback(transaction);
      }
      const classified = classifyEmployeeUniqueViolation(error);
      if (classified) {
        throw new AppError(409, classified.code, classified.message);
      }
      throw error;
    }

    return updated!;
  },
};
