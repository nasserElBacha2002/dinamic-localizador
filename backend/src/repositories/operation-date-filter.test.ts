import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("operation list recurring date filter SQL", () => {
  const repositorySource = readFileSync(
    join(process.cwd(), "src/repositories/operation.repository.ts"),
    "utf8",
  );

  it("joins operation_schedules when date filters are used", () => {
    assert.match(repositorySource, /needsScheduleJoin/);
    assert.match(repositorySource, /LEFT JOIN operation_schedules os/);
  });

  it("uses recurring validity overlap for RECURRING operations", () => {
    assert.match(repositorySource, /os\.valid_from <= @dateToLocal/);
    assert.match(repositorySource, /os\.valid_until IS NULL OR os\.valid_until >= @dateFromLocal/);
    assert.match(repositorySource, /operation_kind = N'RECURRING'/);
  });

  it("keeps ONE_TIME scheduled_start filtering", () => {
    assert.match(repositorySource, /operation_kind = N'ONE_TIME' AND i\.scheduled_start >= @dateFromTs/);
    assert.match(repositorySource, /operation_kind = N'ONE_TIME' AND i\.scheduled_start <= @dateToTs/);
  });

  it("supports dateFrom-only recurring validity", () => {
    assert.match(
      repositorySource,
      /operation_kind = N'RECURRING'[\s\S]*os\.valid_until IS NULL OR os\.valid_until >= @dateFromLocal/,
    );
  });

  it("supports dateTo-only recurring validity", () => {
    assert.match(
      repositorySource,
      /operation_kind = N'RECURRING' AND os\.valid_from <= @dateToLocal/,
    );
  });
});
