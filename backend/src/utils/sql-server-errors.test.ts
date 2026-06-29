import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDuplicateKeyError } from "./sql-server-errors";

describe("isDuplicateKeyError", () => {
  it("detects SQL Server duplicate key error 2601", () => {
    assert.equal(isDuplicateKeyError({ number: 2601 }), true);
  });

  it("detects SQL Server duplicate key error 2627", () => {
    assert.equal(isDuplicateKeyError({ number: 2627 }), true);
  });

  it("detects nested originalError duplicate key codes", () => {
    assert.equal(isDuplicateKeyError({ originalError: { number: 2627 } }), true);
  });

  it("does not match unrelated errors", () => {
    assert.equal(isDuplicateKeyError(new Error("UQ_whatsapp_attendance_notifications")), false);
    assert.equal(isDuplicateKeyError({ number: 547 }), false);
    assert.equal(isDuplicateKeyError(null), false);
  });
});
