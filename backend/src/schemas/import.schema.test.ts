import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IMPORT_ENTITY_TYPES } from "../imports/constants";
import { importEntityTypeParamSchema } from "./import.schema";

describe("importEntityTypeParamSchema", () => {
  it("accepts all IMPORT_ENTITY_TYPES including clients", () => {
    for (const entityType of IMPORT_ENTITY_TYPES) {
      const parsed = importEntityTypeParamSchema.safeParse({ entityType });
      assert.equal(parsed.success, true, `expected ${entityType} to be accepted`);
    }
  });

  it("rejects unknown entity types", () => {
    const parsed = importEntityTypeParamSchema.safeParse({ entityType: "unknown" });
    assert.equal(parsed.success, false);
  });
});
