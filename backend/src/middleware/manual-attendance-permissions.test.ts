import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";
import { describe, it } from "node:test";
import { requireAnyPermission, requirePermission } from "./company-context";

function runGuard(
  guard: (req: Request, res: Response, next: NextFunction) => void,
  permissions: Set<string>,
): { statusCode: number; body: unknown; nextCalled: boolean } {
  let statusCode = 200;
  let body: unknown;
  let nextCalled = false;
  const req = { permissions } as unknown as Request;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  } as unknown as Response;

  guard(req, res, (() => {
    nextCalled = true;
  }) as NextFunction);

  return { statusCode, body, nextCalled };
}

describe("manual attendance permission gates", () => {
  it("authorized manual_create may proceed", () => {
    const result = runGuard(
      requirePermission("attendance:manual_create"),
      new Set(["attendance:manual_create"]),
    );
    assert.equal(result.nextCalled, true);
    assert.equal(result.statusCode, 200);
  });

  it("unauthorized user cannot perform manual override", () => {
    const result = runGuard(
      requirePermission("attendance:manual_create"),
      new Set(["attendance:read"]),
    );
    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 403);
    assert.equal((result.body as { error: { code: string } }).error.code, "FORBIDDEN");
  });

  it("manual preview allows manual_create or manual_edit", () => {
    const ok = runGuard(
      requireAnyPermission("attendance:manual_create", "attendance:manual_edit"),
      new Set(["attendance:manual_edit"]),
    );
    assert.equal(ok.nextCalled, true);

    const denied = runGuard(
      requireAnyPermission("attendance:manual_create", "attendance:manual_edit"),
      new Set(["attendance:read"]),
    );
    assert.equal(denied.nextCalled, false);
    assert.equal(denied.statusCode, 403);
  });
});
