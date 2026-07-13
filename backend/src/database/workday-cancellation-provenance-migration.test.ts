import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("workday cancellation provenance migration 045", () => {
  const migration = readFileSync(
    join(process.cwd(), "../database/migrations/045_workday_cancellation_provenance.sql"),
    "utf8",
  );

  it("adds employee_workdays.cancellation_reason with allowed values", () => {
    assert.match(migration, /employee_workdays[\s\S]*cancellation_reason NVARCHAR\(20\) NULL/);
    assert.match(migration, /CK_employee_workdays_cancellation_reason/);
    assert.match(migration, /N'ASSIGNMENT', N'SCHEDULE', N'OPERATION'/);
  });

  it("adds operation_workdays.cancellation_reason with allowed values", () => {
    assert.match(migration, /operation_workdays[\s\S]*cancellation_reason NVARCHAR\(20\) NULL/);
    assert.match(migration, /CK_operation_workdays_cancellation_reason/);
    assert.match(migration, /N'SCHEDULE', N'OPERATION'/);
  });

  it("allows legacy cancelled rows to keep null cancellation_reason", () => {
    assert.match(migration, /cancellation_reason IS NULL/);
  });
});
