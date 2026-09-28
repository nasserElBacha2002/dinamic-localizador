import { getPool } from "../database/connection";
import {
  applyEmployeeWorkdayStatisticsFilters,
  buildEmployeeWorkdayStatisticsCte,
  buildEmployeeWorkdayStatisticsFilters,
  buildStatisticsWhereFromFilters,
} from "../utils/employee-workday-statistics-projection";
import type { StatisticsFilters } from "../schemas/statistics.schema";

export type MonthlyAttendanceReportRow = {
  employee_workday_id: string;
  employee_id: string;
  employee_name: string;
  operation_workday_id: string;
  operation_id: string;
  service_id: string;
  service_name: string;
  work_date: Date | string;
  operation_shift_id: string | null;
  shift_name_snapshot: string | null;
  expectation_status: string;
  confirmation_status: string | null;
  effective_state: string;
  expected_start_at: Date | string;
  expected_end_at: Date | string | null;
  late_tolerance_minutes: number;
  check_in_at: Date | string | null;
  check_out_at: Date | string | null;
  validation_status: string | null;
  location_status: string | null;
  punctuality_status: string | null;
  checkout_status: string | null;
  worked_minutes: number;
  overtime_minutes: number;
  is_on_time_workday: number;
  is_late_workday: number;
  is_early_departure_workday: number;
};

/** Single tenant-scoped monthly read built on the Statistics employee_workday CTE. */
export const monthlyAttendanceReportRepository = {
  async listRows(input: {
    companyId: string;
    dateFrom: string;
    dateTo: string;
    referenceAt: Date;
  }): Promise<MonthlyAttendanceReportRow[]> {
    const filters: StatisticsFilters = {
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      openAttendance: false,
      incompleteCoverage: false,
      export: false,
      operationIds: [],
      serviceIds: [],
      employeeIds: [],
      workTeamIds: [],
    };
    const sqlFilters = buildEmployeeWorkdayStatisticsFilters(input.companyId, filters);
    const cte = buildEmployeeWorkdayStatisticsCte(buildStatisticsWhereFromFilters(sqlFilters));
    const request = getPool().request();
    applyEmployeeWorkdayStatisticsFilters(request, sqlFilters, input.referenceAt);
    const result = await request.query(`
      ${cte}
      SELECT
        employee_workday_id, employee_id, employee_name,
        operation_workday_id, operation_id, service_id, service_name, work_date,
        operation_shift_id, shift_name_snapshot,
        expectation_status, confirmation_status, effective_state,
        expected_start_at, expected_end_at, late_tolerance_minutes,
        check_in_at, check_out_at, validation_status, location_status,
        punctuality_status, checkout_status, worked_minutes, overtime_minutes,
        is_on_time_workday, is_late_workday, is_early_departure_workday
      FROM employee_workday_statistics
      ORDER BY work_date ASC, service_name ASC, employee_name ASC, employee_workday_id ASC
    `);
    return result.recordset as MonthlyAttendanceReportRow[];
  },
};
