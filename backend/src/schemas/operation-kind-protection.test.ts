import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("operation kind write protection", () => {
  it("creates operations as ONE_TIME in repository insert paths", () => {
    const source = readFileSync(
      join(process.cwd(), "src/repositories/operation.repository.ts"),
      "utf8",
    );

    assert.match(source, /N'ONE_TIME'/);
    assert.doesNotMatch(source, /operation_kind.*RECURRING/);
  });

  it("does not expose operationKind in public update schema", () => {
    const schema = readFileSync(join(process.cwd(), "src/schemas/operation.schema.ts"), "utf8");
    assert.doesNotMatch(schema, /operationKind/);
    assert.doesNotMatch(schema, /RECURRING/);
  });
});
