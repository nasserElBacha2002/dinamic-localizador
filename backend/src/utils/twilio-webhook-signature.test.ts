import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeTwilioFormBody, TwilioFormBodyError } from "./twilio-form-body";
import { runTwilioSignatureValidation } from "./twilio-webhook-signature";

const WEBHOOK_URL = "https://api.example.com/api/webhooks/twilio/whatsapp";
const AUTH_TOKEN = "test-auth-token-value";

describe("normalizeTwilioFormBody", () => {
  it("converts scalar values to strings without trimming", () => {
    const normalized = normalizeTwilioFormBody({
      Body: " Llegué ",
      NumMedia: 0,
      Active: true,
    });

    assert.deepEqual(normalized, {
      Body: " Llegué ",
      NumMedia: "0",
      Active: "true",
    });
  });

  it("rejects arrays", () => {
    assert.throws(
      () => normalizeTwilioFormBody({ Items: ["one"] }),
      (error: unknown) => error instanceof TwilioFormBodyError,
    );
  });

  it("rejects nested objects", () => {
    assert.throws(
      () => normalizeTwilioFormBody({ Meta: { nested: true } }),
      (error: unknown) => error instanceof TwilioFormBodyError,
    );
  });

  it("accepts an empty object", () => {
    assert.deepEqual(normalizeTwilioFormBody({}), {});
  });
});

describe("runTwilioSignatureValidation", () => {
  it("skips validation when TWILIO_VALIDATE_SIGNATURE=false", () => {
    const result = runTwilioSignatureValidation(
      {
        validateSignature: false,
        nodeEnv: "development",
        validateRequestFn: () => false,
      },
      {
        body: { Body: "hola" },
      },
    );

    assert.equal(result.success, true);
    if (result.success) {
      assert.deepEqual(result.params, { Body: "hola" });
    }
  });

  it("returns config missing when signature header is absent", () => {
    const result = runTwilioSignatureValidation(
      {
        validateSignature: true,
        authToken: AUTH_TOKEN,
        webhookUrl: WEBHOOK_URL,
        nodeEnv: "production",
        validateRequestFn: () => true,
      },
      { body: { Body: "hola" } },
    );

    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.code, "TWILIO_SIGNATURE_CONFIG_MISSING");
    }
  });

  it("returns config missing when auth token is absent", () => {
    const result = runTwilioSignatureValidation(
      {
        validateSignature: true,
        webhookUrl: WEBHOOK_URL,
        nodeEnv: "production",
        validateRequestFn: () => true,
      },
      { signature: "sig", body: { Body: "hola" } },
    );

    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.code, "TWILIO_SIGNATURE_CONFIG_MISSING");
    }
  });

  it("returns config missing when webhook url is absent", () => {
    const result = runTwilioSignatureValidation(
      {
        validateSignature: true,
        authToken: AUTH_TOKEN,
        nodeEnv: "production",
        validateRequestFn: () => true,
      },
      { signature: "sig", body: { Body: "hola" } },
    );

    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.code, "TWILIO_SIGNATURE_CONFIG_MISSING");
    }
  });

  it("calls validateRequest with the configured webhook url", () => {
    let receivedUrl = "";
    const result = runTwilioSignatureValidation(
      {
        validateSignature: true,
        authToken: AUTH_TOKEN,
        webhookUrl: WEBHOOK_URL,
        nodeEnv: "production",
        validateRequestFn: (_authToken, _signature, url) => {
          receivedUrl = url;
          return true;
        },
      },
      {
        signature: "sig",
        body: { Body: "hola" },
      },
    );

    assert.equal(result.success, true);
    assert.equal(receivedUrl, WEBHOOK_URL);
  });

  it("returns invalid signature when validateRequest returns false", () => {
    const result = runTwilioSignatureValidation(
      {
        validateSignature: true,
        authToken: AUTH_TOKEN,
        webhookUrl: WEBHOOK_URL,
        nodeEnv: "production",
        validateRequestFn: () => false,
      },
      {
        signature: "sig",
        body: { Body: "hola" },
      },
    );

    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.code, "TWILIO_SIGNATURE_INVALID");
    }
  });

  it("rejects nested body values before validating signature", () => {
    const result = runTwilioSignatureValidation(
      {
        validateSignature: true,
        authToken: AUTH_TOKEN,
        webhookUrl: WEBHOOK_URL,
        nodeEnv: "production",
        validateRequestFn: () => true,
      },
      {
        signature: "sig",
        body: { Meta: { nested: true } },
      },
    );

    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.code, "TWILIO_SIGNATURE_INVALID");
    }
  });
});
