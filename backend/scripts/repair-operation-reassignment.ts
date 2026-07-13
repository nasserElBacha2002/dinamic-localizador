import sql from "mssql";
import { connectDatabase, closeDatabase, getPool } from "../src/database/connection";
import { operationAttendanceRepository } from "../src/repositories/operation-attendance.repository";
import { recurringWorkdayMaterializationService } from "../src/services/recurring-workday-materialization.service";
import {
  exitWithError,
  parseOperationReassignmentCliArgs,
  printOperationalEnvironment,
} from "./operation-reassignment-cli";

async function main(): Promise<void> {
  const args = parseOperationReassignmentCliArgs(process.argv.slice(2));
  printOperationalEnvironment();
  console.log("Modo:", args.apply ? "APPLY" : "PREVIEW");

  await connectDatabase();
  const pool = getPool();

  try {
    const preview = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, args.companyId)
      .input("operationId", sql.UniqueIdentifier, args.operationId)
      .query(`
        WITH active_assignments AS (
          SELECT
            oa.id AS active_assignment_id,
            oa.employee_id,
            ow.id AS operation_workday_id,
            ow.work_date,
            ROW_NUMBER() OVER (
              PARTITION BY oa.employee_id, ow.id
              ORDER BY oa.created_at DESC
            ) AS assignment_rank,
            COUNT(*) OVER (
              PARTITION BY oa.employee_id, ow.id
            ) AS active_assignment_count
          FROM operation_assignments oa
          INNER JOIN operation_workdays ow
            ON ow.operation_id = oa.operation_id
           AND ow.company_id = oa.company_id
          WHERE oa.operation_id = @operationId
            AND oa.company_id = @companyId
            AND oa.cancelled_at IS NULL
            AND ow.work_date >= oa.valid_from
            AND (oa.valid_until IS NULL OR ow.work_date <= oa.valid_until)
        )
        SELECT
          ew.id AS employee_workday_id,
          ow.work_date,
          e.name AS employee_name,
          ew.expectation_status,
          ew.cancellation_reason,
          ew.operation_assignment_id,
          aa.active_assignment_id,
          aa.active_assignment_count,
          CASE
            WHEN EXISTS (
              SELECT 1 FROM attendance_records ar
              WHERE ar.company_id = ew.company_id
                AND ar.employee_workday_id = ew.id
            ) THEN 'HAS_ATTENDANCE'
            WHEN aa.active_assignment_count IS NULL OR aa.active_assignment_count = 0 THEN 'NO_ACTIVE_ASSIGNMENT'
            WHEN aa.active_assignment_count > 1 THEN 'MULTIPLE_ACTIVE_ASSIGNMENTS'
            WHEN ew.expectation_status = 'EXPECTED'
              AND ew.cancellation_reason IS NULL
              AND ew.operation_assignment_id = aa.active_assignment_id THEN 'ALREADY_CONSISTENT'
            WHEN aa.active_assignment_count = 1 THEN 'REPAIRABLE'
            ELSE 'UNCLASSIFIED'
          END AS repair_status
        FROM employee_workdays ew
        INNER JOIN operation_workdays ow ON ow.id = ew.operation_workday_id
        LEFT JOIN employees e ON e.id = ew.employee_id
        LEFT JOIN active_assignments aa
          ON aa.operation_workday_id = ew.operation_workday_id
         AND aa.employee_id = ew.employee_id
         AND aa.assignment_rank = 1
        WHERE ow.operation_id = @operationId
          AND ow.company_id = @companyId
        ORDER BY ow.work_date, e.name
      `);

    const rows = preview.recordset as Array<Record<string, unknown>>;
    const repairable = rows.filter((row) => row.repair_status === "REPAIRABLE");

    console.log("\n=== REPAIR PREVIEW ===");
    console.log(
      JSON.stringify(
        {
          totalRows: rows.length,
          repairable: repairable.length,
          omittedHasAttendance: rows.filter((row) => row.repair_status === "HAS_ATTENDANCE").length,
          omittedMultipleActive: rows.filter(
            (row) => row.repair_status === "MULTIPLE_ACTIVE_ASSIGNMENTS",
          ).length,
          alreadyConsistent: rows.filter((row) => row.repair_status === "ALREADY_CONSISTENT").length,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify(repairable, null, 2));

    if (!args.apply) {
      console.log("\nPreview only. Re-ejecutá con --apply para reparar.");
      return;
    }

    if (repairable.length > 0) {
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        let repaired = 0;
        for (const row of repairable) {
          const result = await new sql.Request(transaction)
            .input("companyId", sql.UniqueIdentifier, args.companyId)
            .input("employeeWorkdayId", sql.UniqueIdentifier, row.employee_workday_id)
            .input("assignmentId", sql.UniqueIdentifier, row.active_assignment_id)
            .query(`
              UPDATE employee_workdays
              SET expectation_status = 'EXPECTED',
                  cancellation_reason = NULL,
                  operation_assignment_id = @assignmentId,
                  updated_at = SYSUTCDATETIME()
              WHERE company_id = @companyId
                AND id = @employeeWorkdayId
                AND expectation_status = 'CANCELLED'
                AND NOT EXISTS (
                  SELECT 1 FROM attendance_records ar
                  WHERE ar.company_id = @companyId
                    AND ar.employee_workday_id = @employeeWorkdayId
                )
            `);
          repaired += result.rowsAffected[0] ?? 0;
        }
        await transaction.commit();
        console.log(`\nReparadas: ${repaired}`);
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } else {
      console.log("\nNo hay filas reparables.");
    }

    const materialized = await recurringWorkdayMaterializationService.materializeOperationHorizon(
      args.companyId,
      args.operationId,
    );
    console.log("\nMaterialización:", materialized);

    if (args.workDate) {
      const summary = await operationAttendanceRepository.getAttendanceSummary(
        args.companyId,
        args.operationId,
        1,
        50,
        undefined,
        args.workDate,
      );
      console.log("\nResumen operativo:", {
        workDate: summary?.workDate,
        assigned: summary?.summary.assigned,
        employees: summary?.employees.map((row) => row.employee.name),
      });
    }
  } finally {
    await closeDatabase();
  }
}

main().catch(exitWithError);
