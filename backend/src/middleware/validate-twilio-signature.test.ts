import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createValidateTwilioSignature } from "./validate-twilio-signature";

const createMockResponse = () => {
  const response = {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.payload = body;
      return this;
    },
  };

  return response;
};

describe("validateTwilioSignature middleware", () => {
  it("calls next when signature validation is disabled", () => {
    let nextCalled = false;
    const middleware = createValidateTwilioSignature({
      validateSignature: false,
      nodeEnv: "development",
      validateRequestFn: () => false,
    });

    middleware(
      {
        get: () => undefined,
        body: { Body: "hola" },
      } as never,
      createMockResponse() as never,
      () => {
        nextCalled = true;
      },
    );

    assert.equal(nextCalled, true);
  });

  it("returns TWILIO_SIGNATURE_CONFIG_MISSING when signature header is missing", () => {
    const response = createMockResponse();
    const middleware = createValidateTwilioSignature({
      validateSignature: true,
      authToken: "token",
      webhookUrl: "https://api.example.com/api/webhooks/twilio/whatsapp",
      nodeEnv: "production",
      validateRequestFn: () => true,
    });

    middleware(
      {
        get: () => undefined,
        body: { Body: "hola" },
      } as never,
      response as never,
      () => {
        assert.fail("next should not be called");
      },
    );

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.payload, {
      error: {
        code: "TWILIO_SIGNATURE_CONFIG_MISSING",
        message: "No fue posible validar la solicitud de Twilio",
      },
    });
  });

  it("returns TWILIO_SIGNATURE_INVALID when signature validation fails", () => {
    const response = createMockResponse();
    const middleware = createValidateTwilioSignature({
      validateSignature: true,
      authToken: "token",
      webhookUrl: "https://api.example.com/api/webhooks/twilio/whatsapp",
      nodeEnv: "production",
      validateRequestFn: () => false,
    });

    middleware(
      {
        get: (header: string) => (header === "X-Twilio-Signature" ? "sig" : undefined),
        body: { Body: "hola" },
      } as never,
      response as never,
      () => {
        assert.fail("next should not be called");
      },
    );

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.payload, {
      error: {
        code: "TWILIO_SIGNATURE_INVALID",
        message: "Firma de Twilio inválida",
      },
    });
  });

  it("calls next and normalizes body when signature is valid", () => {
    let nextCalled = false;
    let capturedBody: unknown;
    const middleware = createValidateTwilioSignature({
      validateSignature: true,
      authToken: "token",
      webhookUrl: "https://api.example.com/api/webhooks/twilio/whatsapp",
      nodeEnv: "production",
      validateRequestFn: (_authToken, _signature, url, params) => {
        assert.equal(url, "https://api.example.com/api/webhooks/twilio/whatsapp");
        assert.deepEqual(params, { Body: "hola", NumMedia: "0" });
        return true;
      },
    });

    const request = {
      get: (header: string) => {
        if (header === "X-Twilio-Signature") {
          return "sig";
        }
        if (header === "content-type") {
          return "application/x-www-form-urlencoded";
        }
        return undefined;
      },
      body: { Body: "hola", NumMedia: 0 },
    };

    middleware(
      request as never,
      createMockResponse() as never,
      () => {
        nextCalled = true;
        capturedBody = request.body;
      },
    );

    assert.equal(nextCalled, true);
    assert.deepEqual(capturedBody, { Body: "hola", NumMedia: "0" });
  });
});
