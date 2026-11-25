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
import { commercialSeatQuotaService } from "../billing/commercial-seat-quota.service";
import type { CommercialSeatAdmissionEvaluation } from "../../types/commercial-seat-quota";

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

const flushCommercialSeatAdmission = async (
  evaluation: CommercialSeatAdmissionEvaluation | null,
  mutationPersisted: boolean,
): Promise<void> => {
  if (!evaluation) {
    return;
  }
  await commercialSeatQuotaService.flushAdmissionEvaluation(evaluation, mutationPersisted);
};

const runPostCommitEffects = async (
  _companyId: string,
  _employee: Employee,
  creationMode: EmployeeCreationMode,
): Promise<void> => {
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

    await companyAbsenceSettingsService.ensureAbsenceCatalogForCompany(companyId);

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    let admissionEvaluation: CommercialSeatAdmissionEvaluation | null = null;
    let committed = false;
    let employee: Employee;

    try {
      admissionEvaluation = await commercialSeatQuotaService.evaluateActiveHeadcountAdmissionInTransaction({
        companyId,
        transaction,
        delta: 1,
        operation: creationMode === "import" ? "EMPLOYEE_IMPORT_ROW" : "EMPLOYEE_CREATE",
        actorUserId: options?.createdByUserId ?? null,
      });
      commercialSeatQuotaService.throwIfAdmissionBlocked(admissionEvaluation);

      employee = await employeeRepository.create(
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
      committed = true;
    } catch (error) {
      if (!committed) {
        await safeRollback(transaction);
      }
      await flushCommercialSeatAdmission(admissionEvaluation, false);
      const classified = classifyEmployeeUniqueViolation(error);
      if (classified) {
        throw new AppError(409, classified.code, classified.message);
      }
      throw error;
    }

    await flushCommercialSeatAdmission(admissionEvaluation, true);
    await runPostCommitEffects(companyId, employee!, creationMode);
    return employee!;
  },

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

    let admissionEvaluation: CommercialSeatAdmissionEvaluation | null = null;
    let committed = false;
    let created!: Employee[];

    try {
      admissionEvaluation = await commercialSeatQuotaService.evaluateActiveHeadcountAdmissionInTransaction({
        companyId,
        transaction,
        delta: inputs.length,
        operation: "EMPLOYEE_IMPORT_BATCH",
        actorUserId: createdByUserId,
      });
      commercialSeatQuotaService.throwIfAdmissionBlocked(admissionEvaluation);

      created = await employeeRepository.createMany(
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
      committed = true;
    } catch (error) {
      if (!committed) {
        await safeRollback(transaction);
      }
      await flushCommercialSeatAdmission(admissionEvaluation, false);
      throw error;
    }

    await flushCommercialSeatAdmission(admissionEvaluation, true);
    return created;
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

    const intendsReactivation = updatePayload.active === true;

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    let transactionClosed = false;
    let updated!: Employee;
    let admissionEvaluation: CommercialSeatAdmissionEvaluation | null = null;

    try {
      const commercialSeatPrepared = intendsReactivation
        ? await commercialSeatQuotaService.prepareCommercialSeatAdmission(transaction, companyId)
        : null;

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

      const reactivationDelta =
        intendsReactivation && !beforeUpdate.active ? 1 : 0;
      if (reactivationDelta > 0) {
        admissionEvaluation = await commercialSeatQuotaService.evaluateActiveHeadcountAdmissionInTransaction({
          companyId,
          transaction,
          delta: reactivationDelta,
          operation: "EMPLOYEE_REACTIVATE",
          actorUserId: actorUserId ?? null,
          lockPrepared:
            commercialSeatPrepared && commercialSeatPrepared.effectiveMode !== "DISABLED"
              ? {
                  effectiveMode: commercialSeatPrepared.effectiveMode,
                  lockAcquired: commercialSeatPrepared.lockAcquired,
                }
              : undefined,
        });
        commercialSeatQuotaService.throwIfAdmissionBlocked(admissionEvaluation);
      }

      const updateResult = await employeeRepository.update(companyId, id, updatePayload, transaction);
      if (!updateResult) {
        throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
      }
      updated = updateResult;

      const isChargeHolder = await isEmployeeRecordOperationalChargeHolder(companyId, updated);
      if (wasChargeHolder && !isChargeHolder) {
        const revokedAssignmentIds = await operationChargeRevocationService.revokeForEmployeeCollaboratorInTransaction(
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
      await flushCommercialSeatAdmission(admissionEvaluation, false);
      const classified = classifyEmployeeUniqueViolation(error);
      if (classified) {
        throw new AppError(409, classified.code, classified.message);
      }
      throw error;
    }

    await flushCommercialSeatAdmission(admissionEvaluation, true);
    return updated!;
  },
};