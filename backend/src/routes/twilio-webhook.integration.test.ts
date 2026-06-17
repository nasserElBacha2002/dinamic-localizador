import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { describe, it, afterEach } from "node:test";
import express from "express";
import twilio from "twilio";
import { createValidateTwilioSignature } from "../middleware/validate-twilio-signature";

const WEBHOOK_URL = "https://api.example.com/api/webhooks/twilio/whatsapp";
const AUTH_TOKEN = "diagnostic-auth-token-32chars-min";

const sampleTwilioParams = {
  AccountSid: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  ApiVersion: "2010-04-01",
  Body: "Llegué",
  From: "whatsapp:+5491112345678",
  MessageSid: "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  NumMedia: "0",
  NumSegments: "1",
  SmsMessageSid: "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  SmsSid: "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  SmsStatus: "received",
  To: "whatsapp:+14155238886",
  WaId: "5491112345678",
};

const buildSignature = (params: Record<string, string>): string =>
  twilio.getExpectedTwilioSignature(AUTH_TOKEN, WEBHOOK_URL, params);

const startWebhookServer = async (
  validateRequestFn: (
    authToken: string,
    signature: string,
    url: string,
    params: Record<string, string>,
  ) => boolean = twilio.validateRequest,
): Promise<{ server: Server; baseUrl: string }> => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.post(
    "/api/webhooks/twilio/whatsapp",
    createValidateTwilioSignature({
      validateSignature: true,
      authToken: AUTH_TOKEN,
      webhookUrl: WEBHOOK_URL,
      nodeEnv: "test",
      validateRequestFn,
    }),
    (req, res) => {
      res.status(200).type("text/xml").send(`<Response><Keys>${Object.keys(req.body).length}</Keys></Response>`);
    },
  );

  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to resolve test server port");
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
};

describe("twilio webhook integration", () => {
  let server: Server | null = null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      server = null;
    }
  });

  it("parses application/x-www-form-urlencoded and accepts a valid signature", async () => {
    const started = await startWebhookServer();
    server = started.server;

    const body = new URLSearchParams(sampleTwilioParams).toString();
    const signature = buildSignature(sampleTwilioParams);

    const response = await fetch(`${started.baseUrl}/api/webhooks/twilio/whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": signature,
      },
      body,
    });

    assert.equal(response.status, 200);
    assert.match(await response.text(), /<Keys>12<\/Keys>/);
  });

  it("returns 403 TWILIO_SIGNATURE_INVALID for an invalid signature", async () => {
    const started = await startWebhookServer();
    server = started.server;

    const body = new URLSearchParams(sampleTwilioParams).toString();
    const response = await fetch(`${started.baseUrl}/api/webhooks/twilio/whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": "invalid-signature",
      },
      body,
    });

    assert.equal(response.status, 403);
    const payload = (await response.json()) as { error: { code: string } };
    assert.equal(payload.error.code, "TWILIO_SIGNATURE_INVALID");
  });

  it("returns 403 TWILIO_SIGNATURE_CONFIG_MISSING without signature header", async () => {
    const started = await startWebhookServer();
    server = started.server;

    const body = new URLSearchParams(sampleTwilioParams).toString();
    const response = await fetch(`${started.baseUrl}/api/webhooks/twilio/whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    assert.equal(response.status, 403);
    const payload = (await response.json()) as { error: { code: string } };
    assert.equal(payload.error.code, "TWILIO_SIGNATURE_CONFIG_MISSING");
  });

  it("uses TWILIO_WEBHOOK_URL instead of the request host", async () => {
    const started = await startWebhookServer((_authToken, signature, url, params) => {
      assert.equal(url, WEBHOOK_URL);
      assert.equal(url.includes("127.0.0.1"), false);
      return twilio.validateRequest(AUTH_TOKEN, signature, url, params);
    });
    server = started.server;

    const body = new URLSearchParams({ ...sampleTwilioParams, Body: "Host check" }).toString();
    const signature = buildSignature({ ...sampleTwilioParams, Body: "Host check" });

    const response = await fetch(`${started.baseUrl}/api/webhooks/twilio/whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Twilio-Signature": signature,
      },
      body,
    });

    assert.equal(response.status, 200);
  });
});
