import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("statistics.repository recurring compatibility", () => {
  const repositorySource = readFileSync(
    join(process.cwd(), "src/repositories/statistics.repository.ts"),
    "utf8",
  );

  it("keeps public statistics scoped to ONE_TIME operations until Phase 7", () => {
    assert.match(repositorySource, /i\.operation_kind = N'ONE_TIME'/);
  });
});
