import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const repositorySource = readFileSync(
  join(process.cwd(), "src/repositories/employee-assignment-query.repository.ts"),
  "utf8",
);

describe("employeeAssignmentQueryRepository.listTodayForEmployee", () => {
  it("uses a half-open UTC range for scheduled_start", () => {
    assert.match(repositorySource, /getOperationDayUtcBounds\(at, operationTimezone\)/);
    assert.match(repositorySource, /\.input\("dayStartUtc", sql\.DateTime2, dayStartUtc\)/);
    assert.match(repositorySource, /\.input\("nextDayStartUtc", sql\.DateTime2, nextDayStartUtc\)/);
    assert.match(repositorySource, /i\.scheduled_start >= @dayStartUtc/);
    assert.match(repositorySource, /i\.scheduled_start < @nextDayStartUtc/);
    assert.doesNotMatch(repositorySource, /dayEndUtc/);
    assert.doesNotMatch(repositorySource, /<= @dayEndUtc/);
  });

  it("keeps bot assignment availability scoped to ONE_TIME operations", () => {
    assert.match(repositorySource, /i\.operation_kind = N'ONE_TIME'/);
  });
});
