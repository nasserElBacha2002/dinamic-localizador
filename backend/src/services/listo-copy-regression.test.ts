import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression: payroll receipt query must not send a post-delivery confirmation
 * text bubble. Document captions on the PDF itself may still describe the file —
 * that is the media body, not a separate TwiML reply.
 */
describe("post-delivery confirmation removed from payroll receipt query", () => {
  it("period-query service has no success confirmation copy helpers", () => {
    const source = readFileSync(
      join(__dirname, "payroll-receipt-period-query.service.ts"),
      "utf8",
    );
    assert.doesNotMatch(source, /\bListo\b/);
    assert.doesNotMatch(source, /ya se enviaron tus recibos/i);
    assert.doesNotMatch(source, /Te enviamos \$\{deliveredCount\} recibos/);
    assert.doesNotMatch(source, /multiIntroMessage|completedMessage|sendIntroIfNeeded/);
    assert.match(source, /message:\s*""/);
  });

  it("handler returns empty message on completed delivery path", () => {
    const source = readFileSync(
      join(__dirname, "whatsapp-router/payroll-receipt.handler.ts"),
      "utf8",
    );
    assert.doesNotMatch(source, /\bListo\b/);
    assert.match(source, /message:\s*""/);
    assert.match(source, /PAYROLL_RECEIPT_SEND_ACCEPTED/);
  });
});
