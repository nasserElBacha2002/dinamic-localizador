import sql from "mssql";
import { AppError } from "../../errors/app-error";
import { OPERATIONAL_CHARGE_HOLDER_CATEGORY_NORMALIZED_NAME } from "../../constants/operational-charge-holder";
import { employeeCategoryRepository } from "../../repositories/employees/employee-category.repository";
import { employeeRepository } from "../../repositories/employees/employee.repository";
import type { Employee } from "../../types/domain";

const isEncargadoCategoryRow = (normalizedName: unknown): boolean =>
  String(normalizedName) === OPERATIONAL_CHARGE_HOLDER_CATEGORY_NORMALIZED_NAME;

const chargeHolderCategoryErrors = {
  missing: () =>
    new AppError(
      409,
      "EMPLOYEE_NOT_CHARGE_HOLDER",
      "El colaborador debe tener la clasificación operativa Encargado.",
    ),
  notFound: () => new AppError(404, "EMPLOYEE_NOT_FOUND", "Colaborador no encontrado."),
  inactive: () => new AppError(409, "EMPLOYEE_INACTIVE", "El colaborador no está activo."),
} as const;

const assertEmployeeRecordIsOperationalChargeHolder = async (
  companyId: string,
  employee: Pick<Employee, "active" | "categoryId">,
): Promise<void> => {
  if (!employee.active) {
    throw chargeHolderCategoryErrors.inactive();
  }
  if (!employee.categoryId) {
    throw chargeHolderCategoryErrors.missing();
  }
  const category = await employeeCategoryRepository.findAssignableById(
    companyId,
    employee.categoryId,
  );
  if (!category || !isOperationalChargeHolderCategory(category.normalizedName)) {
    throw chargeHolderCategoryErrors.missing();
  }
};

const assertEmployeeRecordIsOperationalChargeHolderInTransaction = async (
  companyId: string,
  employee: Pick<Employee, "active" | "categoryId">,
  transaction: sql.Transaction,
): Promise<void> => {
  if (!employee.active) {
    throw chargeHolderCategoryErrors.inactive();
  }
  if (!employee.categoryId) {
    throw chargeHolderCategoryErrors.missing();
  }

  const categoryRow = await new sql.Request(transaction)
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("categoryId", sql.UniqueIdentifier, employee.categoryId)
    .query(`
      SELECT TOP 1 normalized_name
      FROM employee_categories WITH (UPDLOCK, ROWLOCK)
      WHERE id = @categoryId
        AND is_active = 1
        AND (company_id IS NULL OR company_id = @companyId)
    `);
  const normalizedName = categoryRow.recordset[0]?.normalized_name;
  if (!isEncargadoCategoryRow(normalizedName)) {
    throw chargeHolderCategoryErrors.missing();
  }
};

export const isOperationalChargeHolderCategory = (normalizedName: string): boolean =>
  normalizedName === OPERATIONAL_CHARGE_HOLDER_CATEGORY_NORMALIZED_NAME;

export const isEmployeeRecordOperationalChargeHolder = async (
  companyId: string,
  employee: Pick<Employee, "active" | "categoryId">,
): Promise<boolean> => {
  if (!employee.active || !employee.categoryId) {
    return false;
  }
  const category = await employeeCategoryRepository.findAssignableById(
    companyId,
    employee.categoryId,
  );
  return Boolean(category && isOperationalChargeHolderCategory(category.normalizedName));
};

export const isEmployeeOperationalChargeHolder = async (
  companyId: string,
  employeeId: string,
): Promise<boolean> => {
  const employee = await employeeRepository.findById(companyId, employeeId);
  if (!employee) {
    return false;
  }
  return isEmployeeRecordOperationalChargeHolder(companyId, employee);
};

export const assertEmployeeIsOperationalChargeHolder = async (
  companyId: string,
  employeeId: string,
): Promise<void> => {
  const employee = await employeeRepository.findById(companyId, employeeId);
  if (!employee) {
    throw chargeHolderCategoryErrors.notFound();
  }
  await assertEmployeeRecordIsOperationalChargeHolder(companyId, employee);
};

/** Validates Encargado eligibility under the same transaction as link/assignment writes. */
export const assertEmployeeIsOperationalChargeHolderInTransaction = async (
  companyId: string,
  employeeId: string,
  transaction: sql.Transaction,
): Promise<void> => {
  const row = await new sql.Request(transaction)
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("employeeId", sql.UniqueIdentifier, employeeId)
    .query(`
      SELECT TOP 1 active, category_id
      FROM employees WITH (UPDLOCK, ROWLOCK)
      WHERE company_id = @companyId AND id = @employeeId
    `);
  const employee = row.recordset[0] as { active: boolean; category_id: string | null } | undefined;
  if (!employee) {
    throw chargeHolderCategoryErrors.notFound();
  }
  await assertEmployeeRecordIsOperationalChargeHolderInTransaction(
    companyId,
  {
      active: Boolean(employee.active),
      categoryId: employee.category_id ? String(employee.category_id) : null,
    },
    transaction,
  );
};
