import { roleHasPermission } from "../constants/company-permissions";
import { AppError } from "../errors/app-error";
import { companyRepository } from "../repositories/company.repository";
import { employeeCategoryRepository } from "../repositories/employee-category.repository";
import type {
  CreateEmployeeCategoryInput,
  ListEmployeeCategoriesQuery,
  UpdateEmployeeCategoryInput,
} from "../schemas/employee-category.schema";
import type { CompanyMembershipSummary } from "../types/company";
import type { EmployeeCategory } from "../types/employee-category";
import {
  canonicalizeCategoryDisplayName,
  normalizeCategoryName,
} from "../utils/normalize-category-name";
import { isDuplicateKeyError } from "../utils/sql-server-errors";

const assertActiveCompany = async (companyId: string): Promise<void> => {
  const company = await companyRepository.findById(companyId);
  if (!company || company.status !== "ACTIVE") {
    throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
  }
};

const assertSettingsPermission = (role: CompanyMembershipSummary["role"]): void => {
  if (!roleHasPermission(role, "company:settings:update")) {
    throw new AppError(403, "FORBIDDEN", "No tiene permisos para administrar categorías.");
  }
};

const assertNameAvailable = async (
  companyId: string,
  displayName: string,
  excludeId?: string,
): Promise<{ name: string; normalizedName: string }> => {
  const name = canonicalizeCategoryDisplayName(displayName);
  const normalizedName = normalizeCategoryName(name);

  if (!normalizedName) {
    throw new AppError(400, "VALIDATION_ERROR", "El nombre de la categoría es obligatorio.");
  }

  const existing = await employeeCategoryRepository.findByNormalizedName(companyId, normalizedName);
  if (existing && existing.id !== excludeId) {
    if (existing.isSystem) {
      throw new AppError(
        409,
        "EMPLOYEE_CATEGORY_NAME_COLLIDES_WITH_SYSTEM",
        "Ya existe una categoría base con ese nombre.",
      );
    }

    throw new AppError(
      409,
      "EMPLOYEE_CATEGORY_NAME_ALREADY_EXISTS",
      "Ya existe una categoría con ese nombre en esta empresa.",
    );
  }

  return { name, normalizedName };
};

export const employeeCategoryService = {
  async list(
    companyId: string,
    query: ListEmployeeCategoriesQuery,
  ): Promise<EmployeeCategory[]> {
    await assertActiveCompany(companyId);
    return employeeCategoryRepository.listForCompany(companyId, {
      includeInactive: Boolean(query.includeInactive),
    });
  },

  async create(
    companyId: string,
    role: CompanyMembershipSummary["role"],
    input: CreateEmployeeCategoryInput,
  ): Promise<EmployeeCategory> {
    assertSettingsPermission(role);
    await assertActiveCompany(companyId);

    const { name, normalizedName } = await assertNameAvailable(companyId, input.name);

    try {
      const created = await employeeCategoryRepository.create(companyId, {
        name,
        normalizedName,
      });
      return {
        ...created,
        assignedEmployeesCount: 0,
      };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          409,
          "EMPLOYEE_CATEGORY_NAME_ALREADY_EXISTS",
          "Ya existe una categoría con ese nombre en esta empresa.",
        );
      }
      throw error;
    }
  },

  async update(
    companyId: string,
    role: CompanyMembershipSummary["role"],
    categoryId: string,
    input: UpdateEmployeeCategoryInput,
  ): Promise<EmployeeCategory> {
    assertSettingsPermission(role);
    await assertActiveCompany(companyId);

    const existing = await employeeCategoryRepository.findByIdForCompany(companyId, categoryId);
    if (!existing) {
      throw new AppError(404, "EMPLOYEE_CATEGORY_NOT_FOUND", "Categoría no encontrada.");
    }

    if (existing.isSystem || existing.companyId === null) {
      throw new AppError(
        403,
        "EMPLOYEE_CATEGORY_SYSTEM_IMMUTABLE",
        "Las categorías base no se pueden modificar.",
      );
    }

    if (existing.companyId !== companyId) {
      throw new AppError(404, "EMPLOYEE_CATEGORY_NOT_FOUND", "Categoría no encontrada.");
    }

    let name: string | undefined;
    let normalizedName: string | undefined;
    if (input.name !== undefined) {
      const resolved = await assertNameAvailable(companyId, input.name, categoryId);
      name = resolved.name;
      normalizedName = resolved.normalizedName;
    }

    try {
      const updated = await employeeCategoryRepository.updateCompanyCategory(companyId, categoryId, {
        name,
        normalizedName,
        isActive: input.isActive,
      });
      if (!updated) {
        throw new AppError(404, "EMPLOYEE_CATEGORY_NOT_FOUND", "Categoría no encontrada.");
      }

      const withCount = await employeeCategoryRepository.findByIdForCompany(companyId, categoryId);
      return withCount ?? updated;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          409,
          "EMPLOYEE_CATEGORY_NAME_ALREADY_EXISTS",
          "Ya existe una categoría con ese nombre en esta empresa.",
        );
      }
      throw error;
    }
  },

  async assertAssignableCategory(
    companyId: string,
    categoryId: string | null | undefined,
  ): Promise<void> {
    if (categoryId === null || categoryId === undefined) {
      return;
    }

    const category = await employeeCategoryRepository.findAssignableById(companyId, categoryId);
    if (!category) {
      throw new AppError(
        400,
        "EMPLOYEE_CATEGORY_INVALID",
        "La categoría seleccionada no está disponible para esta empresa.",
      );
    }
  },
};
