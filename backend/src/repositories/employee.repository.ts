import sql from "mssql";
import { getPool } from "../database/connection";
import type { Employee } from "../types/domain";
import { applySqlFilters, buildWhereClause, type SqlFilter } from "../utils/sql-list-query";
import { mapEmployeeRow } from "../utils/row-mappers";
import type { ListEmployeesQuery, UpdateEmployeeInput } from "../schemas/employee.schema";

export const employeeRepository = {
  async create(input: {
    name: string;
    documentNumber: string | null;
    phoneNumber: string;
    employeeType: Employee["employeeType"];
  }): Promise<Employee> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("name", sql.NVarChar(150), input.name)
      .input("documentNumber", sql.NVarChar(50), input.documentNumber)
      .input("phoneNumber", sql.NVarChar(30), input.phoneNumber)
      .input("employeeType", sql.NVarChar(20), input.employeeType)
      .query(`
        INSERT INTO employees (name, document_number, phone_number, employee_type)
        OUTPUT INSERTED.*
        VALUES (@name, @documentNumber, @phoneNumber, @employeeType)
      `);

    return mapEmployeeRow(result.recordset[0] as Record<string, unknown>);
  },

  async findById(id: string): Promise<Employee | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query("SELECT * FROM employees WHERE id = @id");

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByPhone(phoneNumber: string): Promise<Employee | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("phoneNumber", sql.NVarChar(30), phoneNumber)
      .query("SELECT * FROM employees WHERE phone_number = @phoneNumber");

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeRow(result.recordset[0] as Record<string, unknown>);
  },

  async list(query: ListEmployeesQuery): Promise<{ items: Employee[]; total: number }> {
    const pool = getPool();
    const filters: SqlFilter[] = [];

    if (query.active !== undefined) {
      filters.push({
        clause: "active = @active",
        apply: (request) => request.input("active", sql.Bit, query.active),
      });
    }

    if (query.search) {
      filters.push({
        clause: "(name LIKE @search OR phone_number LIKE @search OR document_number LIKE @search)",
        apply: (request) => request.input("search", sql.NVarChar(150), `%${query.search}%`),
      });
    }

    const whereClause = buildWhereClause(filters);

    const countRequest = pool.request();
    applySqlFilters(countRequest, filters);
    const countResult = await countRequest.query(`SELECT COUNT(*) AS total FROM employees ${whereClause}`);
    const total = Number(countResult.recordset[0].total);

    const dataRequest = pool.request();
    applySqlFilters(dataRequest, filters);
    dataRequest.input("offset", sql.Int, (query.page - 1) * query.limit);
    dataRequest.input("limit", sql.Int, query.limit);

    const dataResult = await dataRequest.query(`
      SELECT *
      FROM employees
      ${whereClause}
      ORDER BY created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return {
      items: dataResult.recordset.map((row) => mapEmployeeRow(row as Record<string, unknown>)),
      total,
    };
  },

  async update(id: string, input: UpdateEmployeeInput & { phoneNumber?: string }): Promise<Employee | null> {
    const pool = getPool();
    const fields: string[] = [];
    const request = pool.request().input("id", sql.UniqueIdentifier, id);

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

    if (input.active !== undefined) {
      request.input("active", sql.Bit, input.active);
      fields.push("active = @active");
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push("updated_at = SYSUTCDATETIME()");

    const result = await request.query(`
      UPDATE employees
      SET ${fields.join(", ")}
      OUTPUT INSERTED.*
      WHERE id = @id
    `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeRow(result.recordset[0] as Record<string, unknown>);
  },

  async deactivate(id: string): Promise<Employee | null> {
    return this.update(id, { active: false });
  },

  async hasActiveOrScheduledInventories(employeeId: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT TOP 1 1 AS found
        FROM inventory_employees ie
        INNER JOIN inventories i ON i.id = ie.inventory_id
        WHERE ie.employee_id = @employeeId
          AND i.status IN ('SCHEDULED', 'IN_PROGRESS')
      `);

    return Boolean(result.recordset[0]);
  },
};
