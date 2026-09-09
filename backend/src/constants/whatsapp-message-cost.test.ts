import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MESSAGE_COST_BILLING_SCOPE } from "../constants/whatsapp-message-cost";

describe("whatsapp message cost billing scope", () => {
  it("documents that Meta template fees are excluded from Message.price", () => {
    assert.match(MESSAGE_COST_BILLING_SCOPE, /EXCLUDES_META/);
  });
});
