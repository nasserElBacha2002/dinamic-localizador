import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitBatches, stripLegacyDatabaseUse } from "./run-migrations";

describe("run-migrations helpers", () => {
  it("splitBatches splits on GO delimiters case-insensitively", () => {
    const batches = splitBatches("SELECT 1;\ngo\nSELECT 2;\nGO\nSELECT 3;");
    assert.deepEqual(
      batches.map((b) => b.replace(/\s+/g, " ").trim()),
      ["SELECT 1;", "SELECT 2;", "SELECT 3;"],
    );
  });

  it("stripLegacyDatabaseUse removes USE lines only", () => {
    const cleaned = stripLegacyDatabaseUse("USE dinamic_attendance;\nSELECT 1;");
    assert.equal(cleaned, "SELECT 1;");
  });
});
