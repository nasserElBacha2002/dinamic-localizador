import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import express from "express";
import { setupUnitTestEnv } from "../test-helpers/unit-test-env";

setupUnitTestEnv();

import { errorHandler } from "../middleware/error-handler";
import {
  createRateLimiter,
  resetRateLimitBucketsForTests,
  setRateLimitStoreForTests,
} from "../middleware/rate-limit";
import type { RateLimitStore } from "../services/rate-limit-store";
import { apiRequest, startTestServer } from "../test-helpers/http-test";

const failingStore: RateLimitStore = {
  async hit() {
    throw new Error("store_unavailable");
  },
};

describe("marketing demo rate limit store failure", () => {
  let baseUrl = "";
  let close: (() => Promise<void>) | null = null;

  afterEach(async () => {
    setRateLimitStoreForTests(null);
    resetRateLimitBucketsForTests();
    if (close) {
      await close();
      close = null;
    }
  });

  it("fail-closes with 503 when the limiter store is unavailable", async () => {
    setRateLimitStoreForTests(failingStore);

    const app = express();
    app.use(express.json());
    const limiter = createRateLimiter({
      scope: "marketing-demo-ip-test",
      windowMs: 60_000,
      max: 5,
    });
    app.post("/api/marketing/demo-requests", limiter, (_req, res) => {
      res.status(200).json({ data: { ok: true } });
    });
    app.use(errorHandler);

    const started = await startTestServer(app);
    baseUrl = started.baseUrl;
    close = started.close;

    const response = await apiRequest(baseUrl, "/api/marketing/demo-requests", {
      method: "POST",
      body: {},
    });
    assert.equal(response.status, 503);
    const payload = response.body as { error?: { code?: string } };
    assert.equal(payload.error?.code, "RATE_LIMIT_STORE_UNAVAILABLE");
  });
});