// Phase 2.3 terminology note: Employee remains the technical DB/API model (employees table).
// Conceptually this represents a Worker — see types/operational-domain.ts.
import sql from "mssql";
import { AppError } from "../errors/app-error";
import { getPool } from "../database/connection";
import type { Employee } from "../types/domain";
import { applySqlFilters, buildWhereClause, type SqlFilter } from "../utils/sql-list-query";
import { resolveSqlSort } from "../utils/sql-sort";
import { mapEmployeeRow } from "../utils/row-mappers";
import type {
  EmployeeListSortField,
  ListEmployeesQuery,
  UpdateEmployeeInput,
} from "../schemas/employee.schema";

/**
 * Exhaustive SQL column map for employee list sorting.
 * Every `EmployeeListSortField` must have a whitelist entry.
 * Category nulls sort last (both ASC and DESC).
 */
export const EMPLOYEE_LIST_SORT_COLUMNS = {
  name: "e.name",
  documentNumber: "e.document_number",
  phoneNumber: "e.phone_number",
  category: "ec.name",
  employeeType: "e.employee_type",
  active: "e.active",
} as const satisfies Record<EmployeeListSortField, string>;

/** Scoped category join: global (NULL company) or same-company customs only. */
const buildEmployeeCategoryJoin = () => `
  LEFT JOIN employee_categories ec
    ON ec.id = e.category_id
   AND (ec.company_id IS NULL OR ec.company_id = e.company_id)
`;

const buildEmployeeLastWorkedJoin = (companyIdParam = "@companyId") => `
  LEFT JOIN (
    SELECT employee_id, MAX(received_at) AS last_worked_at
    FROM attendance_records
    WHERE company_id = ${companyIdParam}
    GROUP BY employee_id
  ) lw ON lw.employee_id = e.id
`;

const buildEmployeeSelect = () => `
  SELECT
    e.*,
    lw.last_worked_at,
    ec.name AS category_name,
    ec.is_system AS category_is_system,
    ec.is_active AS category_is_active
  FROM employees e
  ${buildEmployeeCategoryJoin()}
  ${buildEmployeeLastWorkedJoin()}
`;

const buildEmployeeSelectWithoutLastWorked = () => `
  SELECT
    e.*,
    CAST(NULL AS DATETIME2) AS last_worked_at,
    ec.name AS category_name,
    ec.is_system AS category_is_system,
    ec.is_active AS category_is_active
  FROM employees e
  ${buildEmployeeCategoryJoin()}
`;

const resolveEmployeeOrderBy = (
  sortBy: EmployeeListSortField | undefined,
  sortDirection: "asc" | "desc",
): string => {
  if (sortBy === "category") {
    const direction = sortDirection === "asc" ? "ASC" : "DESC";
    // Null categories always last; then name; stable tie-break by id.
    return `CASE WHEN ec.name IS NULL THEN 1 ELSE 0 END ASC, ec.name ${direction}, e.id ASC`;
  }

  const orderBy = resolveSqlSort(
    sortBy,
    EMPLOYEE_LIST_SORT_COLUMNS,
    "e.created_at",
    sortBy ? sortDirection : "desc",
  );
  return `${orderBy}, e.id ASC`;
};

/** Assignable = in-scope and active. Same historical inactive allowed only when matching current. */
const categoryAssignablePredicate = (employeeAlias = "employees") => `
  (
    @categoryId IS NULL
    OR EXISTS (
      SELECT 1
      FROM employee_categories ec WITH (UPDLOCK, HOLDLOCK)
      WHERE ec.id = @categoryId
        AND (ec.company_id IS NULL OR ec.company_id = @companyId)
        AND (
          ec.is_active = 1
          OR ec.id = ${employeeAlias}.category_id
        )
    )
  )
`;

export const employeeRepository = {
  async create(
    companyId: string,
    input: {
      name: string;
      documentNumber: string | null;
      phoneNumber: string;
      employeeType: Employee["employeeType"];
      categoryId: string | null;
    },
    transaction?: sql.Transaction,
  ): Promise<Employee> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(150), input.name)
      .input("documentNumber", sql.NVarChar(50), input.documentNumber)
      .input("phoneNumber", sql.NVarChar(30), input.phoneNumber)
      .input("employeeType", sql.NVarChar(20), input.employeeType)
      .input("categoryId", sql.UniqueIdentifier, input.categoryId)
      .query(`
        INSERT INTO employees (company_id, name, document_number, phone_number, employee_type, category_id)
        OUTPUT INSERTED.id
        SELECT @companyId, @name, @documentNumber, @phoneNumber, @employeeType, @categoryId
        WHERE @categoryId IS NULL
           OR EXISTS (
             SELECT 1
             FROM employee_categories ec WITH (UPDLOCK, HOLDLOCK)
             WHERE ec.id = @categoryId
               AND ec.is_active = 1
               AND (ec.company_id IS NULL OR ec.company_id = @companyId)
           )
      `);

    if (!result.recordset[0]) {
      throw new AppError(
        400,
        "EMPLOYEE_CATEGORY_INVALID",
        "La categoría seleccionada no está disponible para esta empresa.",
      );
    }

    const withCategory = await this.findById(companyId, String(result.recordset[0].id), transaction);
    if (!withCategory) {
      throw new AppError(500, "EMPLOYEE_CREATE_FAILED", "No se pudo crear el colaborador.");
    }
    return withCategory;
  },

  async findById(
    companyId: string,
    id: string,
    transaction?: sql.Transaction,
  ): Promise<Employee | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id)
      .query(`${buildEmployeeSelect()} WHERE e.id = @id AND e.company_id = @companyId`);

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeRow(result.recordset[0] as Record<string, unknown>);
  },

  async listByIds(companyId: string, ids: string[]): Promise<Employee[]> {
    if (ids.length === 0) {
      return [];
    }

    const pool = getPool();
    const request = pool.request().input("companyId", sql.UniqueIdentifier, companyId);
    const idParams = ids.map((id, index) => {
      const param = `id${index}`;
      request.input(param, sql.UniqueIdentifier, id);
      return `@${param}`;
    });

    const result = await request.query(`
      ${buildEmployeeSelectWithoutLastWorked()}
      WHERE e.company_id = @companyId
        AND e.id IN (${idParams.join(", ")})
    `);

    return result.recordset.map((row) => mapEmployeeRow(row as Record<string, unknown>));
  },

  async findByPhone(companyId: string, phoneNumber: string): Promise<Employee | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phoneNumber", sql.NVarChar(30), phoneNumber)
      .query(`
        ${buildEmployeeSelectWithoutLastWorked()}
        WHERE e.phone_number = @phoneNumber AND e.company_id = @companyId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeRow(result.recordset[0] as Record<string, unknown>);
  },

  async listActiveByPhone(phoneNumber: string): Promise<Array<Employee & { companyId: string }>> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("phoneNumber", sql.NVarChar(30), phoneNumber)
      .query(`
        SELECT
          e.*,
          CAST(NULL AS DATETIME2) AS last_worked_at,
          ec.name AS category_name,
          ec.is_system AS category_is_system,
          ec.is_active AS category_is_active
        FROM employees e
        INNER JOIN companies c ON c.id = e.company_id
        ${buildEmployeeCategoryJoin()}
        WHERE e.phone_number = @phoneNumber
          AND e.active = 1
          AND c.status = 'ACTIVE'
        ORDER BY e.created_at ASC
      `);

    return result.recordset.map((row) => ({
      ...mapEmployeeRow(row as Record<string, unknown>),
      companyId: String((row as Record<string, unknown>).company_id),
    }));
  },

  async listActiveByCompanyId(companyId: string): Promise<Employee[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .query(`
        ${buildEmployeeSelectWithoutLastWorked()}
        WHERE e.company_id = @companyId
          AND e.active = 1
        ORDER BY e.name ASC, e.created_at ASC
      `);

    return result.recordset.map((row) => mapEmployeeRow(row as Record<string, unknown>));
  },

  async list(
    companyId: string,
    query: ListEmployeesQuery,
  ): Promise<{ items: Employee[]; total: number }> {
    const pool = getPool();
    const filters: SqlFilter[] = [
      {
        clause: "e.company_id = @companyId",
        apply: (request) => request.input("companyId", sql.UniqueIdentifier, companyId),
      },
    ];

    if (query.active !== undefined) {
      filters.push({
        clause: "e.active = @active",
        apply: (request) => request.input("active", sql.Bit, query.active),
      });
    }

    if (query.search) {
      filters.push({
        clause: "(e.name LIKE @search OR e.phone_number LIKE @search OR e.document_number LIKE @search)",
        apply: (request) => request.input("search", sql.NVarChar(150), `%${query.search}%`),
      });
    }

    if (query.categoryId === "none") {
      filters.push({
        clause: "e.category_id IS NULL",
        apply: () => undefined,
      });
    } else if (query.categoryId) {
      filters.push({
        clause: "e.category_id = @categoryId",
        apply: (request) => request.input("categoryId", sql.UniqueIdentifier, query.categoryId),
      });
    }

    const whereClause = buildWhereClause(filters);
    const sortDirection = query.sortDirection ?? "asc";
    const orderBy = resolveEmployeeOrderBy(query.sortBy, sortDirection);

    const countRequest = pool.request();
    applySqlFilters(countRequest, filters);
    const countResult = await countRequest.query(`
      SELECT COUNT(*) AS total
      FROM employees e
      ${whereClause}
    `);
    const total = Number(countResult.recordset[0].total);

    const dataRequest = pool.request();
    applySqlFilters(dataRequest, filters);
    dataRequest.input("offset", sql.Int, (query.page - 1) * query.limit);
    dataRequest.input("limit", sql.Int, query.limit);

    const dataResult = await dataRequest.query(`
      ${buildEmployeeSelect()}
      ${whereClause}
      ORDER BY ${orderBy}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return {
      items: dataResult.recordset.map((row) => mapEmployeeRow(row as Record<string, unknown>)),
      total,
    };
  },

  async update(
    companyId: string,
    id: string,
    input: UpdateEmployeeInput & { phoneNumber?: string },
    transaction?: sql.Transaction,
  ): Promise<Employee | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const fields: string[] = [];
    request.input("companyId", sql.UniqueIdentifier, companyId).input("id", sql.UniqueIdentifier, id);

    if (input.name !== undefined) {
      request.input("name", sql.NVarChar(150), input.name);
      fields.push("name = @name");
    }

    if (input.documentNumber !== undefined) {
      request.input("documentNumber", sql.NVarChar(50), input.documentNumber);
      fields.push("document_number = @documentNumber");
    }

    if (input.phoneNumber !== undefined) {
      request.input("phoneNumber", sql.NVarChar(30), input.phoneNumber);
      fields.push("phone_number = @phoneNumber");
    }

    if (input.employeeType !== undefined) {
      request.input("employeeType", sql.NVarChar(20), input.employeeType);
      fields.push("employee_type = @employeeType");
    }

    const updatingCategory = input.categoryId !== undefined;
    if (updatingCategory) {
      request.input("categoryId", sql.UniqueIdentifier, input.categoryId);
      fields.push("category_id = @categoryId");
    }

    if (input.active !== undefined) {
      request.input("active", sql.Bit, input.active);
      fields.push("active = @active");
    }

    if (fields.length === 0) {
      return this.findById(companyId, id, transaction);
    }

    fields.push("updated_at = SYSUTCDATETIME()");

    const categoryGuard = updatingCategory
      ? `AND ${categoryAssignablePredicate("employees")}`
      : "";

    const result = await request.query(`
      UPDATE employees
      SET ${fields.join(", ")}
      OUTPUT INSERTED.id
      WHERE id = @id AND company_id = @companyId
      ${categoryGuard}
    `);

    if (!result.recordset[0]) {
      if (updatingCategory) {
        const existing = await this.findById(companyId, id, transaction);
        if (!existing) {
          return null;
        }
        throw new AppError(
          400,
          "EMPLOYEE_CATEGORY_INVALID",
          "La categoría seleccionada no está disponible para esta empresa.",
        );
      }
      return null;
    }

    return this.findById(companyId, id, transaction);
  },

  async deactivate(companyId: string, id: string): Promise<Employee | null> {
    return this.update(companyId, id, { active: false });
  },

  async hasActiveOrScheduledOperations(companyId: string, employeeId: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT TOP 1 1 AS found
        FROM operation_assignments ie
        INNER JOIN scheduled_operations i ON i.id = ie.operation_id
        WHERE ie.employee_id = @employeeId
          AND ie.company_id = @companyId
          AND i.company_id = @companyId
          AND i.status IN ('SCHEDULED', 'IN_PROGRESS')
      `);

    return Boolean(result.recordset[0]);
  },
};
