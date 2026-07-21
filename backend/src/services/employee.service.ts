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
