import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { describe, it } from "node:test";
import {
  rateLimitInvitations,
  resetInvitationRateLimitBucketsForTests,
} from "../middleware/rate-limit-invitations";

function mockReq(ip: string): Request {
  return {
    ip,
    socket: { remoteAddress: ip },
    headers: { "x-forwarded-for": "9.9.9.9" },
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

describe("rateLimitInvitations", () => {
  it("uses req.ip and ignores spoofed x-forwarded-for", () => {
    resetInvitationRateLimitBucketsForTests();
    const limiter = rateLimitInvitations({ scope: "test-spoof", windowMs: 60_000, max: 1 });

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

    // Different Express IP must not share the spoofed header bucket.
    limiter(mockReq("2.2.2.2"), mockRes() as unknown as Response, next);
    assert.equal(nextCount, 2);
  });
});
