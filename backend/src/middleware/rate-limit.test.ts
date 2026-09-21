import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { describe, it } from "node:test";
import {
  createRateLimiter,
  resetRateLimitBucketsForTests,
  setRateLimitStoreForTests,
} from "../middleware/rate-limit";
import { createMemoryRateLimitStore } from "../services/rate-limit-store";

function mockReq(ip: string, email?: string): Request {
  return {
    ip,
    socket: { remoteAddress: ip },
    headers: { "x-forwarded-for": "9.9.9.9" },
    body: email ? { email } : {},
  } as unknown as Request;
}

function mockRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: unknown;
  return {
    headers,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  };
}

async function runLimiter(
  limiter: ReturnType<typeof createRateLimiter>,
  req: Request,
  res: ReturnType<typeof mockRes>,
): Promise<"next" | "halted"> {
  return await new Promise((resolve) => {
    let settled = false;
    limiter(req, res as unknown as Response, () => {
      settled = true;
      resolve("next");
    });
    // Allow async store to settle if it halted without calling next.
    setTimeout(() => {
      if (!settled) {
        resolve("halted");
      }
    }, 50);
  });
}

describe("createRateLimiter", () => {
  it("uses req.ip and ignores spoofed x-forwarded-for", async () => {
    resetRateLimitBucketsForTests();
    const limiter = createRateLimiter({ scope: "test-spoof", windowMs: 60_000, max: 1 });

    assert.equal(await runLimiter(limiter, mockReq("1.1.1.1"), mockRes()), "next");

    const limited = mockRes();
    assert.equal(await runLimiter(limiter, mockReq("1.1.1.1"), limited), "halted");
    assert.equal(limited.statusCode, 429);
    assert.ok(limited.headers["retry-after"]);

    assert.equal(await runLimiter(limiter, mockReq("2.2.2.2"), mockRes()), "next");
  });

  it("can key by email independently of IP", async () => {
    resetRateLimitBucketsForTests();
    const limiter = createRateLimiter({
      scope: "test-email",
      windowMs: 60_000,
      max: 1,
      key: (req) => `email:${String((req.body as { email?: string }).email ?? "")}`,
    });

    assert.equal(
      await runLimiter(limiter, mockReq("1.1.1.1", "a@example.com"), mockRes()),
      "next",
    );
    const limited = mockRes();
    assert.equal(
      await runLimiter(limiter, mockReq("9.9.9.9", "a@example.com"), limited),
      "halted",
    );
    assert.equal(limited.statusCode, 429);

    assert.equal(
      await runLimiter(limiter, mockReq("1.1.1.1", "b@example.com"), mockRes()),
      "next",
    );
  });

  it("shares bucket across logical instances when using the same store", async () => {
    const shared = createMemoryRateLimitStore();
    setRateLimitStoreForTests(shared);
    const limiterA = createRateLimiter({ scope: "shared", windowMs: 60_000, max: 2 });
    const limiterB = createRateLimiter({ scope: "shared", windowMs: 60_000, max: 2 });

    assert.equal(await runLimiter(limiterA, mockReq("1.1.1.1"), mockRes()), "next");
    assert.equal(await runLimiter(limiterB, mockReq("1.1.1.1"), mockRes()), "next");
    const limited = mockRes();
    assert.equal(await runLimiter(limiterA, mockReq("1.1.1.1"), limited), "halted");
    assert.equal(limited.statusCode, 429);

    resetRateLimitBucketsForTests();
  });
});
