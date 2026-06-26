import sql from "mssql";
import { getPool } from "../database/connection";
import type { AbsenceRequestStatus, EmployeeAbsenceBalance } from "../types/absence";
import { mapEmployeeAbsenceBalanceRow } from "../utils/row-mappers";

type RequestDayAggregate = {
  absenceTypeId: string;
  status: AbsenceRequestStatus;
  totalDays: number;
};

export const absenceBalanceRepository = {
  async findByEmployeeTypeYear(
    employeeId: string,
    absenceTypeId: string,
    year: number,
  ): Promise<EmployeeAbsenceBalance | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("absenceTypeId", sql.UniqueIdentifier, absenceTypeId)
      .input("year", sql.Int, year)
      .query(`
        SELECT TOP 1 *
        FROM employee_absence_balances
        WHERE employee_id = @employeeId
          AND absence_type_id = @absenceTypeId
          AND year = @year
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeAbsenceBalanceRow(result.recordset[0] as Record<string, unknown>);
  },

  async listByEmployeeYear(employeeId: string, year: number): Promise<EmployeeAbsenceBalance[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("year", sql.Int, year)
      .query(`
        SELECT *
        FROM employee_absence_balances
        WHERE employee_id = @employeeId
          AND year = @year
        ORDER BY absence_type_id
      `);

    return result.recordset.map((row) =>
      mapEmployeeAbsenceBalanceRow(row as Record<string, unknown>),
    );
  },

  async upsert(input: {
    employeeId: string;
    absenceTypeId: string;
    year: number;
    totalDays: number;
    notes?: string | null;
  }): Promise<EmployeeAbsenceBalance> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("absenceTypeId", sql.UniqueIdentifier, input.absenceTypeId)
      .input("year", sql.Int, input.year)
      .input("totalDays", sql.Decimal(5, 1), input.totalDays)
      .input("notes", sql.NVarChar(500), input.notes ?? null)
      .query(`
        MERGE employee_absence_balances AS target
        USING (
          SELECT
            @employeeId AS employee_id,
            @absenceTypeId AS absence_type_id,
            @year AS year
        ) AS source
          ON target.employee_id = source.employee_id
         AND target.absence_type_id = source.absence_type_id
         AND target.year = source.year
        WHEN MATCHED THEN
          UPDATE SET
            total_days = @totalDays,
            notes = @notes,
            updated_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (employee_id, absence_type_id, year, total_days, notes)
          VALUES (@employeeId, @absenceTypeId, @year, @totalDays, @notes)
        OUTPUT INSERTED.*;
      `);

    return mapEmployeeAbsenceBalanceRow(result.recordset[0] as Record<string, unknown>);
  },

  async aggregateRequestDaysByEmployeeYear(
    employeeId: string,
    year: number,
  ): Promise<RequestDayAggregate[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("year", sql.Int, year)
      .query(`
        SELECT
          absence_type_id,
          status,
          SUM(total_days) AS total_days
        FROM absence_requests
        WHERE employee_id = @employeeId
          AND YEAR(start_date) = @year
        GROUP BY absence_type_id, status
      `);

    return result.recordset.map((row) => ({
      absenceTypeId: String(row.absence_type_id),
      status: String(row.status) as AbsenceRequestStatus,
      totalDays: Number(row.total_days ?? 0),
    }));
  },
};
