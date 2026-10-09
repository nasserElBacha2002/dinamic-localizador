import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { shouldExcludeCancelledOperationsFromList } from "./operation-list-filters";

describe("shouldExcludeCancelledOperationsFromList", () => {
  it("excludes cancelled operations when status is omitted (Estado Todos)", () => {
    assert.equal(shouldExcludeCancelledOperationsFromList({}), true);
  });

  it("does not exclude when filtering by CANCELLED status", () => {
    assert.equal(shouldExcludeCancelledOperationsFromList({ status: "CANCELLED" }), false);
  });

  it("does not exclude when filtering by another status", () => {
    assert.equal(shouldExcludeCancelledOperationsFromList({ status: "SCHEDULED" }), false);
    assert.equal(shouldExcludeCancelledOperationsFromList({ status: "IN_PROGRESS" }), false);
    assert.equal(shouldExcludeCancelledOperationsFromList({ status: "COMPLETED" }), false);
  });
});

describe("operation list cancelled filter SQL", () => {
  const repositorySource = readFileSync(
    join(process.cwd(), "src/repositories/operation.repository.ts"),
    "utf8",
  );

  it("applies cancelled exclusion in the list query", () => {
    assert.match(repositorySource, /shouldExcludeCancelledOperationsFromList/);
    assert.match(repositorySource, /i\.status <> N'CANCELLED'/);
  });
});
