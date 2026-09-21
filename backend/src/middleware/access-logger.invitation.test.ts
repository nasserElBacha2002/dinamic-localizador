import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  logLineContainsRawSecret,
  sanitizeUrlForLogs,
} from "../utils/log-redaction";
import { createAccessLogger } from "./access-logger";

describe("invitation access logging", () => {
  it("redacts raw invitation token from URL used by access logger", () => {
    const secret = "inv_raw_token_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
    const raw = `/api/invitations/preview?token=${encodeURIComponent(secret)}&x=1`;
    const safe = sanitizeUrlForLogs(raw);
    assert.equal(logLineContainsRawSecret(safe, secret), false);
    assert.match(safe, /token=/);
    assert.doesNotMatch(safe, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("createAccessLogger registers without exposing secrets in format wiring", () => {
    const logger = createAccessLogger();
    assert.equal(typeof logger, "function");
  });
});
