import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MARKETING_DEMO_DELIVERY_FAILED_CODE,
  MARKETING_DEMO_DELIVERY_UNCERTAIN_CODE,
  classifyMarketingSmtpResult,
  isDefinitiveMarketingDeliveryError,
} from "./demo-lead-smtp-outcome";

describe("classifyMarketingSmtpResult", () => {
  it("treats SMTP acceptance as accepted", () => {
    const outcome = classifyMarketingSmtpResult({
      sent: true,
      messageId: "m1",
      transport: "smtp",
      publicErrorCode: null,
    });
    assert.equal(outcome.kind, "accepted");
  });

  it("treats console / not-sent as definitive rejection", () => {
    const outcome = classifyMarketingSmtpResult({
      sent: false,
      messageId: null,
      transport: "console",
      publicErrorCode: "EMAIL_CONSOLE_NOT_DELIVERED",
    });
    assert.equal(outcome.kind, "rejected");
  });

  it("treats sent=true with non-smtp transport as rejection", () => {
    const outcome = classifyMarketingSmtpResult({
      sent: true,
      messageId: "x",
      transport: "console",
      publicErrorCode: null,
    });
    assert.equal(outcome.kind, "rejected");
  });
});

describe("delivery error classification", () => {
  it("releases dedup only for definitive delivery failure", () => {
    assert.equal(isDefinitiveMarketingDeliveryError(MARKETING_DEMO_DELIVERY_FAILED_CODE), true);
    assert.equal(isDefinitiveMarketingDeliveryError(MARKETING_DEMO_DELIVERY_UNCERTAIN_CODE), false);
  });
});