import sql from "mssql";
import { getPool } from "../database/connection";
import type { AbsenceRequestStatus, EmployeeAbsenceBalance } from "../types/absence";
import { mapEmployeeAbsenceBalanceRow } from "../utils/row-mappers";

type RequestDayAggregate = {
  absenceTypeId: string;
  status: AbsenceRequestStatus;
  totalDays: number;
};

const isUniqueConstraintError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.message.includes("UQ_employee_absence_balances_employee_type_year") ||
    error.message.includes("duplicate key"));

const upsertInTransaction = async (
  input: {
    employeeId: string;
    absenceTypeId: string;
    year: number;
    totalDays: number;
    notes?: string | null;
  },
  transaction: sql.Transaction,
): Promise<EmployeeAbsenceBalance> => {
  const updateResult = await new sql.Request(transaction)
    .input("employeeId", sql.UniqueIdentifier, input.employeeId)
    .input("absenceTypeId", sql.UniqueIdentifier, input.absenceTypeId)
    .input("year", sql.Int, input.year)
    .input("totalDays", sql.Decimal(5, 1), input.totalDays)
    .input("notes", sql.NVarChar(500), input.notes ?? null)
    .query(`
      UPDATE employee_absence_balances WITH (UPDLOCK, HOLDLOCK)
      SET
        total_days = @totalDays,
        notes = @notes,
        updated_at = SYSUTCDATETIME()
      WHERE employee_id = @employeeId
        AND absence_type_id = @absenceTypeId
        AND year = @year
    `);

  if (updateResult.rowsAffected[0] === 0) {
    try {
      await new sql.Request(transaction)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("absenceTypeId", sql.UniqueIdentifier, input.absenceTypeId)
        .input("year", sql.Int, input.year)
        .input("totalDays", sql.Decimal(5, 1), input.totalDays)
        .input("notes", sql.NVarChar(500), input.notes ?? null)
        .query(`
          INSERT INTO employee_absence_balances (
            employee_id, absence_type_id, year, total_days, notes
          )
          VALUES (@employeeId, @absenceTypeId, @year, @totalDays, @notes)
        `);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const retryUpdate = await new sql.Request(transaction)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("absenceTypeId", sql.UniqueIdentifier, input.absenceTypeId)
        .input("year", sql.Int, input.year)
        .input("totalDays", sql.Decimal(5, 1), input.totalDays)
        .input("notes", sql.NVarChar(500), input.notes ?? null)
        .query(`
          UPDATE employee_absence_balances WITH (UPDLOCK, HOLDLOCK)
          SET
            total_days = @totalDays,
            notes = @notes,
            updated_at = SYSUTCDATETIME()
          WHERE employee_id = @employeeId
            AND absence_type_id = @absenceTypeId
            AND year = @year
        `);

      if (retryUpdate.rowsAffected[0] === 0) {
        throw error;
      }
    }
  }

  const saved = await new sql.Request(transaction)
    .input("employeeId", sql.UniqueIdentifier, input.employeeId)
    .input("absenceTypeId", sql.UniqueIdentifier, input.absenceTypeId)
    .input("year", sql.Int, input.year)
    .query(`
      SELECT TOP 1 *
      FROM employee_absence_balances
      WHERE employee_id = @employeeId
        AND absence_type_id = @absenceTypeId
        AND year = @year
    `);

  return mapEmployeeAbsenceBalanceRow(saved.recordset[0] as Record<string, unknown>);
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

  async upsert(
    input: {
      employeeId: string;
      absenceTypeId: string;
      year: number;
      totalDays: number;
      notes?: string | null;
    },
    transaction?: sql.Transaction,
  ): Promise<EmployeeAbsenceBalance> {
    if (transaction) {
      return upsertInTransaction(input, transaction);
    }

    const pool = getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();

    try {
      const saved = await upsertInTransaction(input, tx);
      await tx.commit();
      return saved;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  },

  async lockAndGetApprovalBalanceSnapshot(
    employeeId: string,
    absenceTypeId: string,
    year: number,
    transaction: sql.Transaction,
  ): Promise<{ assignedDays: number; approvedDays: number }> {
    await new sql.Request(transaction)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("absenceTypeId", sql.UniqueIdentifier, absenceTypeId)
      .input("year", sql.Int, year)
      .query(`
        SELECT id
        FROM absence_requests WITH (UPDLOCK, HOLDLOCK)
        WHERE employee_id = @employeeId
          AND absence_type_id = @absenceTypeId
          AND YEAR(start_date) = @year
          AND status IN ('APPROVED', 'PENDING', 'NEEDS_INFO')
      `);

    const balanceResult = await new sql.Request(transaction)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("absenceTypeId", sql.UniqueIdentifier, absenceTypeId)
      .input("year", sql.Int, year)
      .query(`
        SELECT TOP 1 total_days
        FROM employee_absence_balances WITH (UPDLOCK, HOLDLOCK)
        WHERE employee_id = @employeeId
          AND absence_type_id = @absenceTypeId
          AND year = @year
      `);

    const approvedResult = await new sql.Request(transaction)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("absenceTypeId", sql.UniqueIdentifier, absenceTypeId)
      .input("year", sql.Int, year)
      .query(`
        SELECT COALESCE(SUM(total_days), 0) AS total_days
        FROM absence_requests
        WHERE employee_id = @employeeId
          AND absence_type_id = @absenceTypeId
          AND YEAR(start_date) = @year
          AND status = 'APPROVED'
      `);

    return {
      assignedDays: balanceResult.recordset[0]
        ? Number(balanceResult.recordset[0].total_days ?? 0)
        : 0,
      approvedDays: Number(approvedResult.recordset[0]?.total_days ?? 0),
    };
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
