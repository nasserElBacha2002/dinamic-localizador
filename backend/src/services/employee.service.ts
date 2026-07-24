import sql from "mssql";
import { AppError } from "../errors/app-error";
import type {
  CreateEmployeeInput,
  ListEmployeesQuery,
  UpdateEmployeeInput,
} from "../schemas/employee.schema";
import { getPool } from "../database/connection";
import { employeeRepository } from "../repositories/employee.repository";
import type { Employee } from "../types/domain";
import { companyAbsenceSettingsService } from "./company-absence-settings.service";
import { normalizePhoneNumber } from "../utils/phone";
import { buildPaginationMeta } from "../utils/pagination";
import { classifyEmployeeUniqueViolation } from "../imports/constraint-classifiers";

/**
 * Explicit creation policy:
 * - interactive: manual UI/API create (current behavior + reserved post-commit effects)
 * - import: bulk import path — same persistence invariants, no post-commit side effects
 */
export type EmployeeCreationMode = "interactive" | "import";

export type CreateEmployeeOptions = {
  creationMode?: EmployeeCreationMode;
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
        },
        transaction,
      );

      await companyAbsenceSettingsService.initializeEmployeeAbsenceBalances(
        companyId,
        employee.id,
        transaction,
      );

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
   */
  async createManyForImport(
    companyId: string,
    inputs: CreateEmployeeInput[],
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

  async update(companyId: string, id: string, input: UpdateEmployeeInput) {
    await this.getById(companyId, id);

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
      const existing = await employeeRepository.findByPhone(companyId, normalizedPhone);
      if (existing && existing.id !== id) {
        throw new AppError(409, "EMPLOYEE_PHONE_ALREADY_EXISTS", "El teléfono ya está registrado");
      }
      updatePayload.phoneNumber = normalizedPhone;
    }

    const updated = await employeeRepository.update(companyId, id, updatePayload);
    if (!updated) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
    }
    return updated;
  },
};
