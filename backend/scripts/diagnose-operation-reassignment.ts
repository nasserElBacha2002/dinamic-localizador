import sql from "mssql";
import { connectDatabase, closeDatabase, getPool } from "../src/database/connection";
import {
  exitWithError,
  parseOperationReassignmentCliArgs,
  printOperationalEnvironment,
} from "./operation-reassignment-cli";

async function main(): Promise<void> {
  const args = parseOperationReassignmentCliArgs(process.argv.slice(2));
  printOperationalEnvironment();

  await connectDatabase();
  const pool = getPool();

  try {
    const operation = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, args.companyId)
      .input("operationId", sql.UniqueIdentifier, args.operationId)
      .query(`
        SELECT o.*, s.name AS service_name
        FROM scheduled_operations o
        LEFT JOIN operational_locations s
          ON s.id = o.service_id AND s.company_id = o.company_id
        WHERE o.id = @operationId AND o.company_id = @companyId
      `);

    if (!operation.recordset[0]) {
      throw new Error("Operación no encontrada para la compañía indicada");
    }

    console.log("\n=== OPERATION ===");
    console.log(JSON.stringify(operation.recordset[0], null, 2));

    const assignments = await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, args.operationId)
      .input("companyId", sql.UniqueIdentifier, args.companyId)
      .query(`
        SELECT oa.*, e.name AS employee_name
        FROM operation_assignments oa
        LEFT JOIN employees e ON e.id = oa.employee_id AND e.company_id = oa.company_id
        WHERE oa.operation_id = @operationId AND oa.company_id = @companyId
        ORDER BY e.name, oa.created_at
      `);
    console.log("\n=== ASSIGNMENTS ===");
    console.log(JSON.stringify(assignments.recordset, null, 2));

    const workdayFilter = args.workDate
      ? "AND CAST(ow.work_date AS DATE) = @workDate"
      : "";

    const workdayRequest = pool
      .request()
      .input("operationId", sql.UniqueIdentifier, args.operationId)
      .input("companyId", sql.UniqueIdentifier, args.companyId);
    if (args.workDate) {
      workdayRequest.input("workDate", sql.Date, args.workDate);
    }

    const employeeWorkdays = await workdayRequest.query(`
      SELECT
        ew.id,
        ow.work_date,
        ew.employee_id,
        e.name AS employee_name,
        ew.operation_assignment_id,
        oa.cancelled_at AS linked_assignment_cancelled_at,
        ew.expectation_status,
        ew.cancellation_reason
      FROM employee_workdays ew
      INNER JOIN operation_workdays ow ON ow.id = ew.operation_workday_id
      LEFT JOIN employees e ON e.id = ew.employee_id
      LEFT JOIN operation_assignments oa ON oa.id = ew.operation_assignment_id
      WHERE ow.operation_id = @operationId
        AND ow.company_id = @companyId
        ${workdayFilter}
      ORDER BY ow.work_date, e.name
    `);

    console.log("\n=== EMPLOYEE WORKDAYS ===");
    console.log(JSON.stringify(employeeWorkdays.recordset, null, 2));

    const inconsistencies = await pool
      .request()
      .input("operationId", sql.UniqueIdentifier, args.operationId)
      .input("companyId", sql.UniqueIdentifier, args.companyId)
      .query(`
        WITH active_assignments AS (
          SELECT
            oa.employee_id,
            ow.id AS operation_workday_id,
            ow.work_date,
            COUNT(*) AS active_assignment_count
          FROM operation_assignments oa
          INNER JOIN operation_workdays ow
            ON ow.operation_id = oa.operation_id
           AND ow.company_id = oa.company_id
          WHERE oa.operation_id = @operationId
            AND oa.company_id = @companyId
            AND oa.cancelled_at IS NULL
            AND ow.work_date >= oa.valid_from
            AND (oa.valid_until IS NULL OR ow.work_date <= oa.valid_until)
          GROUP BY oa.employee_id, ow.id, ow.work_date
        )
        SELECT
          ew.id AS employee_workday_id,
          ow.work_date,
          e.name AS employee_name,
          ew.expectation_status,
          ew.cancellation_reason,
          ew.operation_assignment_id,
          COALESCE(aa.active_assignment_count, 0) AS active_assignment_count,
          CASE
            WHEN EXISTS (
              SELECT 1 FROM attendance_records ar
              WHERE ar.company_id = ew.company_id
                AND ar.employee_workday_id = ew.id
            ) THEN 'HAS_ATTENDANCE'
            WHEN COALESCE(aa.active_assignment_count, 0) = 0 THEN 'NO_ACTIVE_ASSIGNMENT'
            WHEN COALESCE(aa.active_assignment_count, 0) > 1 THEN 'MULTIPLE_ACTIVE_ASSIGNMENTS'
            WHEN ew.expectation_status = 'EXPECTED'
              AND ew.cancellation_reason IS NULL
              AND ew.operation_assignment_id IN (
                SELECT oa2.id
                FROM operation_assignments oa2
                WHERE oa2.company_id = ew.company_id
                  AND oa2.operation_id = ow.operation_id
                  AND oa2.employee_id = ew.employee_id
                  AND oa2.cancelled_at IS NULL
                  AND ow.work_date >= oa2.valid_from
                  AND (oa2.valid_until IS NULL OR ow.work_date <= oa2.valid_until)
              ) THEN 'ALREADY_CONSISTENT'
            WHEN COALESCE(aa.active_assignment_count, 0) = 1 THEN 'REPAIRABLE'
            ELSE 'UNCLASSIFIED'
          END AS repair_status
        FROM employee_workdays ew
        INNER JOIN operation_workdays ow ON ow.id = ew.operation_workday_id
        LEFT JOIN employees e ON e.id = ew.employee_id
        LEFT JOIN active_assignments aa
          ON aa.operation_workday_id = ew.operation_workday_id
         AND aa.employee_id = ew.employee_id
        WHERE ow.operation_id = @operationId
          AND ow.company_id = @companyId
        ORDER BY ow.work_date, e.name
      `);

    console.log("\n=== INCONSISTENCY CLASSIFICATION ===");
    console.log(JSON.stringify(inconsistencies.recordset, null, 2));
  } finally {
    await closeDatabase();
  }
}

main().catch(exitWithError);
