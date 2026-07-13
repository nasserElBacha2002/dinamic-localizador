import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("operation kind write protection", () => {
  it("rejects operationKind changes in update schema", () => {
    const schema = readFileSync(join(process.cwd(), "src/schemas/operation.schema.ts"), "utf8");
    assert.match(schema, /operationKind: z\.never\(\)\.optional\(\)/);
    assert.match(schema, /El tipo de operación no puede modificarse después de crearla/);
  });

  it("supports discriminated create schemas for ONE_TIME and RECURRING", () => {
    const schema = readFileSync(join(process.cwd(), "src/schemas/operation.schema.ts"), "utf8");
    assert.match(schema, /createOneTimeOperationSchema/);
    assert.match(schema, /createRecurringOperationSchema/);
    assert.match(schema, /discriminatedUnion\("operationKind"/);
  });
});
