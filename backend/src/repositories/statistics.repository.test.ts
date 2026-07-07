import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("statistics.repository EmployeeWorkday grain", () => {
  const repositorySource = readFileSync(
    join(process.cwd(), "src/repositories/statistics.repository.ts"),
    "utf8",
  );

  it("uses EmployeeWorkday statistics for ONE_TIME and RECURRING operations", () => {
    assert.match(repositorySource, /employee_workday_statistics/);
    assert.match(repositorySource, /buildEmployeeWorkdayStatisticsCte/);
    assert.doesNotMatch(repositorySource, /operation_kind = N'ONE_TIME'/);
  });

  it("buckets trends by operation workday date", () => {
    assert.match(repositorySource, /GROUP BY work_date/);
    assert.doesNotMatch(repositorySource, /COALESCE\(ar\.received_at, i\.scheduled_start\)/);
  });

  it("exposes workday detail export rows", () => {
    assert.match(repositorySource, /getWorkdayDetails/);
    assert.match(repositorySource, /effective_state/);
  });
});
