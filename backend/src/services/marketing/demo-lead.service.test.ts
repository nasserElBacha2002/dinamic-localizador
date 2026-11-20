import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";

setupUnitTestEnv();

import { AppError } from "../../errors/app-error";
import {
  marketingDemoLeadMailer,
  marketingDemoLeadService,
  fingerprint,
} from "./demo-lead.service";
import {
  resetRateLimitBucketsForTests,
  setRateLimitStoreForTests,
} from "../../middleware/rate-limit";
import { createMemoryRateLimitStore } from "../rate-limit-store";
import type { MarketingDemoRequestInput } from "../../schemas/marketing-demo.schema";

const baseLead: MarketingDemoRequestInput = {
  fullName: "Ana Demo",
  company: "Empresa QA",
  email: "retry@example.com",
  employeeRange: "26-100",
  companyWebsite: "",
};

describe("marketingDemoLeadService dedup and delivery", () => {
  afterEach(() => {
    mock.reset();
    resetRateLimitBucketsForTests();
    setRateLimitStoreForTests(null);
  });

  it("allows retry after definitive SMTP failure", async () => {
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
        messageId: "ok",
        transport: "smtp" as const,
        publicErrorCode: null,
      };
    });

    await assert.rejects(() => marketingDemoLeadService.submit(baseLead), /No pudimos enviar/);

    const result = await marketingDemoLeadService.submit(baseLead);
    assert.equal(result.delivered, true);
    assert.equal(attempts, 2);
  });

  it("blocks duplicate fingerprint after successful delivery", async () => {
    mock.method(marketingDemoLeadMailer, "send", async () => ({
      sent: true,
      messageId: "dup",
      transport: "smtp" as const,
      publicErrorCode: null,
    }));

    await marketingDemoLeadService.submit({
      ...baseLead,
      email: "dedup-service@example.com",
    });
    await assert.rejects(
      () =>
        marketingDemoLeadService.submit({
          ...baseLead,
          email: "dedup-service@example.com",
        }),
      (error: unknown) =>
        error instanceof AppError && error.code === "MARKETING_DEMO_DUPLICATE",
    );
  });

  it("serializes concurrent attempts across a shared rate-limit store", async () => {
    const shared = createMemoryRateLimitStore();
    setRateLimitStoreForTests(shared);

    let sendCount = 0;
    mock.method(marketingDemoLeadMailer, "send", async () => {
      sendCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return {
        sent: true,
        messageId: "shared",
        transport: "smtp" as const,
        publicErrorCode: null,
      };
    });

    const lead = { ...baseLead, email: "shared-store@example.com", company: "Shared Co" };
    const results = await Promise.allSettled([
      marketingDemoLeadService.submit(lead),
      marketingDemoLeadService.submit(lead),
    ]);

    const fulfilled = results.filter((item) => item.status === "fulfilled");
    const rejected = results.filter((item) => item.status === "rejected");
    assert.equal(fulfilled.length + rejected.length, 2);
    assert.equal(sendCount, 1);
  });

  it("keeps dedup after uncertain SMTP throw and blocks immediate retry", async () => {
    let attempts = 0;
    mock.method(marketingDemoLeadMailer, "send", async () => {
      attempts += 1;
      throw new Error("ETIMEDOUT connection to smtp.hostinger.com");
    });

    await assert.rejects(
      () => marketingDemoLeadService.submit({ ...baseLead, email: "uncertain@example.com" }),
      (error: unknown) =>
        error instanceof AppError && error.code === "MARKETING_DEMO_DELIVERY_UNCERTAIN",
    );

    await assert.rejects(
      () => marketingDemoLeadService.submit({ ...baseLead, email: "uncertain@example.com" }),
      (error: unknown) =>
        error instanceof AppError && error.code === "MARKETING_DEMO_DUPLICATE",
    );
    assert.equal(attempts, 1);
  });

  it("rejects transport mismatch even when sent=true", async () => {
    mock.method(marketingDemoLeadMailer, "send", async () => ({
      sent: true,
      messageId: "weird",
      transport: "console" as const,
      publicErrorCode: null,
    }));

    await assert.rejects(
      () => marketingDemoLeadService.submit({ ...baseLead, email: "transport@example.com" }),
      (error: unknown) =>
        error instanceof AppError && error.code === "MARKETING_DEMO_DELIVERY_FAILED",
    );
  });
});

describe("fingerprint", () => {
  it("is stable for the same normalized payload", () => {
    const a = fingerprint({ ...baseLead, email: "User@Example.com" });
    const b = fingerprint({ ...baseLead, email: "user@example.com" });
    assert.equal(a, b);
  });
});