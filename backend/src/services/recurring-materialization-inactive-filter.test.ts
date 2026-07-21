import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

describe("recurring materialization inactive employee protection", () => {
  it("filters inactive employees in overlapping assignment SQL", () => {
    const repoPath = join(
      process.cwd(),
      "src/repositories/operation-employee.repository.ts",
    );
    const source = readFileSync(repoPath, "utf8");
    assert.match(source, /listOverlappingForOperationInDateRange/);
    assert.match(source, /e\.active = 1/);
  });
});
