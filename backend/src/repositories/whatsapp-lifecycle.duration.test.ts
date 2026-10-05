import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FLOW_DURATION_MS_INT_SQL } from "../repositories/whatsapp-lifecycle.repository";

describe("whatsapp lifecycle duration_ms clamp", () => {
  it("uses DATEDIFF_BIG and clamps into INT range", () => {
    assert.match(FLOW_DURATION_MS_INT_SQL, /DATEDIFF_BIG\s*\(\s*MILLISECOND/i);
    assert.match(FLOW_DURATION_MS_INT_SQL, /2147483647/);
    assert.match(FLOW_DURATION_MS_INT_SQL, /AS INT/i);
    assert.doesNotMatch(FLOW_DURATION_MS_INT_SQL, /DATEDIFF\s*\(\s*MILLISECOND/i);
  });
});
