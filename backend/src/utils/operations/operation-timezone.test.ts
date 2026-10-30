import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_OPERATION_TIMEZONE,
  resolveOperationTimezone,
} from "./operation-timezone";

describe("resolveOperationTimezone", () => {
  it("prefers company settings timezone", () => {
    assert.equal(
      resolveOperationTimezone("America/Argentina/Buenos_Aires", "UTC"),
      "America/Argentina/Buenos_Aires",
    );
  });

  it("falls back to company default timezone before application default", () => {
    assert.equal(resolveOperationTimezone(null, "America/Argentina/Buenos_Aires"), "America/Argentina/Buenos_Aires");
  });

  it("uses application default instead of UTC when settings are missing", () => {
    assert.equal(resolveOperationTimezone(null, null), DEFAULT_OPERATION_TIMEZONE);
    assert.notEqual(resolveOperationTimezone(null, null), "UTC");
  });
});
