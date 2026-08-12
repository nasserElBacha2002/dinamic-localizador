import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveSqlSort } from "./sql-sort";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("sql-sort whitelist", () => {
  it("maps only known sort keys to SQL identifiers", () => {
    const whitelist = { name: "e.name", createdAt: "e.created_at" };
    assert.equal(resolveSqlSort("name", whitelist, "e.id", "asc"), "e.name ASC");
    assert.equal(resolveSqlSort("createdAt", whitelist, "e.id", "desc"), "e.created_at DESC");
  });

  it("falls back for unknown user-controlled sort keys", () => {
    const whitelist = { name: "e.name" };
    assert.equal(
      resolveSqlSort("e.name; DROP TABLE employees--", whitelist, "e.id", "asc"),
      "e.id ASC",
    );
  });
});

describe("sql injection regression — parameterized hotspots", () => {
  it("absence-attachment markStatus / listForCleanup use bind parameters", () => {
    const src = readFileSync(
      path.join(here, "../repositories/absence-attachment.repository.ts"),
      "utf8",
    );
    assert.doesNotMatch(src, /status = N'\$\{current\.status\}'/);
    assert.match(src, /status = @expectedStatus/);
    assert.match(src, /attempt_count = attempt_count \+ @incrementAttempt/);
    assert.doesNotMatch(src, /statuses\.map\(\(s\) => `N'\$\{s\}'`\)/);
    assert.match(src, /status IN \(\$\{statusParams\.join/);
  });

  it("statistics ranking HAVING binds @referenceAt and @minSample", () => {
    const src = readFileSync(path.join(here, "../repositories/statistics.repository.ts"), "utf8");
    assert.doesNotMatch(src, /MIN\(operation_scheduled_start\) <= '\$\{/);
    assert.match(src, /MIN\(operation_scheduled_start\) <= @referenceAt/);
    assert.match(src, />= @minSample/);
    assert.match(src, /\.input\("minSample", sql\.Int, minSample\)/);
  });

  it("service-fix schema lookup parameterizes TABLE_NAME", () => {
    const src = readFileSync(path.join(here, "service-fix/db-services.ts"), "utf8");
    assert.doesNotMatch(src, /WHERE TABLE_NAME = '\$\{TABLE_NAME\}'/);
    assert.match(src, /WHERE TABLE_NAME = @tableName/);
  });
});
