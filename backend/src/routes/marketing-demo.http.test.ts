import assert from "node:assert/strict";
import { after, afterEach, before, describe, it, mock } from "node:test";
import express from "express";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

const validBody = {
  fullName: "Ana Demo",
  company: "Empresa QA",
  email: "lead.qa@example.com",
  employeeRange: "26-100",
  phone: "+54 11 5555-0100",
  serviceLocations: "CABA",
  companyWebsite: "",
};

describe("marketing demo HTTP", () => {
  let baseUrl = "";
  let close: (() => Promise<void>) | null = null;
  let marketingDemoRouter: typeof import("./marketing-demo.routes").marketingDemoRouter;
  let marketingDemoLeadMailer: typeof import("../services/marketing/demo-lead.service").marketingDemoLeadMailer;
  let marketingDemoLeadService: typeof import("../services/marketing/demo-lead.service").marketingDemoLeadService;
  let errorHandler: typeof import("../middleware/error-handler").errorHandler;
  let resetRateLimitBucketsForTests: typeof import("../middleware/rate-limit").resetRateLimitBucketsForTests;
  let apiRequest: typeof import("../test-helpers/http-test").apiRequest;
  let startTestServer: typeof import("../test-helpers/http-test").startTestServer;

  before(async () => {
    ({ marketingDemoRouter } = await import("./marketing-demo.routes.js"));
    ({ marketingDemoLeadMailer, marketingDemoLeadService } = await import(
      "../services/marketing/demo-lead.service.js"
    ));
    ({ errorHandler } = await import("../middleware/error-handler.js"));
    ({ resetRateLimitBucketsForTests } = await import("../middleware/rate-limit.js"));
    ({ apiRequest, startTestServer } = await import("../test-helpers/http-test.js"));

    resetRateLimitBucketsForTests();
    const app = express();
    app.use(express.json());
    app.use("/api/marketing", marketingDemoRouter);
    app.use(errorHandler);
    const started = await startTestServer(app);
    baseUrl = started.baseUrl;
    close = started.close;
  });

  after(async () => {
    if (close) {
      await close();
    }
  });

  afterEach(() => {
    mock.reset();
    resetRateLimitBucketsForTests();
  });

  it("rejects invalid payloads", async () => {
    const response = await apiRequest(baseUrl, "/api/marketing/demo-requests", {
      method: "POST",
      body: { ...validBody, email: "not-an-email" },
    });
    assert.equal(response.status, 400);
  });

  it("rejects unknown JSON properties", async () => {
    const response = await apiRequest(baseUrl, "/api/marketing/demo-requests", {
      method: "POST",
      body: { ...validBody, extraField: "surprise" },
    });
    assert.equal(response.status, 400);
  });

  it("allows retry after SMTP failure for the same payload", async () => {
    let attempts = 0;
    mock.method(marketingDemoLeadMailer, "send", async () => {
      attempts += 1;
      if (attempts === 1) {
        return {
          sent: false,
          messageId: null,
          transport: "console" as const,
          publicErrorCode: "EMAIL_CONSOLE_NOT_DELIVERED",
        };
      }
      return {
        sent: true,
        messageId: "retry-http",
        transport: "smtp" as const,
        publicErrorCode: null,
      };
    });

    const body = { ...validBody, email: "retry-http@example.com" };
    const failed = await apiRequest(baseUrl, "/api/marketing/demo-requests", {
      method: "POST",
      body,
    });
    assert.equal(failed.status, 502);

    const success = await apiRequest(baseUrl, "/api/marketing/demo-requests", {
      method: "POST",
      body,
    });
    assert.equal(success.status, 200);
    assert.equal(attempts, 2);
  });

  it("returns 502 when sent=true but transport is not smtp", async () => {
    mock.method(marketingDemoLeadMailer, "send", async () => ({
      sent: true,
      messageId: "bogus",
      transport: "console" as const,
      publicErrorCode: null,
    }));

    const response = await apiRequest(baseUrl, "/api/marketing/demo-requests", {
      method: "POST",
      body: { ...validBody, email: "bogus-transport@example.com" },
    });
    assert.equal(response.status, 502);
  });

  it("returns 503 and holds dedup when SMTP throws", async () => {
    let attempts = 0;
    mock.method(marketingDemoLeadMailer, "send", async () => {
      attempts += 1;
      throw new Error("socket disconnect");
    });

    const body = { ...validBody, email: "smtp-throw@example.com" };
    const uncertain = await apiRequest(baseUrl, "/api/marketing/demo-requests", {
      method: "POST",
      body,
    });
    assert.equal(uncertain.status, 503);
    const uncertainPayload = uncertain.body as { error?: { code?: string } };
    assert.equal(uncertainPayload.error?.code, "MARKETING_DEMO_DELIVERY_UNCERTAIN");

    const duplicate = await apiRequest(baseUrl, "/api/marketing/demo-requests", {
      method: "POST",
      body,
    });
    assert.equal(duplicate.status, 409);
    assert.equal(attempts, 1);
  });

  it("returns 502 when SMTP does not accept the message", async () => {
    mock.method(marketingDemoLeadMailer, "send", async () => ({
      sent: false,
      messageId: null,
      transport: "console" as const,
      publicErrorCode: "EMAIL_CONSOLE_NOT_DELIVERED",
    }));

    const response = await apiRequest(baseUrl, "/api/marketing/demo-requests", {
      method: "POST",
      body: { ...validBody, email: "smtp-fail@example.com" },
    });
    assert.equal(response.status, 502);
    const payload = response.body as { error?: { code?: string } };
    assert.equal(payload.error?.code, "MARKETING_DEMO_DELIVERY_FAILED");
  });

  it("returns success only when SMTP accepts delivery", async () => {
    const sendMock = mock.method(marketingDemoLeadMailer, "send", async (input) => {
      assert.match(input.to, /@/);
      assert.doesNotMatch(input.to, /nasseramelbacha6@gmail/i);
      return {
        sent: true,
        messageId: "msg-1",
        transport: "smtp" as const,
        publicErrorCode: null,
      };
    });

    const response = await apiRequest(baseUrl, "/api/marketing/demo-requests", {
      method: "POST",
      body: { ...validBody, email: "smtp-ok@example.com" },
    });
    assert.equal(response.status, 200);
    const payload = response.body as { data?: { delivered?: boolean; message?: string } };
    assert.equal(payload.data?.delivered, true);
    assert.match(payload.data?.message ?? "", /Recibimos tu solicitud/i);
    assert.equal(sendMock.mock.callCount(), 1);
  });

  it("deduplicates identical leads in the dedup window", async () => {
    mock.method(marketingDemoLeadMailer, "send", async () => ({
      sent: true,
      messageId: "msg-dedup",
      transport: "smtp" as const,
      publicErrorCode: null,
    }));

    const first = await apiRequest(baseUrl, "/api/marketing/demo-requests", {
      method: "POST",
      body: { ...validBody, email: "dedup@example.com" },
    });
    assert.equal(first.status, 200);

    const second = await apiRequest(baseUrl, "/api/marketing/demo-requests", {
      method: "POST",
      body: { ...validBody, email: "dedup@example.com" },
    });
    assert.equal(second.status, 409);
  });

  it("accepts honeypot submissions without calling SMTP", async () => {
    const sendMock = mock.method(marketingDemoLeadMailer, "send", async () => {
      throw new Error("should not send for honeypot");
    });

    const response = await apiRequest(baseUrl, "/api/marketing/demo-requests", {
      method: "POST",
      body: { ...validBody, email: "bot@example.com", companyWebsite: "https://spam.invalid" },
    });
    assert.equal(response.status, 200);
    assert.equal(sendMock.mock.callCount(), 0);
  });

  it("rate-limits repeated submissions by email", async () => {
    mock.method(marketingDemoLeadMailer, "send", async () => ({
      sent: true,
      messageId: "msg-rl",
      transport: "smtp" as const,
      publicErrorCode: null,
    }));

    const email = "rate.limit@example.com";
    let lastStatus = 0;
    for (let index = 0; index < 5; index += 1) {
      const response = await apiRequest(baseUrl, "/api/marketing/demo-requests", {
        method: "POST",
        body: {
          ...validBody,
          email,
          company: `Empresa RL ${index}`,
          fullName: `Persona ${index}`,
        },
      });
      lastStatus = response.status;
    }
    assert.equal(lastStatus, 429);
  });

  it("coalesces concurrent duplicate in-flight requests", async () => {
    let resolveSend: (() => void) | null = null;
    const sendGate = new Promise<void>((resolve) => {
      resolveSend = resolve;
    });

    const sendMock = mock.method(marketingDemoLeadMailer, "send", async () => {
      await sendGate;
      return {
        sent: true,
        messageId: "msg-concurrent",
        transport: "smtp" as const,
        publicErrorCode: null,
      };
    });

    const body = { ...validBody, email: "concurrent@example.com", company: "Concurrent Co" };
    const first = marketingDemoLeadService.submit(body);
    const second = marketingDemoLeadService.submit(body);
    resolveSend?.();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.delivered, true);
    assert.equal(b.delivered, true);
    assert.equal(sendMock.mock.callCount(), 1);
  });
});