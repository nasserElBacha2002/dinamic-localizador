import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("monthly attendance report repository", () => {
  const source = readFileSync(join(process.cwd(), "src/repositories/monthly-attendance-report.repository.ts"), "utf8");
  it("uses the tenant-scoped Statistics employee_workday projection in one query", () => {
    assert.match(source, /buildEmployeeWorkdayStatisticsCte/);
    assert.match(source, /buildEmployeeWorkdayStatisticsFilters\(input\.companyId/);
    assert.match(source, /employee_workday_statistics/);
    assert.match(source, /ORDER BY work_date ASC/);
    assert.doesNotMatch(source, /fetch\(|statistics\/attendance/);
  });

  it("preserves one-row-per-employee-workday cardinality for confirmation status", () => {
    const projection = readFileSync(join(process.cwd(), "src/utils/employee-workday-statistics-projection.ts"), "utf8");
    const migration = readFileSync(join(process.cwd(), "../database/migrations/040_temporal_operation_assignments.sql"), "utf8");
    assert.match(projection, /LEFT JOIN operation_assignments oa[\s\S]*?oa\.id = ew\.operation_assignment_id[\s\S]*?oa\.company_id = ew\.company_id/);
    assert.match(migration, /CONSTRAINT PK_operation_assignments PRIMARY KEY \(id\)/);
    assert.match(migration, /FOREIGN KEY \(operation_assignment_id\)\s+REFERENCES dbo\.operation_assignments \(id\)/);
  });
});
