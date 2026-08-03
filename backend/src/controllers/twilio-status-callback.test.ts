import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Request, Response } from "express";
import { twilioWebhookController } from "../controllers/twilio-webhook.controller";

describe("twilio status callback controller", () => {
  it("rejects missing MessageSid/status", async () => {
    const req = { body: {} } as Request;
    let statusCode = 0;
    let payload: unknown = null;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: unknown) {
        payload = body;
        return this;
      },
      end() {
        return this;
      },
    } as unknown as Response;

    await twilioWebhookController.handleWhatsAppStatus(req, res);
    assert.equal(statusCode, 400);
    assert.deepEqual(payload, { error: "INVALID_STATUS_CALLBACK" });
  });
});
