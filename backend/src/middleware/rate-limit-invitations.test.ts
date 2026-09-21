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

async function runLimiter(
  limiter: ReturnType<typeof rateLimitInvitations>,
  req: Request,
  res: ReturnType<typeof mockRes>,
): Promise<"next" | "halted"> {
  return await new Promise((resolve) => {
    let settled = false;
    limiter(req, res as unknown as Response, () => {
      settled = true;
      resolve("next");
    });
    setTimeout(() => {
      if (!settled) {
        resolve("halted");
      }
    }, 50);
  });
}

describe("rateLimitInvitations", () => {
  it("uses req.ip and ignores spoofed x-forwarded-for", async () => {
    resetInvitationRateLimitBucketsForTests();
    const limiter = rateLimitInvitations({ scope: "test-spoof", windowMs: 60_000, max: 1 });

    assert.equal(await runLimiter(limiter, mockReq("1.1.1.1"), mockRes()), "next");

    const limited = mockRes();
    assert.equal(await runLimiter(limiter, mockReq("1.1.1.1"), limited), "halted");
    assert.equal(limited.statusCode, 429);
    assert.ok(limited.headers["retry-after"]);

    assert.equal(await runLimiter(limiter, mockReq("2.2.2.2"), mockRes()), "next");
  });
});
