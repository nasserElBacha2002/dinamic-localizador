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
  companyId: string,
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
    .input("companyId", sql.UniqueIdentifier, companyId)
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
        AND company_id = @companyId
    `);

  if (updateResult.rowsAffected[0] === 0) {
    try {
      await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("absenceTypeId", sql.UniqueIdentifier, input.absenceTypeId)
        .input("year", sql.Int, input.year)
        .input("totalDays", sql.Decimal(5, 1), input.totalDays)
        .input("notes", sql.NVarChar(500), input.notes ?? null)
        .query(`
          INSERT INTO employee_absence_balances (
            company_id, employee_id, absence_type_id, year, total_days, notes
          )
          VALUES (@companyId, @employeeId, @absenceTypeId, @year, @totalDays, @notes)
        `);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const retryUpdate = await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
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
            AND company_id = @companyId
        `);

      if (retryUpdate.rowsAffected[0] === 0) {
        throw error;
      }
    }
  }

  const saved = await new sql.Request(transaction)
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("employeeId", sql.UniqueIdentifier, input.employeeId)
    .input("absenceTypeId", sql.UniqueIdentifier, input.absenceTypeId)
    .input("year", sql.Int, input.year)
    .query(`
      SELECT TOP 1 *
      FROM employee_absence_balances
      WHERE employee_id = @employeeId
        AND absence_type_id = @absenceTypeId
        AND year = @year
        AND company_id = @companyId
    `);

  return mapEmployeeAbsenceBalanceRow(saved.recordset[0] as Record<string, unknown>);
};

export const absenceBalanceRepository = {
  async findByEmployeeTypeYear(
    companyId: string,
    employeeId: string,
    absenceTypeId: string,
    year: number,
  ): Promise<EmployeeAbsenceBalance | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("absenceTypeId", sql.UniqueIdentifier, absenceTypeId)
      .input("year", sql.Int, year)
      .query(`
        SELECT TOP 1 *
        FROM employee_absence_balances
        WHERE employee_id = @employeeId
          AND absence_type_id = @absenceTypeId
          AND year = @year
          AND company_id = @companyId
      `);

    if (!result.recordset[0]) {
      return null;
    }

    return mapEmployeeAbsenceBalanceRow(result.recordset[0] as Record<string, unknown>);
  },

  async listByEmployeeYear(
    companyId: string,
    employeeId: string,
    year: number,
  ): Promise<EmployeeAbsenceBalance[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("year", sql.Int, year)
      .query(`
        SELECT *
        FROM employee_absence_balances
        WHERE employee_id = @employeeId
          AND year = @year
          AND company_id = @companyId
        ORDER BY absence_type_id
      `);

    return result.recordset.map((row) =>
      mapEmployeeAbsenceBalanceRow(row as Record<string, unknown>),
    );
  },

  async createIfNotExists(
    companyId: string,
    input: {
      employeeId: string;
      absenceTypeId: string;
      year: number;
      totalDays: number;
      notes?: string | null;
    },
    transaction?: sql.Transaction,
  ): Promise<EmployeeAbsenceBalance | null> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();

    try {
      const result = await request
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("absenceTypeId", sql.UniqueIdentifier, input.absenceTypeId)
        .input("year", sql.Int, input.year)
        .input("totalDays", sql.Decimal(5, 1), input.totalDays)
        .input("notes", sql.NVarChar(500), input.notes ?? null)
        .query(`
          IF NOT EXISTS (
            SELECT 1
            FROM employee_absence_balances
            WHERE company_id = @companyId
              AND employee_id = @employeeId
              AND absence_type_id = @absenceTypeId
              AND year = @year
          )
          BEGIN
            INSERT INTO employee_absence_balances (
              company_id, employee_id, absence_type_id, year, total_days, notes
            )
            VALUES (@companyId, @employeeId, @absenceTypeId, @year, @totalDays, @notes);
          END

          SELECT TOP 1 *
          FROM employee_absence_balances
          WHERE company_id = @companyId
            AND employee_id = @employeeId
            AND absence_type_id = @absenceTypeId
            AND year = @year
        `);

      if (!result.recordset[0]) {
        return null;
      }

      return mapEmployeeAbsenceBalanceRow(result.recordset[0] as Record<string, unknown>);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const fallbackRequest = transaction ? new sql.Request(transaction) : getPool().request();
      const fallback = await fallbackRequest
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("absenceTypeId", sql.UniqueIdentifier, input.absenceTypeId)
        .input("year", sql.Int, input.year)
        .query(`
          SELECT TOP 1 *
          FROM employee_absence_balances
          WHERE company_id = @companyId
            AND employee_id = @employeeId
            AND absence_type_id = @absenceTypeId
            AND year = @year
        `);

      if (!fallback.recordset[0]) {
        return null;
      }

      return mapEmployeeAbsenceBalanceRow(fallback.recordset[0] as Record<string, unknown>);
    }
  },

  async upsert(
    companyId: string,
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
      return upsertInTransaction(companyId, input, transaction);
    }

    const pool = getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();

    try {
      const saved = await upsertInTransaction(companyId, input, tx);
      await tx.commit();
      return saved;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  },

  async lockAndGetApprovalBalanceSnapshot(
    companyId: string,
    employeeId: string,
    absenceTypeId: string,
    year: number,
    transaction: sql.Transaction,
  ): Promise<{ assignedDays: number; approvedDays: number }> {
    await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("absenceTypeId", sql.UniqueIdentifier, absenceTypeId)
      .input("year", sql.Int, year)
      .query(`
        SELECT id
        FROM absence_requests WITH (UPDLOCK, HOLDLOCK)
        WHERE employee_id = @employeeId
          AND absence_type_id = @absenceTypeId
          AND YEAR(start_date) = @year
          AND company_id = @companyId
          AND status IN ('APPROVED', 'PENDING', 'NEEDS_INFO')
      `);

    const balanceResult = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("absenceTypeId", sql.UniqueIdentifier, absenceTypeId)
      .input("year", sql.Int, year)
      .query(`
        SELECT TOP 1 total_days
        FROM employee_absence_balances WITH (UPDLOCK, HOLDLOCK)
        WHERE employee_id = @employeeId
          AND absence_type_id = @absenceTypeId
          AND year = @year
          AND company_id = @companyId
      `);

    const approvedResult = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("absenceTypeId", sql.UniqueIdentifier, absenceTypeId)
      .input("year", sql.Int, year)
      .query(`
        SELECT COALESCE(SUM(total_days), 0) AS total_days
        FROM absence_requests
        WHERE employee_id = @employeeId
          AND absence_type_id = @absenceTypeId
          AND YEAR(start_date) = @year
          AND company_id = @companyId
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
    companyId: string,
    employeeId: string,
    year: number,
  ): Promise<RequestDayAggregate[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
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
          AND company_id = @companyId
        GROUP BY absence_type_id, status
      `);

    return result.recordset.map((row) => ({
      absenceTypeId: String(row.absence_type_id),
      status: String(row.status) as AbsenceRequestStatus,
      totalDays: Number(row.total_days ?? 0),
    }));
  },
};
