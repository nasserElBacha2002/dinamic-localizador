import sql from "mssql";
import { getPool } from "../database/connection";

export interface StatisticsGrainAuditCompanyRow {
  companyId: string;
  employeeWorkdays: number;
  linkedAttendance: number;
  legacyAttendanceWithoutWorkday: number;
  duplicateAttendancePerWorkday: number;
  justifiedWithAttendance: number;
  cancelledWithAttendance: number;
  simulationAttendanceLinked: number;
}

export interface StatisticsGrainAuditReport {
  global: {
    employeeWorkdays: number;
    linkedAttendance: number;
    legacyAttendanceWithoutWorkday: number;
    duplicateAttendancePerWorkday: number;
    justifiedWithAttendance: number;
    cancelledWithAttendance: number;
    simulationAttendanceLinked: number;
  };
  companies: StatisticsGrainAuditCompanyRow[];
}

const toNumber = (value: unknown): number => Number(value ?? 0);

export const runStatisticsGrainAudit = async (companyId?: string): Promise<StatisticsGrainAuditReport> => {
  const pool = getPool();
  const companyFilter = companyId ? "WHERE c.id = @companyId" : "";
  const request = pool.request();
  if (companyId) {
    request.input("companyId", sql.UniqueIdentifier, companyId);
  }

  const result = await request.query(`
    WITH company_scope AS (
      SELECT c.id AS company_id
      FROM companies c
      ${companyFilter}
    ),
    linked_production AS (
      SELECT ar.company_id, ar.employee_workday_id
      FROM attendance_records ar
      INNER JOIN company_scope cs ON cs.company_id = ar.company_id
      WHERE ar.is_simulation = 0
        AND ar.employee_workday_id IS NOT NULL
    ),
    duplicate_counts AS (
      SELECT company_id, employee_workday_id
      FROM linked_production
      GROUP BY company_id, employee_workday_id
      HAVING COUNT(*) > 1
    ),
    company_metrics AS (
      SELECT
        cs.company_id,
        (
          SELECT COUNT(*)
          FROM employee_workdays ew
          WHERE ew.company_id = cs.company_id
        ) AS employee_workdays,
        (
          SELECT COUNT(*)
          FROM attendance_records ar
          WHERE ar.company_id = cs.company_id
            AND ar.is_simulation = 0
            AND ar.employee_workday_id IS NOT NULL
        ) AS linked_attendance,
        (
          SELECT COUNT(*)
          FROM attendance_records ar
          WHERE ar.company_id = cs.company_id
            AND ar.is_simulation = 0
            AND ar.employee_workday_id IS NULL
        ) AS legacy_attendance_without_workday,
        (
          SELECT COUNT(*)
          FROM duplicate_counts dc
          WHERE dc.company_id = cs.company_id
        ) AS duplicate_attendance_per_workday,
        (
          SELECT COUNT(*)
          FROM employee_workdays ew
          INNER JOIN attendance_records ar
            ON ar.employee_workday_id = ew.id
           AND ar.company_id = ew.company_id
           AND ar.is_simulation = 0
          WHERE ew.company_id = cs.company_id
            AND ew.expectation_status = N'JUSTIFIED'
        ) AS justified_with_attendance,
        (
          SELECT COUNT(*)
          FROM employee_workdays ew
          INNER JOIN attendance_records ar
            ON ar.employee_workday_id = ew.id
           AND ar.company_id = ew.company_id
           AND ar.is_simulation = 0
          WHERE ew.company_id = cs.company_id
            AND ew.expectation_status = N'CANCELLED'
        ) AS cancelled_with_attendance,
        (
          SELECT COUNT(*)
          FROM attendance_records ar
          WHERE ar.company_id = cs.company_id
            AND ar.is_simulation = 1
            AND ar.employee_workday_id IS NOT NULL
        ) AS simulation_attendance_linked
      FROM company_scope cs
    )
    SELECT
      company_id,
      employee_workdays,
      linked_attendance,
      legacy_attendance_without_workday,
      duplicate_attendance_per_workday,
      justified_with_attendance,
      cancelled_with_attendance,
      simulation_attendance_linked
    FROM company_metrics
    ORDER BY company_id ASC
  `);

  const companies = result.recordset.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      companyId: String(record.company_id),
      employeeWorkdays: toNumber(record.employee_workdays),
      linkedAttendance: toNumber(record.linked_attendance),
      legacyAttendanceWithoutWorkday: toNumber(record.legacy_attendance_without_workday),
      duplicateAttendancePerWorkday: toNumber(record.duplicate_attendance_per_workday),
      justifiedWithAttendance: toNumber(record.justified_with_attendance),
      cancelledWithAttendance: toNumber(record.cancelled_with_attendance),
      simulationAttendanceLinked: toNumber(record.simulation_attendance_linked),
    };
  });

  const global = companies.reduce(
    (totals, company) => ({
      employeeWorkdays: totals.employeeWorkdays + company.employeeWorkdays,
      linkedAttendance: totals.linkedAttendance + company.linkedAttendance,
      legacyAttendanceWithoutWorkday:
        totals.legacyAttendanceWithoutWorkday + company.legacyAttendanceWithoutWorkday,
      duplicateAttendancePerWorkday:
        totals.duplicateAttendancePerWorkday + company.duplicateAttendancePerWorkday,
      justifiedWithAttendance: totals.justifiedWithAttendance + company.justifiedWithAttendance,
      cancelledWithAttendance: totals.cancelledWithAttendance + company.cancelledWithAttendance,
      simulationAttendanceLinked:
        totals.simulationAttendanceLinked + company.simulationAttendanceLinked,
    }),
    {
      employeeWorkdays: 0,
      linkedAttendance: 0,
      legacyAttendanceWithoutWorkday: 0,
      duplicateAttendancePerWorkday: 0,
      justifiedWithAttendance: 0,
      cancelledWithAttendance: 0,
      simulationAttendanceLinked: 0,
    },
  );

  return { global, companies };
};
