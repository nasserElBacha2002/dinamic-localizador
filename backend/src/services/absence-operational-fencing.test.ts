import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOperationalConflictIdempotencyKey,
} from "../types/absence-operational-impact";

describe("job fencing helpers", () => {
  it("uses assignment id (not operation id) in conflict keys", () => {
    const key = buildOperationalConflictIdempotencyKey({
      requestId: "req",
      version: 3,
      conflictType: "ASSIGNMENT_DURING_ABSENCE",
      targetEntityId: "assignment-uuid",
    });
    assert.match(key, /assignment-uuid/);
    assert.equal(key.includes("operation"), false);
  });
});
