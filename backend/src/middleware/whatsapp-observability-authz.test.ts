import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { Request, Response, NextFunction } from "express";

describe("requirePlatformAdmin observability authz", () => {
  it("returns 401 when auth is missing", async () => {
    mock.reset();
    const { requirePlatformAdmin } = await import("./require-platform-admin");
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
    await requirePlatformAdmin(req, res, (() => {
      nextCalled = true;
    }) as NextFunction);
    assert.equal(statusCode, 401);
    assert.equal(nextCalled, false);
    assert.deepEqual(payload, {
      error: { code: "UNAUTHORIZED", message: "Autenticación requerida." },
    });
  });

  it("returns 403 for authenticated company admin (non-platform)", async () => {
    mock.reset();
    const { userRepository } = await import("../repositories/user.repository");
    mock.method(userRepository, "findById", async () => ({
      id: "u1",
      active: true,
      isPlatformAdmin: false,
      companyId: "c1",
    }));
    const { requirePlatformAdmin } = await import("./require-platform-admin");
    const req = { auth: { userId: "u1" } } as unknown as Request;
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
    await requirePlatformAdmin(req, res, (() => {
      nextCalled = true;
    }) as NextFunction);
    assert.equal(statusCode, 403);
    assert.equal(nextCalled, false);
    assert.equal(
      (payload as { error?: { code?: string } })?.error?.code,
      "PLATFORM_ADMIN_REQUIRED",
    );
  });

  it("calls next for platform admin", async () => {
    mock.reset();
    const { userRepository } = await import("../repositories/user.repository");
    mock.method(userRepository, "findById", async () => ({
      id: "u1",
      active: true,
      isPlatformAdmin: true,
      companyId: null,
    }));
    const { requirePlatformAdmin } = await import("./require-platform-admin");
    const req = { auth: { userId: "u1" } } as unknown as Request;
    let nextCalled = false;
    const res = {} as Response;
    await requirePlatformAdmin(req, res, (() => {
      nextCalled = true;
    }) as NextFunction);
    assert.equal(nextCalled, true);
  });
});
