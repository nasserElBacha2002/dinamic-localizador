// Phase 2.3 terminology note: Employee remains the technical DB/API model (employees table).
// Conceptually this represents a Worker — see types/operational-domain.ts.
import sql from "mssql";
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
 */
export const EMPLOYEE_LIST_SORT_COLUMNS = {
  name: "e.name",
  documentNumber: "e.document_number",
  phoneNumber: "e.phone_number",
  category: "ec.name",
  employeeType: "e.employee_type",
  active: "e.active",
} as const satisfies Record<EmployeeListSortField, string>;

const buildEmployeeLastWorkedJoin = (companyIdParam = "@companyId") => `
  LEFT JOIN (
    SELECT employee_id, MAX(received_at) AS last_worked_at
    FROM attendance_records
    WHERE company_id = ${companyIdParam}
    GROUP BY employee_id
  ) lw ON lw.employee_id = e.id
`;

const buildEmployeeCategoryJoin = () => `
  LEFT JOIN employee_categories ec ON ec.id = e.category_id
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
        OUTPUT INSERTED.*
        VALUES (@companyId, @name, @documentNumber, @phoneNumber, @employeeType, @categoryId)
      `);

    const inserted = result.recordset[0] as Record<string, unknown>;
    const withCategory = await this.findById(companyId, String(inserted.id), transaction);
    return withCategory ?? mapEmployeeRow(inserted);
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
    const orderBy = resolveSqlSort(
      query.sortBy,
      EMPLOYEE_LIST_SORT_COLUMNS,
      "e.created_at",
      query.sortBy ? sortDirection : "desc",
    );

    const countRequest = pool.request();
    applySqlFilters(countRequest, filters);
    const countResult = await countRequest.query(`
      SELECT COUNT(*) AS total
      FROM employees e
      ${buildEmployeeCategoryJoin()}
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
      ORDER BY ${orderBy}, e.id ASC
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
  ): Promise<Employee | null> {
    const pool = getPool();
    const fields: string[] = [];
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("id", sql.UniqueIdentifier, id);

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

    if (input.categoryId !== undefined) {
      request.input("categoryId", sql.UniqueIdentifier, input.categoryId);
      fields.push("category_id = @categoryId");
    }

    if (input.active !== undefined) {
      request.input("active", sql.Bit, input.active);
      fields.push("active = @active");
    }

    if (fields.length === 0) {
      return this.findById(companyId, id);
    }

    fields.push("updated_at = SYSUTCDATETIME()");

    const result = await request.query(`
      UPDATE employees
      SET ${fields.join(", ")}
      OUTPUT INSERTED.id
      WHERE id = @id AND company_id = @companyId
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return this.findById(companyId, id);
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
