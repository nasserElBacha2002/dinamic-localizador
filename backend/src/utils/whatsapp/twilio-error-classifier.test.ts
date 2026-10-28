import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyTwilioOutboundError,
  isAmbiguousTwilioSendFailure,
} from "./twilio-error-classifier";

describe("classifyTwilioOutboundError", () => {
  it("classifies HTTP statuses", () => {
    assert.deepEqual(classifyTwilioOutboundError({ status: 400, message: "bad" }), {
      retryable: false,
      normalizedCode: "HTTP_400",
    });
    assert.deepEqual(classifyTwilioOutboundError({ status: 401 }), {
      retryable: false,
      normalizedCode: "HTTP_401",
    });
    assert.deepEqual(classifyTwilioOutboundError({ status: 403 }), {
      retryable: false,
      normalizedCode: "HTTP_403",
    });
    assert.deepEqual(classifyTwilioOutboundError({ status: 404 }), {
      retryable: false,
      normalizedCode: "HTTP_404",
    });
    assert.equal(classifyTwilioOutboundError({ status: 429, retryAfter: 2 }).retryable, true);
    assert.equal(classifyTwilioOutboundError({ status: 429 }).normalizedCode, "HTTP_429");
    assert.equal(classifyTwilioOutboundError({ status: 429, retryAfter: 2 }).retryAfterMs, 2000);
    for (const status of [500, 502, 503, 504]) {
      assert.equal(classifyTwilioOutboundError({ status }).retryable, true);
      assert.equal(classifyTwilioOutboundError({ status }).normalizedCode, `HTTP_${status}`);
    }
  });

  it("classifies Twilio application codes as permanent", () => {
    assert.deepEqual(classifyTwilioOutboundError({ code: 21211 }), {
      retryable: false,
      normalizedCode: "TWILIO_21211",
    });
    assert.deepEqual(classifyTwilioOutboundError({ code: 21610 }), {
      retryable: false,
      normalizedCode: "TWILIO_21610",
    });
  });

  it("classifies network errors as retryable", () => {
    assert.equal(classifyTwilioOutboundError({ code: "ECONNRESET" }).normalizedCode, "ECONNRESET");
    assert.equal(classifyTwilioOutboundError({ code: "ETIMEDOUT" }).retryable, true);
    assert.equal(classifyTwilioOutboundError(new Error("connect ETIMEDOUT")).normalizedCode, "ETIMEDOUT");
  });

  it("does not treat INVALID substring as permanent", () => {
    const result = classifyTwilioOutboundError({ message: "INVALID something weird" });
    assert.equal(result.retryable, true);
    assert.equal(result.normalizedCode, "UNKNOWN");
  });

  it("marks timeout/reset/unknown as ambiguous for send", () => {
    assert.equal(
      isAmbiguousTwilioSendFailure(classifyTwilioOutboundError({ code: "ETIMEDOUT" })),
      true,
    );
    assert.equal(
      isAmbiguousTwilioSendFailure(classifyTwilioOutboundError({ status: 429 })),
      false,
    );
  });
});
