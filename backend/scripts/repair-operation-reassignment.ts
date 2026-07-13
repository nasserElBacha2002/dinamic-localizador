import { setupUnitTestEnv } from "../src/test-helpers/unit-test-env";

const OPERATION_ID = "328BD1B5-A954-4678-B0BA-39582EB38863";

async function main() {
  setupUnitTestEnv();
  const { connectDatabase, closeDatabase } = await import("../src/database/connection");
  const { operationRepository } = await import("../src/repositories/operation.repository");
  const { recurringWorkdayMaterializationService } = await import(
    "../src/services/recurring-workday-materialization.service"
  );
  const { operationAttendanceRepository } = await import(
    "../src/repositories/operation-attendance.repository"
  );

  await connectDatabase();

  const pool = (await import("../src/database/connection")).getPool();
  const operationResult = await pool
    .request()
    .input("operationId", (await import("mssql")).default.UniqueIdentifier, OPERATION_ID)
    .query(`SELECT company_id FROM scheduled_operations WHERE id = @operationId`);

  const companyId = String(operationResult.recordset[0]?.company_id ?? "");
  if (!companyId) {
    throw new Error("Operation not found");
  }

  const operation = await operationRepository.findById(companyId, OPERATION_ID);
  console.log("Operation:", operation?.operationKind, operation?.status);

  const result = await recurringWorkdayMaterializationService.materializeOperationHorizon(
    companyId,
    OPERATION_ID,
  );
  console.log("Materialization result:", result);

  const summary = await operationAttendanceRepository.getAttendanceSummary(
    companyId,
    OPERATION_ID,
    1,
    20,
    undefined,
    "2026-07-13",
  );
  console.log("Attendance summary for 2026-07-13:", {
    assigned: summary?.summary.assigned,
    employees: summary?.employees.map((row) => ({
      name: row.employee.name,
      assignmentId: row.assignmentId,
    })),
  });

  await closeDatabase();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
