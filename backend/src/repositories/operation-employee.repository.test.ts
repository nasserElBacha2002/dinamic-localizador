import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("operationEmployeeRepository.createInTransaction", () => {
  const repositorySource = readFileSync(
    join(process.cwd(), "src/repositories/operation-employee.repository.ts"),
    "utf8",
  );

  it("generates assignment id on insert and persists operation_shift_id when provided", () => {
    assert.match(repositorySource, /randomUUID\(\)/);
    assert.match(repositorySource, /INSERT INTO operation_assignments \([\s\S]*\bid,/);
    assert.match(repositorySource, /@assignmentId/);
    assert.match(repositorySource, /operation_shift_id/);
    assert.match(repositorySource, /@operationShiftId/);
  });
});
