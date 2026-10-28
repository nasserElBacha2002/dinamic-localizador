import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

describe("workTeamAssignmentBatchRepository.markFailed", () => {
  it("only transitions PREVIEWED batches for the scoped company", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "work-team-assignment-batch.repository.ts"),
      "utf8",
    );

    assert.match(source, /async markFailed\(companyId: string, batchId: string\)/);
    assert.match(
      source,
      /UPDATE work_team_assignment_batches[\s\S]*SET status = N'FAILED'[\s\S]*AND company_id = @companyId[\s\S]*AND status = N'PREVIEWED'/,
    );
  });
});
