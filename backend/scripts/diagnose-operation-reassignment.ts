import sql from "mssql";
import { setupUnitTestEnv } from "../src/test-helpers/unit-test-env";
import { getPool } from "../src/database/connection";

const OPERATION_ID = "328BD1B5-A954-4678-B0BA-39582EB38863";

async function main() {
  setupUnitTestEnv();
  const { connectDatabase, closeDatabase } = await import("../src/database/connection");
  await connectDatabase();
  const pool = getPool();

  const operation = await pool.request().input("operationId", sql.UniqueIdentifier, OPERATION_ID).query(`
    SELECT o.*, s.name AS service_name
    FROM scheduled_operations o
    LEFT JOIN operational_locations s ON s.id = o.service_id AND s.company_id = o.company_id
    WHERE o.id = @operationId
  `);

  console.log("\n=== OPERATION ===");
  console.log(JSON.stringify(operation.recordset, null, 2));

  const companyId = operation.recordset[0]?.company_id;
  if (!companyId) {
    console.error("Operation not found");
    process.exit(1);
  }

  const assignments = await pool
    .request()
    .input("operationId", sql.UniqueIdentifier, OPERATION_ID)
    .query(`
      SELECT
        oa.id, oa.employee_id, e.name AS employee_name,
        oa.valid_from, oa.valid_until, oa.cancelled_at,
        oa.assignment_origin, oa.source_work_team_id, oa.source_assignment_batch_id,
        oa.created_at, oa.updated_at
      FROM operation_assignments oa
      LEFT JOIN employees e ON e.id = oa.employee_id AND e.company_id = oa.company_id
      WHERE oa.operation_id = @operationId
      ORDER BY e.name, oa.created_at
    `);

  console.log("\n=== ASSIGNMENTS ===");
  console.log(JSON.stringify(assignments.recordset, null, 2));

  const batches = await pool
    .request()
    .input("operationId", sql.UniqueIdentifier, OPERATION_ID)
    .query(`
      SELECT * FROM work_team_assignment_batches
      WHERE operation_id = @operationId ORDER BY created_at
    `);

  console.log("\n=== BATCHES ===");
  console.log(JSON.stringify(batches.recordset, null, 2));

  const batchItems = await pool.request().input("operationId", sql.UniqueIdentifier, OPERATION_ID).query(`
    SELECT bi.*, e.name AS employee_name
    FROM work_team_assignment_batch_items bi
    LEFT JOIN employees e ON e.id = bi.employee_id
    WHERE bi.batch_id IN (
      SELECT id FROM work_team_assignment_batches WHERE operation_id = @operationId
    )
    ORDER BY bi.created_at
  `);

  console.log("\n=== BATCH ITEMS ===");
  console.log(JSON.stringify(batchItems.recordset, null, 2));

  const workdays = await pool.request().input("operationId", sql.UniqueIdentifier, OPERATION_ID).query(`
    SELECT * FROM operation_workdays
    WHERE operation_id = @operationId ORDER BY work_date
  `);

  console.log("\n=== OPERATION WORKDAYS ===");
  console.log(JSON.stringify(workdays.recordset, null, 2));

  const employeeWorkdays = await pool.request().input("operationId", sql.UniqueIdentifier, OPERATION_ID).query(`
    SELECT
      ew.id, ew.operation_workday_id, ow.work_date,
      ew.employee_id, e.name AS employee_name,
      ew.operation_assignment_id, ew.expectation_status,
      ew.cancellation_reason, ew.created_at, ew.updated_at
    FROM employee_workdays ew
    INNER JOIN operation_workdays ow ON ow.id = ew.operation_workday_id
    LEFT JOIN employees e ON e.id = ew.employee_id
    WHERE ow.operation_id = @operationId
    ORDER BY ow.work_date, e.name
  `);

  console.log("\n=== EMPLOYEE WORKDAYS ===");
  console.log(JSON.stringify(employeeWorkdays.recordset, null, 2));

  const today = "2026-07-13";
  const todayWorkday = workdays.recordset.find(
    (row) => String((row as { work_date: Date }).work_date).slice(0, 10) === today,
  );

  if (todayWorkday) {
    const todaySummary = employeeWorkdays.recordset.filter(
      (row) => (row as { operation_workday_id: string }).operation_workday_id === todayWorkday.id,
    );
    console.log(`\n=== TODAY (${today}) EMPLOYEE WORKDAYS ===`);
    console.log(JSON.stringify(todaySummary, null, 2));
  }

  const attendance = await pool.request().input("operationId", sql.UniqueIdentifier, OPERATION_ID).query(`
    SELECT ar.*
    FROM attendance_records ar
    WHERE ar.employee_workday_id IN (
      SELECT ew.id FROM employee_workdays ew
      INNER JOIN operation_workdays ow ON ow.id = ew.operation_workday_id
      WHERE ow.operation_id = @operationId
    )
  `);

  console.log("\n=== ATTENDANCE ===");
  console.log(JSON.stringify(attendance.recordset, null, 2));

  await closeDatabase();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
