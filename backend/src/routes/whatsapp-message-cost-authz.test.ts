import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { Request, Response, NextFunction } from "express";

describe("whatsapp message cost observability authz", () => {
  it("rejects non-platform admin via requirePlatformAdmin (shared gate)", async () => {
    mock.reset();
    const { userRepository } = await import("../repositories/user.repository");
    mock.method(userRepository, "findById", async () => ({
      id: "u1",
      active: true,
      isPlatformAdmin: false,
      companyId: "c1",
    }));
    const { requirePlatformAdmin } = await import("../middleware/require-platform-admin");
    const req = { auth: { userId: "u1" } } as unknown as Request;
    let statusCode = 0;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    } as unknown as Response;
    let nextCalled = false;
    await requirePlatformAdmin(req, res, (() => {
      nextCalled = true;
    }) as NextFunction);
    assert.equal(statusCode, 403);
    assert.equal(nextCalled, false);
  });
});
