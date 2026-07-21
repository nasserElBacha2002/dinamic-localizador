import sql from "mssql";
import { getPool } from "../database/connection";
import type {
  CreateEmployeeCategoryInput,
  UpdateEmployeeCategoryInput,
} from "../schemas/employee-category.schema";
import type { EmployeeCategory } from "../types/employee-category";

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export const mapEmployeeCategoryRow = (
  row: Record<string, unknown>,
): EmployeeCategory => ({
  id: String(row.id),
  companyId: row.company_id ? String(row.company_id) : null,
  name: String(row.name),
  normalizedName: String(row.normalized_name),
  isSystem: Boolean(row.is_system),
  isActive: Boolean(row.is_active),
  assignedEmployeesCount:
    row.assigned_employees_count !== undefined && row.assigned_employees_count !== null
      ? Number(row.assigned_employees_count)
      : undefined,
  createdAt: toIsoString(row.created_at as Date | string),
  updatedAt: toIsoString(row.updated_at as Date | string),
});

export const employeeCategoryRepository = {
  async listForCompany(
    companyId: string,
    options: { includeInactive: boolean },
  ): Promise<EmployeeCategory[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        SELECT
          ec.*,
          COALESCE(counts.assigned_employees_count, 0) AS assigned_employees_count
        FROM employee_categories ec
        LEFT JOIN (
          SELECT category_id, COUNT(*) AS assigned_employees_count
          FROM employees
          WHERE company_id = @companyId
            AND category_id IS NOT NULL
          GROUP BY category_id
        ) counts ON counts.category_id = ec.id
        WHERE (
            ec.company_id IS NULL
            OR ec.company_id = @companyId
          )
          ${options.includeInactive ? "" : "AND ec.is_active = 1"}
        ORDER BY
          ec.is_system DESC,
          ec.name ASC
      `);

    return result.recordset.map((row) => mapEmployeeCategoryRow(row as Record<string, unknown>));
  },

  async findByIdForCompany(companyId: string, categoryId: string): Promise<EmployeeCategory | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("categoryId", sql.UniqueIdentifier, categoryId)
      .query(`
        SELECT
          ec.*,
          COALESCE(counts.assigned_employees_count, 0) AS assigned_employees_count
        FROM employee_categories ec
        LEFT JOIN (
          SELECT category_id, COUNT(*) AS assigned_employees_count
          FROM employees
          WHERE company_id = @companyId
            AND category_id = @categoryId
          GROUP BY category_id
        ) counts ON counts.category_id = ec.id
        WHERE ec.id = @categoryId
          AND (ec.company_id IS NULL OR ec.company_id = @companyId)
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeCategoryRow(result.recordset[0] as Record<string, unknown>);
  },

  async findAssignableById(
    companyId: string,
    categoryId: string,
  ): Promise<EmployeeCategory | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("categoryId", sql.UniqueIdentifier, categoryId)
      .query(`
        SELECT TOP 1 *
        FROM employee_categories
        WHERE id = @categoryId
          AND is_active = 1
          AND (company_id IS NULL OR company_id = @companyId)
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeCategoryRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByNormalizedName(
    companyId: string,
    normalizedName: string,
  ): Promise<EmployeeCategory | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("normalizedName", sql.NVarChar(120), normalizedName)
      .query(`
        SELECT TOP 1 *
        FROM employee_categories
        WHERE normalized_name = @normalizedName
          AND (
            company_id IS NULL
            OR company_id = @companyId
          )
        ORDER BY
          CASE WHEN company_id IS NULL THEN 0 ELSE 1 END ASC
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeCategoryRow(result.recordset[0] as Record<string, unknown>);
  },

  async create(
    companyId: string,
    input: CreateEmployeeCategoryInput & { normalizedName: string },
  ): Promise<EmployeeCategory> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(120), input.name)
      .input("normalizedName", sql.NVarChar(120), input.normalizedName)
      .query(`
        INSERT INTO employee_categories (company_id, name, normalized_name, is_system, is_active)
        OUTPUT INSERTED.*
        VALUES (@companyId, @name, @normalizedName, 0, 1)
      `);

    return mapEmployeeCategoryRow(result.recordset[0] as Record<string, unknown>);
  },

  async updateCompanyCategory(
    companyId: string,
    categoryId: string,
    input: UpdateEmployeeCategoryInput & { normalizedName?: string },
  ): Promise<EmployeeCategory | null> {
    const pool = getPool();
    const fields: string[] = [];
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("categoryId", sql.UniqueIdentifier, categoryId);

    if (input.name !== undefined && input.normalizedName !== undefined) {
      request.input("name", sql.NVarChar(120), input.name);
      request.input("normalizedName", sql.NVarChar(120), input.normalizedName);
      fields.push("name = @name", "normalized_name = @normalizedName");
    }

    if (input.isActive !== undefined) {
      request.input("isActive", sql.Bit, input.isActive);
      fields.push("is_active = @isActive");
    }

    if (fields.length === 0) {
      return this.findByIdForCompany(companyId, categoryId);
    }

    fields.push("updated_at = SYSUTCDATETIME()");

    const result = await request.query(`
      UPDATE employee_categories
      SET ${fields.join(", ")}
      OUTPUT INSERTED.*
      WHERE id = @categoryId
        AND company_id = @companyId
        AND is_system = 0
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeCategoryRow(result.recordset[0] as Record<string, unknown>);
  },

  async countSystemCategories(): Promise<number> {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT COUNT(*) AS total
      FROM employee_categories
      WHERE company_id IS NULL
        AND is_system = 1
    `);
    return Number(result.recordset[0].total);
  },
};
