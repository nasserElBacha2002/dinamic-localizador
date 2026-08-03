import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";

describe("twilio routes signature separation", () => {
  it("creates distinct validators for inbound and status URLs", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/routes/twilio.routes.ts"),
      "utf8",
    );
    assert.match(source, /validateInboundSignature/);
    assert.match(source, /validateStatusSignature/);
    assert.match(source, /TWILIO_STATUS_CALLBACK_URL/);
    assert.match(source, /TWILIO_WEBHOOK_URL/);
    assert.doesNotMatch(
      source,
      /twilioRouter\.post\(\s*"\/whatsapp\/status",\s*validateInboundSignature/,
    );
  });
});
