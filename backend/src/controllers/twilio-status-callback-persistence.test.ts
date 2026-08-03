import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { Request, Response } from "express";

describe("twilio status callback persistence semantics", () => {
  it("returns 503 when recordProviderStatus throws", async () => {
    mock.reset();
    const { env } = await import("../config/env");
    Object.assign(env, { WHATSAPP_TWILIO_STATUS_CALLBACK_ENABLED: true });

    const { whatsappFlowTraceService } = await import("../services/whatsapp-flow-trace.service");
    mock.method(whatsappFlowTraceService, "recordProviderStatus", async () => {
      throw new Error("SQL_DOWN");
    });

    const { twilioWebhookController } = await import("../controllers/twilio-webhook.controller");
    const req = {
      body: { MessageSid: "SM1", MessageStatus: "delivered" },
    } as Request;

    let statusCode = 0;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json() {
        return this;
      },
      end() {
        return this;
      },
    } as unknown as Response;

    await twilioWebhookController.handleWhatsAppStatus(req, res);
    assert.equal(statusCode, 503);
  });

  it("returns 204 when persistence succeeds", async () => {
    mock.reset();
    const { env } = await import("../config/env");
    Object.assign(env, { WHATSAPP_TWILIO_STATUS_CALLBACK_ENABLED: true });

    const { whatsappFlowTraceService } = await import("../services/whatsapp-flow-trace.service");
    mock.method(whatsappFlowTraceService, "recordProviderStatus", async () => ({
      created: true,
      messageId: "m1",
    }));

    const { twilioWebhookController } = await import("../controllers/twilio-webhook.controller");
    const req = {
      body: { MessageSid: "SM2", MessageStatus: "failed", ErrorCode: "30001" },
    } as Request;

    let statusCode = 0;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json() {
        return this;
      },
      end() {
        return this;
      },
    } as unknown as Response;

    await twilioWebhookController.handleWhatsAppStatus(req, res);
    assert.equal(statusCode, 204);
  });
});
