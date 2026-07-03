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

    await companyAbsenceSettingsService.ensureAbsenceCatalogForCompany(companyId);

    // Catalog/settings are ensured before the transaction. Balance inserts share the
    // employee creation transaction; reads during init use committed catalog data.
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
      const hasSchedules = await employeeRepository.hasActiveOrScheduledInventories(companyId, id);
      if (hasSchedules) {
        throw new AppError(
          409,
          "EMPLOYEE_HAS_ACTIVE_OR_SCHEDULED_INVENTORIES",
          "No se puede desactivar un empleado con inventarios activos o programados",
        );
      }
    }

    const updated = await employeeRepository.update(companyId, id, updatePayload);
    if (!updated) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
    }
    return updated;
  },

  async deactivate(companyId: string, id: string) {
    await this.getById(companyId, id);
    const hasSchedules = await employeeRepository.hasActiveOrScheduledInventories(companyId, id);
    if (hasSchedules) {
      throw new AppError(
        409,
        "EMPLOYEE_HAS_ACTIVE_OR_SCHEDULED_INVENTORIES",
        "No se puede desactivar un empleado con inventarios activos o programados",
      );
    }

    const updated = await employeeRepository.deactivate(companyId, id);
    if (!updated) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
    }
    return updated;
  },
};
