import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SYSTEM_LOGS_INFO_EVENT_ALLOWLIST,
  SYSTEM_LOG_EVENTS,
} from "./system-logs";

describe("system-logs INFO allowlist catalog", () => {
  it("every default allowlist event exists in SYSTEM_LOG_EVENTS", () => {
    const catalog = new Set<string>(SYSTEM_LOG_EVENTS);
    for (const event of DEFAULT_SYSTEM_LOGS_INFO_EVENT_ALLOWLIST) {
      assert.ok(catalog.has(event), `missing catalog entry for ${event}`);
    }
  });
});
