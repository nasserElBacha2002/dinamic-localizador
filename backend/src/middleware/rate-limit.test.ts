import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { describe, it } from "node:test";
import { createRateLimiter, resetRateLimitBucketsForTests } from "../middleware/rate-limit";

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

describe("createRateLimiter", () => {
  it("uses req.ip and ignores spoofed x-forwarded-for", () => {
    resetRateLimitBucketsForTests();
    const limiter = createRateLimiter({ scope: "test-spoof", windowMs: 60_000, max: 1 });

    let nextCount = 0;
    const next = () => {
      nextCount += 1;
    };

    limiter(mockReq("1.1.1.1"), mockRes() as unknown as Response, next);
    assert.equal(nextCount, 1);

    const limited = mockRes();
    limiter(mockReq("1.1.1.1"), limited as unknown as Response, next);
    assert.equal(limited.statusCode, 429);
    assert.ok(limited.headers["retry-after"]);

    limiter(mockReq("2.2.2.2"), mockRes() as unknown as Response, next);
    assert.equal(nextCount, 2);
  });

  it("can key by email independently of IP", () => {
    resetRateLimitBucketsForTests();
    const limiter = createRateLimiter({
      scope: "test-email",
      windowMs: 60_000,
      max: 1,
      key: (req) => `email:${String((req.body as { email?: string }).email ?? "")}`,
    });

    let nextCount = 0;
    const next = () => {
      nextCount += 1;
    };

    limiter(mockReq("1.1.1.1", "a@example.com"), mockRes() as unknown as Response, next);
    const limited = mockRes();
    limiter(mockReq("9.9.9.9", "a@example.com"), limited as unknown as Response, next);
    assert.equal(limited.statusCode, 429);

    limiter(mockReq("1.1.1.1", "b@example.com"), mockRes() as unknown as Response, next);
    assert.equal(nextCount, 2);
  });
});
