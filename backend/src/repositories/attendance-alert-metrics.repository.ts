import sql from "mssql";
import { getPool } from "../database/connection";
import { EFFECTIVE_STATE_SQL } from "../utils/employee-workday-statistics-projection";
import { CANONICAL_PRODUCTION_ATTENDANCE_APPLY } from "../utils/statistics-canonical-attendance";
import {
  calculatePreciseAttendanceRate,
  formatAttendanceRateForDisplay,
} from "../utils/admin-alert/attendance-threshold";

export type EmployeeAttendanceWindowMetrics = {
  companyId: string;
  employeeId: string;
  employeeName: string;
  presentWorkdays: number;
  absentWorkdays: number;
  evaluatedWorkdays: number;
  /** Precise 0–100 for crossing comparisons. */
  preciseRate: number;
  /** Same rounding as statistics (1 decimal). */
  displayRate: number;
};

/**
 * Attendance rate for threshold alerts — same effective-state semantics as statistics:
 * PRESENT / (PRESENT + ABSENT). JUSTIFIED, EXPECTED (open/future), CANCELLED excluded.
 */
export const attendanceAlertMetricsRepository = {
  async getEmployeeWindowMetrics(input: {
    companyId: string;
    employeeId: string;
    windowDays: number;
    referenceAt?: Date;
  }): Promise<EmployeeAttendanceWindowMetrics | null> {
    const referenceAt = input.referenceAt ?? new Date();
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("windowDays", sql.Int, input.windowDays)
      .input("referenceAt", sql.DateTime2, referenceAt)
      .query(`
        ;WITH windowed AS (
          SELECT
            e.name AS employee_name,
            ${EFFECTIVE_STATE_SQL} AS effective_state
          FROM employee_workdays ew
          INNER JOIN employees e
            ON e.id = ew.employee_id AND e.company_id = ew.company_id
          INNER JOIN operation_workdays ow
            ON ow.id = ew.operation_workday_id AND ow.company_id = ew.company_id
          ${CANONICAL_PRODUCTION_ATTENDANCE_APPLY}
          WHERE ew.company_id = @companyId
            AND ew.employee_id = @employeeId
            AND ow.work_date >= CAST(DATEADD(DAY, -@windowDays, @referenceAt) AS DATE)
            AND ow.work_date <= CAST(@referenceAt AS DATE)
        )
        SELECT
          MAX(employee_name) AS employee_name,
          SUM(CASE WHEN effective_state = N'PRESENT' THEN 1 ELSE 0 END) AS present_workdays,
          SUM(CASE WHEN effective_state = N'ABSENT' THEN 1 ELSE 0 END) AS absent_workdays
        FROM windowed
      `);

    const row = result.recordset[0] as Record<string, unknown> | undefined;
    if (!row || row.employee_name == null) {
      // Employee may exist with zero workdays in window.
      const employee = await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .query(`
          SELECT name FROM employees
          WHERE id = @employeeId AND company_id = @companyId
        `);
      if (!employee.recordset[0]) {
        return null;
      }
      return {
        companyId: input.companyId,
        employeeId: input.employeeId,
        employeeName: String(employee.recordset[0].name),
        presentWorkdays: 0,
        absentWorkdays: 0,
        evaluatedWorkdays: 0,
        preciseRate: 0,
        displayRate: 0,
      };
    }

    const presentWorkdays = Number(row.present_workdays ?? 0);
    const absentWorkdays = Number(row.absent_workdays ?? 0);
    return {
      companyId: input.companyId,
      employeeId: input.employeeId,
      employeeName: String(row.employee_name),
      presentWorkdays,
      absentWorkdays,
      evaluatedWorkdays: presentWorkdays + absentWorkdays,
      preciseRate: calculatePreciseAttendanceRate(presentWorkdays, absentWorkdays),
      displayRate: formatAttendanceRateForDisplay(presentWorkdays, absentWorkdays),
    };
  },
};
