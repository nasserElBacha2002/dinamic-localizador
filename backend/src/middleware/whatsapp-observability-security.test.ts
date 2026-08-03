import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Request, Response, NextFunction } from "express";
import { requirePlatformAdmin } from "./require-platform-admin";

describe("requirePlatformAdmin for observability", () => {
  it("returns 401 when auth is missing", async () => {
    const req = {} as Request;
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
    } as unknown as Response;

    let nextCalled = false;
    const next = (() => {
      nextCalled = true;
    }) as NextFunction;

    await requirePlatformAdmin(req, res, next);
    assert.equal(statusCode, 401);
    assert.equal(nextCalled, false);
    assert.deepEqual(payload, {
      error: { code: "UNAUTHORIZED", message: "Autenticación requerida." },
    });
  });
});
