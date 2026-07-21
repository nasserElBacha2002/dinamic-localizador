import sql from "mssql";
import { AppError } from "../errors/app-error";
import type {
  CreateEmployeeInput,
  ListEmployeesQuery,
  UpdateEmployeeInput,
} from "../schemas/employee.schema";
import { getPool } from "../database/connection";
import { employeeRepository } from "../repositories/employee.repository";
import { companyAbsenceSettingsService } from "./company-absence-settings.service";
import { normalizePhoneNumber } from "../utils/phone";
import { buildPaginationMeta } from "../utils/pagination";

export const employeeService = {
  async create(companyId: string, input: CreateEmployeeInput) {
    const phoneNumber = normalizePhoneNumber(input.phoneNumber);
    const exists = await employeeRepository.findByPhone(companyId, phoneNumber);
    if (exists) {
      throw new AppError(409, "EMPLOYEE_PHONE_ALREADY_EXISTS", "El teléfono ya está registrado");
    }

    const categoryId = input.categoryId === undefined ? null : input.categoryId;

    await companyAbsenceSettingsService.ensureAbsenceCatalogForCompany(companyId);

    // Category assignability is enforced inside the INSERT (UPDLOCK/HOLDLOCK + EXISTS),
    // in the same transaction as balance initialization — no pre-check race window.
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
      return employee;
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

    const updatePayload: UpdateEmployeeInput & { phoneNumber?: string } = { ...input };
    if (input.phoneNumber !== undefined) {
      const normalizedPhone = normalizePhoneNumber(input.phoneNumber);
      const existing = await employeeRepository.findByPhone(companyId, normalizedPhone);
      if (existing && existing.id !== id) {
        throw new AppError(409, "EMPLOYEE_PHONE_ALREADY_EXISTS", "El teléfono ya está registrado");
      }
      updatePayload.phoneNumber = normalizedPhone;
    }

    if (input.active === false) {
      // Assisted deactivation (impact preview + optional unassign) lives in
      // employeeDeactivationService. Plain updates without confirmation still
      // refuse when operational assignments remain.
      const { employeeDeactivationService } = await import("./employee-deactivation.service");
      const impact = await employeeDeactivationService.getDeactivationImpact(companyId, id);
      if (!impact.canDeactivateDirectly) {
        throw new AppError(
          409,
          "EMPLOYEE_HAS_ACTIVE_OR_SCHEDULED_OPERATIONS",
          "No se puede desactivar un empleado con operaciones activas o programadas. Confirmá la desasignación para continuar.",
        );
      }
    }

    // Category scope/active checks run inside UPDATE with UPDLOCK/HOLDLOCK.
    const updated = await employeeRepository.update(companyId, id, updatePayload);
    if (!updated) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
    }
    return updated;
  },

  async deactivate(companyId: string, id: string, userId?: string | null) {
    const { employeeDeactivationService } = await import("./employee-deactivation.service");
    const result = await employeeDeactivationService.deactivate(
      companyId,
      id,
      { removeActiveAndFutureAssignments: false },
      userId,
    );
    return result.employee;
  },
};
