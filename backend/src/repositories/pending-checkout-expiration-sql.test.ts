import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("pending checkout expiration SQL alignment", () => {
  it("list and revalidate queries share the same DATEADD expiration predicate", () => {
    const source = readFileSync(
      join(process.cwd(), "src/repositories/employee-workday-availability.repository.ts"),
      "utf8",
    );

    const predicate =
      /@now <= DATEADD\(\s*HOUR,\s*@pendingOperationExpirationHours,\s*COALESCE\(ow\.expected_end_at, ow\.expected_start_at\)\s*\)/g;
    const matches = source.match(predicate);
    assert.equal(matches?.length, 2);
  });

  it("legacy findCheckoutEligibleOperations also applies pending expiration", () => {
    const source = readFileSync(
      join(process.cwd(), "src/repositories/attendance.repository.ts"),
      "utf8",
    );
    assert.match(source, /pendingOperationExpirationHours/);
    assert.match(source, /DATEADD\(\s*HOUR,\s*@pendingOperationExpirationHours/);
  });
});
